import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, overrides = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: key => overrides[key] ?? require(key), FormData, Blob, Event, Headers, ...globals });
  return loaded.exports;
}
function actionHarness(respond) {
  const requests = [], events = [];
  const store = load("../src/lib/live-store.js");
  const actions = load("../src/lib/live-actions.js", {
    "@/lib/api": { api: async (path, init) => { requests.push({ path, ...init }); return respond?.(path, init) ?? { application: { id: "app" }, listing: { id: "property" }, booking: { id: "booking", status: "CANCELLED" }, bookings: [], report: { id: "report" } }; } },
    "@/lib/live": { rememberBooking: item => item },
    "@/lib/live-store": store,
  }, { window: { dispatchEvent: event => events.push(event.type) } });
  return { actions, requests, events, store };
}
test("listing and application actions submit actual multipart bytes", async () => {
  const { actions, requests } = actionHarness();
  const file = new File(["actual-file-bytes"], "photo.png", { type: "image/png" });
  await actions.liveSaveListing({ title: "Test", facilities: ["Wi-Fi"], keptPhotos: [{ src: "/uploads/listings/existing.png" }], files: [file] }, false);
  assert.ok(requests[0].body instanceof FormData);
  assert.equal(await requests[0].body.get("photos").text(), "actual-file-bytes");
  assert.deepEqual(JSON.parse(requests[0].body.get("keptPhotos")), ["/uploads/listings/existing.png"]);
  await actions.liveSubmitPartnerApplication({ fullName: "Applicant", idDocument: file, ownershipDocument: file });
  assert.equal(await requests[1].body.get("idDocument").text(), "actual-file-bytes");
  assert.equal(await requests[1].body.get("ownershipDocument").text(), "actual-file-bytes");
  await actions.liveSubmitListing("property");
  assert.equal(requests[2].method, "POST");
  assert.equal(requests[2].path, "/api/partner/listings/property/submit");
});
test("cancel, refund and report controls use existing API contracts and refresh events", async () => {
  const { actions, requests, events, store } = actionHarness();
  store.setLiveEnabled(true);
  await actions.liveCancelBooking("one");
  await actions.liveCancelBooking("two", true);
  await actions.liveRecordRefund("two", { status: "REFUNDED", amount: 500 });
  await actions.liveSubmitReport({ targetType: "PROPERTY", targetId: "property", reason: "Incorrect listing" });
  assert.deepEqual(requests.map(item => item.path), ["/api/bookings/one/cancel", "/api/partner/bookings/two/cancel", "/api/partner/bookings/two/refund", "/api/partner/bookings", "/api/reports"]);
  assert.equal(JSON.parse(requests[2].body).amount, 500);
  assert.ok(events.includes("roomstay:room-statuses-changed"));
  assert.ok(events.includes("roomstay:reports-changed"));
  assert.equal(store.readLive("reports")[0].id, "report");
});
test("private file fetch sends auth header, disables caching and rejects external URLs", async () => {
  let request;
  const api = load("../src/lib/api.js", {}, {
    process: { env: { NEXT_PUBLIC_API_URL: "https://api.example" } },
    window: { localStorage: { getItem: () => "private-token" } },
    fetch: async (url, init) => { request = { url, init }; return { ok: true, blob: async () => new Blob(["image"]) }; },
  });
  await api.apiBlob("/api/evidence/id/file");
  assert.equal(request.url, "/api/evidence/id/file");
  assert.equal(request.init.headers.authorization, "Bearer private-token");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.credentials, "omit");
  await assert.rejects(api.apiBlob("https://untrusted.example/file"), /Invalid private file/);
});
test("each API request uses the current token and bypasses shared caches", async () => {
  let token = "renter-token";
  const requests = [];
  const api = load("../src/lib/api.js", {}, {
    window: { localStorage: { getItem: () => token } },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    },
  });
  await api.api("/api/me");
  token = "partner-token";
  await api.api("/api/me");
  assert.deepEqual(requests.map(item => item.url), ["/api/me", "/api/me"]);
  assert.deepEqual(requests.map(item => item.init.headers.get("authorization")), ["Bearer renter-token", "Bearer partner-token"]);
  assert.ok(requests.every(item => item.init.cache === "no-store"));
  assert.ok(requests.every(item => item.init.credentials === "omit"));
});
function refreshHarness() {
  const store = load("../src/lib/live-store.js");
  store.setLiveEnabled(true);
  let token = "first", unblock;
  const barrier = new Promise(resolve => { unblock = resolve; });
  const paths = [];
  const live = load("../src/lib/live.js", {
    "@/lib/api": {
      authToken: () => token, publicImageUrl: src => src,
      api: async path => {
        paths.push(path); await barrier;
        return { bookings: [{ id: "booking", status: "ACTIVE", propertyId: "property", roomStatus: "RENTED" }], users: [{ id: "admin-only" }], listings: [], applications: [], conversations: [], notifications: [], reports: [{ id: "live-report", status: "OPEN" }], reviews: [], auditLogs: [] };
      },
    },
    "@/types/property": { propertyTypes: ["Condo"] }, "@/lib/live-store": store,
  });
  return { live, store, paths, unblock, changeToken: () => { token = "second"; } };
}
test("admin session fetches all bookings for dashboard counts", async () => {
  const h = refreshHarness();
  const pending = h.live.refreshLiveSession("admin", "ADMIN", false, { reset: false });
  h.unblock();
  assert.equal(await pending, true);
  assert.ok(h.paths.includes("/api/admin/bookings"));
  assert.ok(h.paths.includes("/api/admin/reports"));
  assert.equal(h.store.readLive("bookings")[0].status, "ACTIVE");
  assert.equal(h.store.readLive("users")[0].id, "admin-only");
  assert.equal(h.store.readLive("reports")[0].id, "live-report");
});

