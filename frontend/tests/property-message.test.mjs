import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const requireDependency = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/property-actions.jsx", import.meta.url), "utf8");
const props = { propertyId: "cozy-condo", propertyTitle: "Cozy Condo", monthlyRent: "฿10,000", availableNow: true };

class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiError";
  }
}

function find(node, predicate) {
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

function button(tree, label) {
  return find(tree, node => node.type === "button" && node.props.children === label);
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(openConversation) {
  const state = [];
  const calls = [];
  const navigations = [];
  const pendingActions = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
  };
  const overrides = {
    react: hooks,
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push: path => navigations.push(path) }) },
    "@/lib/mock-auth": {
      useMockAuth: () => ({
        user: { id: "renter", fullName: "Renter" },
        isReady: true,
        setPendingAction: action => pendingActions.push(action),
      }),
    },
    "@/lib/live-store": { liveEnabled: () => true },
    "@/lib/live-actions": {
      liveOpenConversation: (...args) => {
        calls.push(args);
        return openConversation(...args);
      },
      liveSetRoomAvailability: async () => undefined,
    },
    "@/lib/api": { ApiError },
    "@/lib/mock-bookings": {
      mockRoomStatusesChangedEvent: "roomstay:room-statuses-changed",
      defaultRoomStatus: availableNow => availableNow ? "AVAILABLE" : "UNAVAILABLE",
      readMockRoomStatus: (_propertyId, fallback) => fallback,
      roomStatusLabel: status => status,
      roomStatusMessage: () => "",
      setMockRoomStatus() {},
    },
    "@/lib/mock-listings": { mockListingsChangedEvent: "roomstay:listings-changed" },
    "@/lib/mock-messages": { getOrCreateMockConversation: () => ({ id: "mock-conversation" }) },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module: loaded,
    exports: loaded.exports,
    require: key => overrides[key] ?? requireDependency(key),
    window: { setTimeout: callback => { callback(); return 1; }, clearTimeout() {} },
    crypto,
    Date,
  });
  return {
    calls,
    navigations,
    pendingActions,
    render() {
      cursor = 0;
      return loaded.exports.PropertyActions(props);
    },
  };
}

test("Message immediately exposes its opening state, blocks a double click, and navigates once", async () => {
  let resolveConversation;
  const h = harness(() => new Promise(resolve => { resolveConversation = resolve; }));
  const tree = h.render();
  const message = button(tree, "Message");
  assert.ok(message);
  message.props.onClick();
  message.props.onClick();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], ["cozy-condo", "renter"]);

  const opening = h.render();
  const loading = button(opening, "Opening chat...");
  assert.ok(loading);
  assert.equal(loading.props.disabled, true);
  assert.equal(loading.props["aria-busy"], true);
  loading.props.onClick();
  assert.equal(h.calls.length, 1);

  resolveConversation({ id: "conversation/one" });
  await flush();
  assert.deepEqual(h.navigations, ["/messages/conversation%2Fone"]);
});

test("opening errors are visible, release the lock, and allow a retry", async () => {
  let attempts = 0;
  const h = harness(() => {
    attempts += 1;
    return attempts === 1
      ? Promise.reject(new ApiError("Conversation could not be opened."))
      : Promise.resolve({ id: "conversation-two" });
  });
  button(h.render(), "Message").props.onClick();
  await flush();
  const failed = h.render();
  assert.equal(find(failed, node => node.props.role === "alert").props.children, "Conversation could not be opened.");
  const retry = button(failed, "Message");
  assert.equal(retry.props.disabled, false);
  retry.props.onClick();
  await flush();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.navigations, ["/messages/conversation-two"]);
});
