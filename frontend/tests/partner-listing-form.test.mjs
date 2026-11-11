import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
class ApiError extends Error {}
const event = { preventDefault() {} };
function find(node, predicate) {
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
function findAll(node, predicate, results = []) {
  if (!React.isValidElement(node)) return results;
  if (predicate(node)) results.push(node);
  for (const child of React.Children.toArray(node.props.children)) findAll(child, predicate, results);
  return results;
}
function harness({ save = async () => ({ id: "draft-1" }), submit = async () => ({ id: "draft-1", listingStatus: "PENDING_REVIEW" }) } = {}) {
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
  const saveCalls = [];
  const submitCalls = [];
  const pushed = [];
  const overrides = {
    react: hooks,
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push: path => pushed.push(path), replace() {} }) },
    "@/lib/api": { ApiError },
    "@/lib/live-actions": {
      liveSaveListing: (...args) => { saveCalls.push(args); return save(...args); },
      liveSubmitListing: (...args) => { submitCalls.push(args); return submit(...args); },
    },
    "@/lib/live-store": { liveEnabled: () => true },
    "@/lib/mock-auth": { useMockAuth: () => ({ user: { id: "partner", fullName: "Partner", isPartner: true }, isReady: true }) },
    "@/lib/property-location": { formatPropertyLocation: ({ area, province, location }) => [area?.trim(), province?.trim()].filter(Boolean).join(", ") || location },
    "@/lib/mock-listings": {
      createMockListingId: () => "mock-listing",
      findMockListingById: () => null,
      isMockListingEditable: () => true,
      saveMockListing() {},
      updateMockListing() {},
    },
    "@/types/property": {
      facilities: ["Wi-Fi"],
      propertyTypes: ["Condo", "Apartment", "Dormitory", "House", "Townhouse", "Duplex / Loft"],
      suitableForOptions: ["STUDENTS", "PROFESSIONALS", "FAMILIES"],
    },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../src/components/partner-listing-form.jsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module: loaded,
    exports: loaded.exports,
    require: key => overrides[key] ?? require(key),
    window: { setTimeout: callback => callback(), clearTimeout() {}, dispatchEvent() {} },
  });
  function render() {
    cursor = 0;
    return loaded.exports.PartnerListingForm({});
  }
  return { render, saveCalls, submitCalls, pushed };
}
function setInput(tree, placeholder, value) {
  const input = find(tree, node => (node.type === "input" || node.type === "textarea") && node.props.placeholder === placeholder);
  assert.ok(input, `missing field ${placeholder}`);
  input.props.onChange({ target: { value } });
}
function setNumberInput(tree, min, value) {
  const input = find(tree, node => node.type === "input" && node.props.type === "number" && node.props.min === min);
  assert.ok(input, `missing number input with min ${min}`);
  input.props.onChange({ target: { value } });
}
function fillCompleteListing(tree) {
  setInput(tree, "Cozy Condo Near BTS", "Sunny House");
  find(tree, node => node.type === "select").props.onChange({ target: { value: "House" } });
  setInput(tree, "Enter monthly rent, e.g. 8,500", "12000");
  setInput(tree, "117 Rangsit-Pathum Thani Rd, Prachathipat, Mueang Pathum Thani, Pathum Thani 12000", "1 Main Road");
  setInput(tree, "e.g. Rangsit, Ari, Asoke", "Ari");
  setInput(tree, "e.g. Bangkok, Pathum Thani", "Bangkok");
  setInput(tree, "Describe the property, nearby transport, and who it suits.", "A quiet house near the train.");
  setNumberInput(tree, "0", "1");
  setNumberInput(tree, "1", "1");
  const size = findAll(tree, node => node.type === "input" && node.props.placeholder === "30")[0];
  size.props.onChange({ target: { value: "30" } });
  const photos = find(tree, node => node.type === "input" && node.props.type === "file");
  photos.props.onChange({ target: { files: [{ name: "house.png", type: "image/png", size: 100 }] } });
}
function actions(tree) {
  return {
    form: find(tree, node => node.type === "form"),
    draft: find(tree, node => node.type === "button" && ["Save as Draft", "Saving..."].includes(node.props.children)),
    review: find(tree, node => node.type === "button" && ["Submit for Review", "Submitting..."].includes(node.props.children)),
  };
}
test("draft save allows a completely empty listing with no photos", async () => {
  let resolveSave;
  const pending = new Promise(resolve => { resolveSave = resolve; });
  const h = harness({ save: () => pending });
  const saved = actions(h.render()).form.props.onSubmit(event);
  assert.equal(h.saveCalls.length, 1);
  const input = h.saveCalls[0][0];
  assert.equal(input.title, "");
  assert.equal(input.propertyType, "");
  assert.equal(input.monthlyRent, 0);
  assert.equal(input.description, "");
  assert.equal(input.files.length, 0);
  assert.equal(input.keptPhotos.length, 0);
  const saving = actions(h.render());
  assert.equal(saving.draft.props.disabled, true);
  assert.equal(saving.draft.props.children, "Saving...");
  assert.equal(saving.review.props.disabled, true);
  resolveSave({ id: "draft-1" });
  await saved;
  assert.deepEqual(h.pushed, ["/partner/listings"]);
  assert.equal(h.submitCalls.length, 0);
});
test("draft save only rejects invalid values that were actually entered", async () => {
  const h = harness();
  const blankTree = h.render();
  await actions(blankTree).form.props.onSubmit(event);
  assert.equal(h.saveCalls.length, 1);
  setInput(blankTree, "Enter monthly rent, e.g. 8,500", "3000");
  await actions(h.render()).form.props.onSubmit(event);
  assert.equal(h.saveCalls.length, 1);
  assert.ok(find(h.render(), node => node.props.children === "Monthly rent must be at least ฿4,000."));
});
test("submit for review blocks incomplete listings before calling the API", async () => {
  const h = harness();
  const tree = h.render();
  await actions(tree).review.props.onClick();
  assert.equal(h.saveCalls.length, 0);
  assert.equal(h.submitCalls.length, 0);
  const rendered = h.render();
  assert.ok(find(rendered, node => node.props.children === "Property title is required."));
  assert.ok(find(rendered, node => node.props.children === "At least one photo is required."));
  assert.equal(actions(rendered).review.props.disabled, false);
});
test("submit for review saves once, submits the saved draft, then redirects", async () => {
  const h = harness();
  const tree = h.render();
  fillCompleteListing(tree);
  const ready = h.render();
  await actions(ready).review.props.onClick();
  assert.equal(h.saveCalls.length, 1);
  assert.equal(h.submitCalls.length, 1);
  assert.equal(h.submitCalls[0][0], "draft-1");
  assert.equal(h.saveCalls[0][0].title, "Sunny House");
  assert.equal(h.saveCalls[0][0].monthlyRent, 12000);
  assert.deepEqual(h.pushed, ["/partner/listings"]);
});
test("a failed submission is visible and retries the same saved draft", async () => {
  let submits = 0;
  const h = harness({
    save: async () => ({ id: "draft-42" }),
    submit: async () => {
      submits += 1;
      if (submits === 1) throw new ApiError("The listing could not be reviewed.");
      return { id: "draft-42", listingStatus: "PENDING_REVIEW" };
    },
  });
  const tree = h.render();
  fillCompleteListing(tree);
  const ready = h.render();
  await actions(ready).review.props.onClick();
  const failed = h.render();
  assert.equal(find(failed, node => node.props.role === "alert").props.children, "The listing could not be reviewed.");
  assert.deepEqual(h.pushed, []);
  await actions(failed).review.props.onClick();
  assert.equal(h.saveCalls.length, 2);
  assert.equal(h.saveCalls[1][0].id, "draft-42");
  assert.equal(h.submitCalls.length, 2);
  assert.deepEqual(h.pushed, ["/partner/listings"]);
});
test("the form blocks double clicks before React re-renders", async () => {
  let resolveSave;
  const pending = new Promise(resolve => { resolveSave = resolve; });
  const h = harness({ save: () => pending });
  const tree = h.render();
  const submit = actions(tree).form.props.onSubmit;
  const first = submit(event);
  await submit(event);
  assert.equal(h.saveCalls.length, 1);
  resolveSave({ id: "draft-1" });
  await first;
  assert.equal(h.saveCalls.length, 1);
});
test("draft save rejects unsupported or oversized photos without uploading", async () => {
  const h = harness();
  const tree = h.render();
  const photos = find(tree, node => node.type === "input" && node.props.type === "file");
  photos.props.onChange({ target: { files: [{ name: "house.gif", type: "image/gif", size: 100 }] } });
  await actions(h.render()).form.props.onSubmit(event);
  assert.equal(h.saveCalls.length, 0);
  assert.ok(find(h.render(), node => node.props.children === "Photos must be JPG, JPEG, or PNG images."));
  photos.props.onChange({ target: { files: [{ name: "house.png", type: "image/png", size: 9 * 1024 * 1024 }] } });
  await actions(h.render()).form.props.onSubmit(event);
  assert.equal(h.saveCalls.length, 0);
  assert.ok(find(h.render(), node => node.props.children === "Each photo must be 8 MB or smaller."));
});
