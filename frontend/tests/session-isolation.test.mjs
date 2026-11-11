import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: name => overrides[name] ?? require(name) });
  return loaded.exports;
}

test("ending a live session clears all private records and room overrides", () => {
  const store = load("../src/lib/live-store.js");
  const buckets = ["bookings", "evidence", "reviews", "viewings", "favorites", "conversations", "messages", "notifications", "listings", "applications", "reports", "audits", "users"];
  store.setLiveEnabled(true);
  for (const bucket of buckets) store.writeLive(bucket, [{ id: "private-admin-record" }]);
  store.writeLiveRoomStatus("property", "RESERVED");
  store.setLiveEnabled(false);
  store.setLiveEnabled(true);
  for (const bucket of buckets) assert.equal(store.readLive(bucket).length, 0);
  assert.equal(store.readLiveRoomStatus("property"), undefined);
});

test("admin layout withholds private children while loading, logged out, or signed in as USER", () => {
  for (const state of [{ isReady: false, user: null }, { isReady: true, user: null }, { isReady: true, user: { role: "USER", isPartner: true } }, { isReady: true, user: { role: "ADMIN" } }]) {
    const { default: Layout } = load("../src/app/admin/layout.jsx", {
      "@/lib/mock-auth": { useMockAuth: () => state },
      "next/navigation": { usePathname: () => "/admin/users" },
    });
    const result = Layout({ children: "PRIVATE ADMIN CONTENT" });
    assert.equal(result === "PRIVATE ADMIN CONTENT", Boolean(state.isReady && state.user?.role === "ADMIN"));
  }
});
