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
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: key => overrides[key] ?? require(key), FormData, Blob, Event, ...globals });
  return loaded.exports;
}
function actionHarness() {
  const requests = [], events = [];
  const store = load("../src/lib/live-store.js");
  const actions = load("../src/lib/live-actions.js", {
    "@/lib/api": { api: async (path, init) => { requests.push({ path, ...init }); return { application: { id: "app" }, listing: { id: "property" }, booking: { id: "booking", status: "CANCELLED" }, bookings: [], report: { id: "report" } }; } },
    "@/lib/live": { rememberBooking: item => item },
    "@/lib/live-store": store,
  }, { window: { dispatchEvent: event => events.push(event.type) } });
  return { actions, requests, events };
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
});
test("cancel, refund and report controls use existing API contracts and refresh events", async () => {
  const { actions, requests, events } = actionHarness();
  await actions.liveCancelBooking("one");
  await actions.liveCancelBooking("two", true);
  await actions.liveRecordRefund("two", { status: "REFUNDED", amount: 500 });
  await actions.liveSubmitReport({ targetType: "PROPERTY", targetId: "property", reason: "Incorrect listing" });
  assert.deepEqual(requests.map(item => item.path), ["/api/bookings/one/cancel", "/api/partner/bookings/two/cancel", "/api/partner/bookings/two/refund", "/api/partner/bookings", "/api/reports"]);
  assert.equal(JSON.parse(requests[2].body).amount, 500);
  assert.ok(events.includes("roomstay:room-statuses-changed"));
});
test("private file fetch sends auth header, disables caching and rejects external URLs", async () => {
  let request;
  const api = load("../src/lib/api.js", {}, {
    process: { env: { NEXT_PUBLIC_API_URL: "https://api.example" } },
    window: { localStorage: { getItem: () => "private-token" } },
    fetch: async (url, init) => { request = { url, init }; return { ok: true, blob: async () => new Blob(["image"]) }; },
  });
  await api.apiBlob("/api/evidence/id/file");
  assert.equal(request.url, "https://api.example/api/evidence/id/file");
  assert.equal(request.init.headers.authorization, "Bearer private-token");
  assert.equal(request.init.cache, "no-store");
  await assert.rejects(api.apiBlob("https://untrusted.example/file"), /Invalid private file/);
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
        return { bookings: [{ id: "booking", status: "ACTIVE", propertyId: "property", roomStatus: "RENTED" }], users: [{ id: "admin-only" }], listings: [], applications: [], conversations: [], notifications: [], reports: [], reviews: [], auditLogs: [] };
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
  assert.equal(h.store.readLive("bookings")[0].status, "ACTIVE");
  assert.equal(h.store.readLive("users")[0].id, "admin-only");
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
