// Run with: node --test tests/*.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { seed } from "../../backend/prisma/seed.js";
import { publicProperty } from "../../backend/src/serialize.js";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
const requireDependency = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const base = path.resolve(sourceDirectory, relative);
  const file = [".js", ".jsx"].map((ext) => `${base}${ext}`).find(existsSync);
  const compiled = { exports: {} };
  cache.set(relative, compiled);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, URLSearchParams,
    require: (name) => {
      if (name.endsWith(".module.css")) return { category: "category" };
      // Inspect the page's links without rendering unrelated client components.
      if (name.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => key });
      return name.startsWith("@/") ? load(name.slice(2)) : requireDependency(name);
    },
  }, { filename: file });
  return compiled.exports;
}
const { initialSearchFilters, filterProperties, searchFiltersQuery } = load("lib/search");
const { apiPropertyToProperty } = load("lib/live");
const { properties: fallbackProperties } = load("mocks/properties");
const records = new Map();
const db = {
  user: { async upsert() {} },
  partnerApplication: { async upsert() {} },
  property: {
    async findUnique({ where }) { return records.get(where.id); },
    async create({ data }) { records.set(data.id, { ...data, photos: data.photos.create }); },
    async update({ where, data }) { records.get(where.id).facilities.push(data.facilities.push); },
  },
};
await seed(db);
const seededProperties = [...records.values()].map((record) => apiPropertyToProperty(publicProperty(record)));
const ids = (properties) => Array.from(properties, (property) => property.id);
const fromUrl = (url) => initialSearchFilters(Object.fromEntries(new URL(url, "http://localhost:3000").searchParams));
const categories = [
  ["Pet friendly", "petFriendly", "garden-house"],
  ["Near University", "nearUniversity", "rangsit-campus-dorm"],
  ["Near BTS/MRT", "nearTransit", "cozy-condo"],
];
function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

for (const [label, flag, expected] of categories) {
  test(`/search?${flag}=true returns the expected seeded and fallback property`, () => {
    const filters = fromUrl(`/search?${flag}=true`);
    assert.equal(filters[flag], true);
    const results = filterProperties(seededProperties, filters);
    if (flag === "nearUniversity") {
      assert.deepEqual(ids(results).sort(), [expected, "rsu-area-apartment", "rsu-campus-studio", "rsu-university-dormitory", "bu-rangsit-condo", "bu-campus-apartment", "bu-university-view-house"].sort());
      assert.equal(results.filter(item => item.location.includes("Rangsit University")).length, 3);
      assert.equal(results.filter(item => item.location.includes("Bangkok University")).length, 3);
    } else assert.deepEqual(ids(results), [expected]);
    assert.deepEqual(ids(filterProperties(fallbackProperties, filters)), [expected]);
  });

  test(`Home category ${label} links to its search URL`, () => {
    const tree = load("app/page").default();
    const link = descendants(tree).find((element) => element.props.href === `/search?${flag}=true`);
    assert.ok(link);
    assert.equal(link.type, requireDependency("next/link").default);
    assert.ok(React.Children.toArray(link.props.children).includes(label));
    assert.equal(link.props.className, "category");
  });

  test(`${flag} is disabled unless its URL value is exactly true`, () => {
    for (const value of [undefined, "false", "", "TRUE", "1", ["true"]]) {
      const filters = initialSearchFilters({ [flag]: value });
      assert.equal(filters[flag], false);
      assert.deepEqual(ids(filterProperties(seededProperties, filters)), ids(seededProperties));
    }
  });
}

for (const type of ["Apartment", "Condo", "House", "Dormitory"]) {
  test(`/search?type=${type} still filters property types`, () => {
    const results = filterProperties(seededProperties, fromUrl(`/search?type=${type}`));
    assert.ok(results.length > 0);
    assert.deepEqual(ids(results), ids(seededProperties.filter((property) => property.propertyType === type)));
  });
}

test("studio listings keep zero bedrooms and display as Studio", () => {
  const { bedroomLabel } = load("lib/property-format");
  const filters = fromUrl("/search?bedrooms=0");
  const results = filterProperties(seededProperties, filters);
  assert.ok(results.length > 0);
  assert.ok(results.every((property) => property.bedrooms === 0));
  assert.ok(results.some((property) => property.id === "modern-studio"));
  assert.equal(bedroomLabel(0), "Studio");
  assert.equal(bedroomLabel(1), "1 Bedroom");
  assert.equal(bedroomLabel(2), "2 Bedrooms");
});