test("admin report pages read the live report snapshot when live mode is enabled", () => {
  const store = load("../src/lib/live-store.js");
  store.setLiveEnabled(true);
  store.writeLive("reports", [{ id: "live-report", status: "OPEN" }]);
  const reports = load("../src/lib/mock-reports.js", {
    "@/lib/live-store": store,
    "@/lib/mock-audit-logs": { recordMockAuditLog: () => {} },
    "@/lib/mock-notifications": { notifyMockReportUpdated: () => {} },
  });
  assert.equal(reports.readMockReports()[0].id, "live-report");
  store.setLiveEnabled(false);
});
test("in-flight refresh cannot restore private records after logout or replace a local mutation", async () => {
  for (const mutation of [h => h.store.setLiveEnabled(false), h => h.changeToken(), h => h.store.invalidateLiveRefresh()]) {
    const h = refreshHarness();
    const pending = h.live.refreshLiveSession("admin", "ADMIN", false, { reset: false });
    mutation(h); h.unblock();
    assert.equal(await pending, false);
    assert.equal(h.store.readLive("bookings").length, 0);
    assert.equal(h.store.readLive("users").length, 0);
  }
});
test("opening chat reuses the current session cache and otherwise makes one idempotent request", async () => {
  const cachedHarness = actionHarness();
  cachedHarness.store.setLiveEnabled(true);
  cachedHarness.store.writeLive("conversations", [{ id: "cached-conversation", propertyId: "property", renterUserId: "renter" }]);
  const cached = await cachedHarness.actions.liveOpenConversation("property", "renter");
  assert.equal(cached.id, "cached-conversation");
  assert.equal(cachedHarness.requests.length, 0);

  const conversation = { id: "new-conversation", propertyId: "property", renterUserId: "renter" };
  const createdHarness = actionHarness((path) => path === "/api/conversations"
    ? { conversation, messages: [{ id: "welcome-message", conversationId: conversation.id, senderId: "renter", text: "Hello", createdAt: new Date().toISOString() }] }
    : null);
  createdHarness.store.setLiveEnabled(true);
  const created = await createdHarness.actions.liveOpenConversation("property", "renter");
  assert.equal(created.id, "new-conversation");
  assert.deepEqual(createdHarness.requests.map(item => `${item.method} ${item.path}`), ["POST /api/conversations"]);
  assert.deepEqual(JSON.parse(createdHarness.requests[0].body), { propertyId: "property" });
  assert.equal(createdHarness.store.readLive("conversations")[0].id, "new-conversation");
  assert.equal(createdHarness.store.readLive("messages")[0].id, "welcome-message");
  assert.ok(createdHarness.events.includes("roomstay:messages-changed"));
});
test("each browsing session keeps its own token and a new tab starts without another tab's login", () => {
  const local = new Map();
  const tabs = [new Map()];
  let active = 0;
  const area = (store) => ({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  });
  const api = load("../src/lib/api.js", {}, {
    window: {
      get sessionStorage() { return area(tabs[active]); },
      get localStorage() { return area(local); },
    },
  });
  api.storeAuthToken("admin-token");
  assert.equal(api.authToken(), "admin-token");
  tabs.push(new Map());
  active = 1;
  api.storeAuthToken("renter-token");
  assert.equal(api.authToken(), "renter-token");
  active = 0;
  assert.equal(api.authToken(), "admin-token");
  tabs.push(new Map());
  active = 2;
  assert.equal(api.authToken(), null);
  active = 1;
  api.storeAuthToken(null);
  assert.equal(api.authToken(), null);
  assert.equal(local.has("roomstay.token"), false);
});

test("a legacy shared token moves into the current tab and is removed from shared storage", () => {
  const local = new Map([["roomstay.token", "legacy-admin"]]);
  const tab = new Map();
  const area = (store) => ({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  });
  const api = load("../src/lib/api.js", {}, {
    window: { sessionStorage: area(tab), localStorage: area(local) },
  });
  assert.equal(api.authToken(), "legacy-admin");
  assert.equal(tab.get("roomstay.token"), "legacy-admin");
  assert.equal(local.has("roomstay.token"), false);
});
