import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("independent tokens keep concurrent sessions isolated", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "roomstay-auth-session-"));
  process.env.UPLOAD_DIR = path.join(dataDir, "uploads");
  const { ensureDatabase } = await import("../src/ensure-database.js");
  const database = await ensureDatabase({ forceEmbedded: true, dataDir, port: 0 });
  const { prisma } = await import("../src/db.js");
  const { seed } = await import("../prisma/seed.js");
  const { createApp } = await import("../src/app.js");
  await seed(prisma);
  const server = await new Promise((resolve) => {
    const listening = createApp().listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    await database.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function request(method, pathname, { token, cookie, body } = {}) {
    const response = await fetch(base + pathname, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null, headers: response.headers };
  }

  async function login(email) {
    const response = await request("POST", "/api/auth/login", { body: { email, password: "password123" } });
    assert.equal(response.status, 200);
    return {
      token: response.json.token,
      cookie: response.headers.get("set-cookie").split(";")[0],
      user: response.json.user,
    };
  }

  const [renter, partner, admin] = await Promise.all([
    login("renter@roomstay.test"),
    login("partner@roomstay.test"),
    login("admin@roomstay.test"),
  ]);
  const sessions = [renter, partner, admin];
  assert.deepEqual(sessions.map((session) => session.user.id), ["user-renter", "user-partner", "user-admin"]);
  assert.deepEqual(sessions.map((session) => session.user.isPartner), [false, true, false]);
  assert.deepEqual(sessions.map((session) => session.user.role), ["USER", "USER", "ADMIN"]);

  for (let round = 0; round < 10; round += 1) {
    const responses = await Promise.all(sessions.map((session) => request("GET", "/api/me", { token: session.token })));
    assert.deepEqual(responses.map((response) => response.json.user.id), ["user-renter", "user-partner", "user-admin"]);
    assert.deepEqual(responses.map((response) => response.json.user.isPartner), [false, true, false]);
    assert.deepEqual(responses.map((response) => response.json.user.role), ["USER", "USER", "ADMIN"]);
  }

  const freshPartner = await login("partner@roomstay.test");
  const renterAfterPartnerLogin = await request("GET", "/api/me", { token: renter.token });
  assert.equal(renterAfterPartnerLogin.json.user.id, "user-renter");
  assert.equal(renterAfterPartnerLogin.json.user.isPartner, false);
  assert.equal((await request("GET", "/api/me", { token: freshPartner.token })).json.user.id, "user-partner");

  const headerWins = await request("GET", "/api/me", {
    token: renter.token,
    cookie: partner.cookie,
  });
  assert.equal(headerWins.json.user.id, "user-renter");

  assert.equal((await request("GET", "/api/me")).status, 401);
  assert.equal((await request("GET", "/api/me", { token: "not-a-token" })).status, 401);
  assert.equal((await request("GET", "/api/admin/users", { token: renter.token })).status, 403);
  assert.equal((await request("GET", "/api/admin/users", { token: partner.token })).status, 403);
  assert.equal((await request("GET", "/api/admin/users", { token: admin.token })).status, 200);

  const authenticated = await request("GET", "/api/me", { token: renter.token });
  assert.match(authenticated.headers.get("cache-control") ?? "", /no-store/);
  assert.match(authenticated.headers.get("vary") ?? "", /Authorization/i);
  assert.match(authenticated.headers.get("vary") ?? "", /Cookie/i);

  const loggedOut = await request("POST", "/api/auth/logout", { token: partner.token });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.headers.get("set-cookie") ?? "", /roomstay_token=;.*Expires=Thu, 01 Jan 1970/);
  assert.equal((await request("GET", "/api/me", { token: renter.token })).json.user.id, "user-renter");
  assert.equal((await request("GET", "/api/me", { token: admin.token })).json.user.id, "user-admin");
});