test("category wording is case-insensitive across existing property fields", () => {
  const base = { ...seededProperties[0], title: "Home", location: "Bangkok", buildingName: undefined, fullAddress: undefined, facilities: [] };
  for (const [flag, words] of [
    ["nearUniversity", ["University", "CAMPUS", "Rangsit University", "Chulalongkorn University"]],
    ["nearTransit", ["BTS", "mrt", "Station"]],
  ]) {
    const filters = initialSearchFilters({ [flag]: "true" });
    assert.equal(filterProperties([base], filters).length, 0);
    for (const field of ["title", "location", "buildingName", "fullAddress", "facilities"]) {
      for (const word of words) {
        const property = { ...base, [field]: field === "facilities" ? [`Near ${word}`] : `Near ${word}` };
        assert.equal(filterProperties([property], filters).length, 1, `${flag}: ${field}: ${word}`);
        assert.equal(filterProperties([apiPropertyToProperty(property)], filters).length, 1, `API ${flag}: ${field}: ${word}`);
      }
    }
  }
  assert.equal(filterProperties([{ ...base, title: "Stationery shop" }], initialSearchFilters({ nearTransit: "true" })).length, 0);
  assert.equal(filterProperties([{ ...base, title: "Pet friendly", facilities: ["Not Pet friendly"] }], initialSearchFilters({ petFriendly: "true" })).length, 0);
});

test("category flags combine with each other and existing filters", () => {
  const match = { ...seededProperties[0], id: "match", title: "Home near Campus BTS", facilities: ["Pet friendly", "Wi-Fi"], price: 9000 };
  const filters = {
    ...fromUrl("/search?petFriendly=true&nearUniversity=true&nearTransit=true&type=Condo&q=Home&location=Ari%2C%20Bangkok"),
    maxPrice: "10000", bedrooms: "1", facilities: ["Wi-Fi"], availableOnly: true,
  };
  const misses = [
    { title: "Home near BTS" }, { title: "Home near Campus" }, { facilities: ["Wi-Fi"] },
    { propertyType: "House" }, { title: "Room near Campus BTS" }, { location: "Asoke, Bangkok" },
    { price: 4000 }, { price: 11000 }, { bedrooms: 2 }, { facilities: ["Pet friendly"] }, { availableNow: false },
  ].map((change, index) => ({ ...match, ...change, id: `miss-${index}` }));
  assert.deepEqual(ids(filterProperties([match, ...misses], filters)), ["match"]);
  const cheaper = { ...match, id: "cheaper", price: 8000 };
  assert.deepEqual(ids(filterProperties([match, cheaper], { ...filters, sort: "price-asc" })), ["cheaper", "match"]);
  assert.deepEqual(ids(filterProperties([cheaper, match], { ...filters, sort: "price-desc" })), ["match", "cheaper"]);
  assert.equal(filterProperties([match], { ...filters, minPrice: "12000" }).length, 0);
});

test("re-seeding backfills the existing garden house once and preserves other data", async () => {
  const house = records.get("garden-house");
  house.facilities = ["Parking", "Custom facility"];
  house.title = "Edited garden house";
  await seed(db);
  await seed(db);
  assert.deepEqual(house.facilities, ["Parking", "Custom facility", "Pet friendly"]);
  assert.equal(house.title, "Edited garden house");
  assert.equal(records.size, 18);
});


test("all search filters survive serialization and direct URL reload", () => {
  const filters = { ...initialSearchFilters(), query: "Condo", location: "Ari, Bangkok", roomType: "Condo", minPrice: "8000", maxPrice: "15000", bedrooms: "1", facilities: ["Wi-Fi", "Air Conditioner"], availableOnly: true, nearTransit: true, sort: "price-asc" };
  assert.deepEqual(JSON.parse(JSON.stringify(fromUrl(`/search?${searchFiltersQuery(filters)}`))), filters);
  const noMinimum = { ...filters, minPrice: "" };
  assert.deepEqual(JSON.parse(JSON.stringify(fromUrl(`/search?${searchFiltersQuery(noMinimum)}`))), noMinimum);
  assert.equal(searchFiltersQuery(initialSearchFilters()), "");
});
