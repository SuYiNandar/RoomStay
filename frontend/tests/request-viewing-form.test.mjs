import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
class ApiError extends Error {}
function harness(send) {
  const state = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useEffect() {},
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = { current: initial };
      return state[i];
    },
  };
  const overrides = {
    react: hooks,
    "next/image": { default: "img" }, "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ replace() {} }) },
    "@/lib/mock-auth": { useMockAuth: () => ({ user: { id: "renter", fullName: "Renter" }, isReady: true }) },
    "@/lib/viewing-time": { todayDateString: () => "2026-11-01", viewingTimeOptions: [{ value: "10:00", label: "10:00 AM" }], formatViewingTime: value => value },
    "@/components/date-picker": { DatePicker: "date-picker" },
    "@/lib/format-date": { formatBookingDate: value => value },
    "@/lib/mock-bookings": { defaultRoomStatus: () => "AVAILABLE" },
    "@/lib/api": { ApiError },
    "@/lib/live-actions": { liveRequestViewing: send },
    "@/lib/live-store": { liveEnabled: () => true },
    "@/lib/mock-viewings": {},
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../src/components/request-viewing-form.jsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: key => overrides[key] ?? require(key) });
  function render() {
    cursor = 0;
    return loaded.exports.RequestViewingForm({ property: { id: "garden-house", title: "Garden House", availableNow: true, price: 15000 } });
  }
  const initial = render();
  find(initial, node => node.type === "date-picker").props.onChange("2026-11-28");
  find(initial, node => node.type === "select").props.onChange({ target: { value: "10:00" } });
  return { render };
}
function find(node, predicate) {
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) { const result = find(child, predicate); if (result) return result; }
}
const event = { preventDefault() {} };
test("viewing form sends once even before rerender and disables submit until completion", async () => {
  let resolve, calls = 0;
  const pending = new Promise(done => { resolve = done; });
  const h = harness(() => { calls++; return pending; });
  const submit = find(h.render(), node => node.type === "form").props.onSubmit;
  const first = submit(event);
  await submit(event);
  assert.equal(calls, 1);
  const button = find(h.render(), node => node.type === "button" && node.props.type === "submit");
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, "Sending request...");
  resolve({ id: "viewing", propertyTitle: "Garden House", viewingDate: "2026-11-28", viewingTime: "10:00" });
  await first;
  await submit(event);
  assert.equal(calls, 1);
  assert.ok(find(h.render(), node => node.props.children === "Viewing request sent"));
});
test("viewing form displays the exact backend conflict and allows retry", async () => {
  const message = "You already have a viewing request for this property at this date and time.";
  let calls = 0;
  const h = harness(async () => { calls++; throw new ApiError(message); });
  await find(h.render(), node => node.type === "form").props.onSubmit(event);
  const tree = h.render();
  assert.equal(find(tree, node => node.props.role === "alert").props.children, message);
  assert.equal(find(tree, node => node.type === "button" && node.props.type === "submit").props.disabled, false);
  await find(tree, node => node.type === "form").props.onSubmit(event);
  assert.equal(calls, 2);
});
