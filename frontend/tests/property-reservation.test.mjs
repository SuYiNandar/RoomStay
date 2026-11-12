// Run with: node --test tests/property-reservation.test.mjs
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
const requireDependency = createRequire(import.meta.url);
const storage = new Map();
let browserWindow;
let state;
let cursor;
let effects;
let navigations;
let pending;
const reactHooks = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = { current: initial };
    return state[index];
  },
  useEffect(callback) { effects.push(callback); },
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const base = path.resolve(sourceDirectory, relative);
  const file = [".js", ".jsx", ".ts", ".tsx"].map((ext) => `${base}${ext}`).find((candidate) => existsSync(candidate));
  const compiledModule = { exports: {} };
  cache.set(relative, compiledModule);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    module: compiledModule, exports: compiledModule.exports,
    get window() { return browserWindow; }, Event, crypto,
    require: (name) => {
      if (name === "react") return reactHooks;
      if (name === "next/navigation") return { useRouter: () => ({ push: (url) => navigations.push(url) }) };
      if (name === "@/lib/mock-auth") return { useMockAuth: () => ({ user: { id: "renter", fullName: "Renter" }, isReady: true, setPendingAction: (action) => pending.push(action) }) };
      return name.startsWith("@/") ? load(name.slice(2)) : requireDependency(name);
    },
  }, { filename: file });
  return compiledModule.exports;
}
const bookings = load("lib/mock-bookings");
const listings = load("lib/mock-listings");
const { ensureMockDemoSeed } = load("lib/mock-demo-seed");
const { PropertyActions } = load("components/property-actions");
const props = { propertyId: "cozy-condo", propertyTitle: "Cozy Condo", monthlyRent: "฿10,000", availableNow: true };
function renderActions() {
  cursor = 0; effects = [];
  return PropertyActions(props);
}
function button(element, label) {
  if (!React.isValidElement(element)) return undefined;
  if (element.type === "button" && element.props.children === label) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = button(child, label);
    if (found) return found;
  }
}
beforeEach(() => {
  storage.clear(); state = []; cursor = 0; effects = []; navigations = []; pending = [];
  browserWindow = Object.assign(new EventTarget(), {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: (callback) => { callback(); return 1; }, clearTimeout() {},
  });
});

test("reserved booking is disabled with helper text while Message and Request Viewing remain enabled", () => {
  bookings.setMockRoomStatus(props.propertyId, "RESERVED");
  let tree = renderActions();
  assert.equal(button(tree, "Request Booking").props.disabled, true); // Await storage status.
  effects.forEach((effect) => effect());
  tree = renderActions();
  const booking = button(tree, "Request Booking");
  assert.equal(booking.props.disabled, true);
  assert.ok(booking.props.className.includes("bg-gray-100"));
  assert.equal(booking.props["aria-describedby"], "reserved-booking-help");
  assert.ok(renderToStaticMarkup(tree).includes("Booking unavailable while reserved."));
  booking.props.onClick();
  assert.equal(navigations.length, 0);
  assert.equal(pending.length, 0);
  assert.ok(!button(tree, "Message").props.disabled);
  assert.equal(button(tree, "Request Viewing").props.disabled, false);
  button(tree, "Request Viewing").props.onClick();
  assert.equal(navigations[0], "/properties/cozy-condo/request-viewing");
});

test("status events update booking availability and fresh storage prevents a stale click", () => {
  renderActions(); effects.forEach((effect) => effect());
  let tree = renderActions();
  assert.equal(button(tree, "Request Booking").props.disabled, false);
  // Another tab may write before the storage event is received.
  storage.set(bookings.mockRoomStatusesKey, JSON.stringify({ [props.propertyId]: "RESERVED" }));
  button(tree, "Request Booking").props.onClick();
  assert.equal(navigations.length, 0);
  assert.equal(pending.length, 0);
  tree = renderActions();
  assert.equal(button(tree, "Request Booking").props.disabled, true);
  bookings.setMockRoomStatus(props.propertyId, "AVAILABLE");
  tree = renderActions();
  assert.equal(button(tree, "Request Booking").props.disabled, false);
  button(tree, "Request Booking").props.onClick();
  assert.equal(navigations[0], "/properties/cozy-condo/request-booking");
  bookings.setMockRoomStatus(props.propertyId, "UNAVAILABLE");
  tree = renderActions();
  assert.equal(button(tree, "Request Viewing").props.disabled, true);
  assert.equal(button(tree, "Request Booking").props.disabled, true);
});

test("Partner listing status is the fallback, with explicit room overrides and static catalog precedence preserved", () => {
  ensureMockDemoSeed();
  const listing = listings.findMockListingById("demo-listing-riverside");
  listings.updateMockListing({ ...listing, roomStatus: "RESERVED" });
  assert.equal(bookings.readMockRoomStatus(listing.id, "UNAVAILABLE"), "RESERVED");
  bookings.setMockRoomStatus(listing.id, "AVAILABLE");
  assert.equal(bookings.readMockRoomStatus(listing.id, "UNAVAILABLE"), "AVAILABLE");
  listings.saveMockListing({ ...listing, id: props.propertyId, roomStatus: "RESERVED" });
  assert.equal(bookings.readMockRoomStatus(props.propertyId, "AVAILABLE"), "AVAILABLE");
});
