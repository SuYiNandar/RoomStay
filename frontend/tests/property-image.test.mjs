import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, overrides = {}, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: name => overrides[name] ?? require(name), ...globals });
  return loaded.exports;
}
function harness() {
  let failed = null;
  return load("../src/components/property-image.jsx", {
    react: { useState: () => [failed, value => { failed = value; }] },
    "next/image": { default: "next-image" },
  }).PropertyImage;
}
test("uploaded image failure becomes a neutral accessible fallback and another photo still loads", () => {
  const render = harness();
  const props = { src: "/uploads/listings/missing.jpg", alt: "uploaded-filename.jpg", fill: true };
  const image = render(props);
  assert.equal(image.props.src, props.src);
  image.props.onError();
  const fallback = render(props);
  assert.equal(fallback.props.role, "img");
  assert.equal(fallback.props["aria-label"], "Property photo unavailable");
  assert.equal(fallback.props.children, "Photo unavailable");
  assert.ok(fallback.props.className.includes("absolute inset-0"));
  assert.equal(render({ ...props, src: "/uploads/listings/another.jpg" }).props.src, "/uploads/listings/another.jpg");
});
test("seeded images keep their original URL and sizing", () => {
  const render = harness();
  const props = { src: "/images/home/cozy-condo.jpg", alt: "Cozy Condo", fill: true, sizes: "100vw", preload: true };
  const result = render(props);
  for (const key of Object.keys(props)) assert.equal(result.props[key], props[key]);
});
test("missing image has a fallback without issuing an invalid request", () => {
  assert.equal(harness()({ alt: "Missing", fill: true }).props.children, "Photo unavailable");
});
test("upload URLs use the browser rewrite and backend origin on the server; seeded URLs stay local", () => {
  const src = "/uploads/listings/photo.jpg";
  const server = load("../src/lib/api.js", {}, { process: { env: { INTERNAL_API_URL: "https://backend.example" } } });
  const browser = load("../src/lib/api.js", {}, { window: {} });
  assert.equal(server.publicImageUrl(src), `https://backend.example${src}`);
  assert.equal(browser.publicImageUrl(src), src);
  assert.equal(server.publicImageUrl("/images/home/cozy-condo.jpg"), "/images/home/cozy-condo.jpg");
  assert.equal(browser.publicImageUrl("/images/home/cozy-condo.jpg"), "/images/home/cozy-condo.jpg");
});
