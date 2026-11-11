"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { PropertyCard } from "@/components/property-card";
import { availableMaxPriceOptions, filterProperties, formatPriceOption, initialSearchFilters, minPriceOptions, searchFiltersQuery } from "@/lib/search";
import { usePublicProperties } from "@/lib/published-listings";
import { facilities, propertyTypes } from "@/types/property";
const bedroomOptions = [
    { value: "", label: "Any" },
    { value: "0", label: "Studio / 0 Bedroom" },
    { value: "1", label: "1 Bedroom" },
    { value: "2", label: "2 Bedrooms" },
    { value: "3+", label: "3+ Bedrooms" },
];
const DEFAULT_MIN_PRICE = "5000";
function bedroomLabel(value) {
    if (value === "")
        return "Bedrooms";
    if (value === "0")
        return "Studio";
    if (value === "3+")
        return "3+ Beds";
    return `${value} Bed`;
}
function priceLabel(minPrice, maxPrice) {
    const isDefault = minPrice === DEFAULT_MIN_PRICE && maxPrice === "";
    if (isDefault)
        return "Price";
    const min = minPrice ? formatPriceOption(minPrice) : "Any";
    const max = maxPrice ? formatPriceOption(maxPrice) : "Any";
    if (minPrice && !maxPrice)
        return `${min}+`;
    if (!minPrice && maxPrice)
        return `Up to ${max}`;
    return `${min} – ${max}`;
}
function pillClass(active) {
    return `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap shadow-sm transition-colors ${active ? "border-primary bg-[#efeaff] text-primary shadow-primary/10" : "border-[#e5e1f0] bg-white text-[#403b5b] shadow-[#20104a08] hover:border-[#c8bbf5] hover:bg-[#fbf9ff]"}`;
}
const popoverClass = "absolute top-[calc(100%+8px)] left-0 z-30 w-72 max-w-[calc(100vw-3rem)] rounded-2xl border border-[#e6e1f2] bg-white p-3 shadow-xl shadow-[#20104a14]";
const popoverOptionClass = "flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-[#f4f0ff]";
const miniFooterClass = "mt-2 flex items-center justify-between gap-2 border-t border-[#ece7f7] pt-2";
const linkButtonClass = "min-h-9 rounded-lg px-2 text-sm font-medium text-ink-secondary hover:text-primary";
const doneButtonClass = "min-h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm shadow-primary/20 btn-primary";
export function SearchResults({ initialFilters }) {
    const [filters, setFilters] = useState(initialFilters);
    const [openPanel, setOpenPanel] = useState(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const { properties: publicProperties } = usePublicProperties();
    const locations = [...new Set(publicProperties.map((property) => property.location))];
    const results = filterProperties(publicProperties, filters);
    useEffect(() => {
        const query = searchFiltersQuery(filters);
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, [filters]);
    function update(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
    }
    function updateMinPrice(value) {
        setFilters((current) => ({
            ...current,
            minPrice: value,
            maxPrice: current.maxPrice !== "" && Number(current.maxPrice) < Number(value) ? "" : current.maxPrice,
        }));
    }
    function reset() {
        setFilters(initialSearchFilters());
    }
    function toggle(panel) {
        setOpenPanel((current) => (current === panel ? null : panel));
    }
    useEffect(() => {
        if (openPanel === null && !moreOpen)
            return;
        function onKeyDown(event) {
            if (event.key === "Escape") {
                setOpenPanel(null);
                setMoreOpen(false);
            }
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [openPanel, moreOpen]);
    useEffect(() => {
        document.body.style.overflow = moreOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [moreOpen]);
    const availabilityActive = filters.availableOnly;
    const typeActive = filters.roomType !== "";
    const priceActive = filters.minPrice !== DEFAULT_MIN_PRICE || filters.maxPrice !== "";
    const bedroomsActive = filters.bedrooms !== "";
    const moreCount = filters.facilities.length + (filters.location ? 1 : 0);
    const moreActive = filters.facilities.length > 0 || filters.location !== "";
    return (<>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div role="search" className="flex h-12 min-w-0 items-center gap-2.5 rounded-xl border border-[#e6e1f2] bg-white px-3.5 text-ink-secondary shadow-sm shadow-[#20104a08] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Icon name="search" size={19} className="shrink-0 text-primary"/>
          <label htmlFor="search-query" className="sr-only">Search by location, university, or keyword</label>
          <input id="search-query" type="search" value={filters.query} onChange={(event) => update("query", event.target.value)} placeholder="Search by location, university, or keyword" className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-secondary focus-visible:outline-none"/>
          {filters.query && (<button type="button" aria-label="Clear search" onClick={() => update("query", "")} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-primary-tint">
              <Icon name="close" size={16}/>
            </button>)}
        </div>
        <label className="relative min-w-0">
          <span className="sr-only">Sort properties</span>
          <select value={filters.sort} onChange={(event) => update("sort", event.target.value)} className="h-12 w-full min-w-0 appearance-none rounded-xl border border-[#e6e1f2] bg-white pr-9 pl-3.5 text-sm font-semibold text-[#403b5b] shadow-sm shadow-[#20104a08]">
            <option value="default">Sort: Default</option>
            <option value="price-asc">Price: Low to high</option>
            <option value="price-desc">Price: High to low</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary"><Icon name="chevronDown" size={16}/></span>
        </label>
      </div>

      <div aria-label="Quick filters" className="mt-4 flex min-w-0 flex-wrap gap-2.5">
        <div className="relative min-w-0">
          <button type="button" aria-expanded={openPanel === "availability"} aria-haspopup="dialog" onClick={() => toggle("availability")} className={pillClass(availabilityActive)}>
            {availabilityActive ? "Available now" : "Availability"}
            <Icon name="chevronDown" size={15}/>
          </button>
          {openPanel === "availability" && (<div role="dialog" aria-label="Availability filter" className={popoverClass}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-ink-secondary hover:bg-primary-tint">
                <input type="checkbox" checked={filters.availableOnly} onChange={(event) => update("availableOnly", event.target.checked)} className="size-4 shrink-0 accent-primary"/>
                Available now
              </label>
              <div className={miniFooterClass}>
                <button type="button" onClick={() => update("availableOnly", false)} className={linkButtonClass}>Clear</button>
                <button type="button" onClick={() => setOpenPanel(null)} className={doneButtonClass}>Done</button>
              </div>
            </div>)}
        </div>

        <div className="relative min-w-0">
          <button type="button" aria-expanded={openPanel === "type"} aria-haspopup="dialog" onClick={() => toggle("type")} className={pillClass(typeActive)}>
            <span className="max-w-32 truncate sm:max-w-40">{filters.roomType || "Property Type"}</span>
            <Icon name="chevronDown" size={15}/>
          </button>
          {openPanel === "type" && (<div role="dialog" aria-label="Property type filter" className={popoverClass}>
              <button type="button" onClick={() => { update("roomType", ""); setOpenPanel(null); }} className={`${popoverOptionClass} ${filters.roomType === "" ? "bg-primary-tint font-semibold text-primary" : "text-ink-secondary"}`}>
                All Types
                {filters.roomType === "" && <span aria-hidden="true">✓</span>}
              </button>
              {propertyTypes.map((type) => (<button key={type} type="button" onClick={() => { update("roomType", type); setOpenPanel(null); }} className={`${popoverOptionClass} ${filters.roomType === type ? "bg-primary-tint font-semibold text-primary" : "text-ink-secondary"}`}>
                  {type}
                  {filters.roomType === type && <span aria-hidden="true">✓</span>}
                </button>))}
            </div>)}
        </div>

        <div className="relative min-w-0">
          <button type="button" aria-expanded={openPanel === "price"} aria-haspopup="dialog" onClick={() => toggle("price")} className={pillClass(priceActive)}>
            {priceLabel(filters.minPrice, filters.maxPrice)}
            <Icon name="chevronDown" size={15}/>
          </button>
          {openPanel === "price" && (<div role="dialog" aria-label="Price filter" className={`${popoverClass} w-80`}>
              <p className="px-1 text-xs font-medium text-ink-secondary">Price range (฿ / month)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label><span className="sr-only">Minimum price</span>
                  <select value={filters.minPrice} onChange={(event) => updateMinPrice(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-[#e6e1f2] bg-white px-2 text-sm text-ink">
                    <option value="">No minimum</option>
                    {minPriceOptions.map((option) => <option key={option} value={option}>{formatPriceOption(option)}</option>)}
                  </select>
                </label>
                <label><span className="sr-only">Maximum price</span>
                  <select value={filters.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-[#e6e1f2] bg-white px-2 text-sm text-ink">
                    <option value="">No limit</option>
                    {availableMaxPriceOptions(filters.minPrice).map((option) => <option key={option} value={option}>{formatPriceOption(option)}</option>)}
                  </select>
                </label>
              </div>
              <div className={miniFooterClass}>
                <button type="button" onClick={() => { update("minPrice", DEFAULT_MIN_PRICE); update("maxPrice", ""); }} className={linkButtonClass}>Clear</button>
                <button type="button" onClick={() => setOpenPanel(null)} className={doneButtonClass}>Done</button>
              </div>
            </div>)}
        </div>

        <div className="relative min-w-0">
          <button type="button" aria-expanded={openPanel === "bedrooms"} aria-haspopup="dialog" onClick={() => toggle("bedrooms")} className={pillClass(bedroomsActive)}>
            {bedroomLabel(filters.bedrooms)}
            <Icon name="chevronDown" size={15}/>
          </button>
          {openPanel === "bedrooms" && (<div role="dialog" aria-label="Bedrooms filter" className={popoverClass}>
              {bedroomOptions.map((option) => (<button key={option.value} type="button" onClick={() => { update("bedrooms", option.value); setOpenPanel(null); }} className={`${popoverOptionClass} ${filters.bedrooms === option.value ? "bg-primary-tint font-semibold text-primary" : "text-ink-secondary"}`}>
                  {option.label}
                  {filters.bedrooms === option.value && <span aria-hidden="true">✓</span>}
                </button>))}
            </div>)}
        </div>

        <button type="button" aria-expanded={moreOpen} aria-controls="more-filters-panel" onClick={() => setMoreOpen(true)} className={pillClass(moreActive)}>
          <Icon name="filter" size={15}/> More Filters
          {moreCount > 0 && (<span aria-label={`${moreCount} advanced filters selected`} className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">{moreCount}</span>)}
        </button>
      </div>

      {openPanel !== null && (<button type="button" aria-label="Close filters" onClick={() => setOpenPanel(null)} className="fixed inset-0 z-20 cursor-default bg-transparent" tabIndex={-1}/>)}

      {moreOpen && (<div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="more-filters-title">
          <button type="button" aria-label="Close more filters" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-[#171044]/45" tabIndex={-1}/>
          <section id="more-filters-panel" className="relative flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-[#e6e1f2] bg-white shadow-2xl shadow-[#20104a26] sm:max-w-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#ece7f7] px-5 py-4">
              <h2 id="more-filters-title" className="text-base font-bold text-[#171044]">More Filters</h2>
              <button type="button" aria-label="Close more filters" onClick={() => setMoreOpen(false)} className="flex size-9 items-center justify-center rounded-full hover:bg-primary-tint">
                <Icon name="close" size={16}/>
              </button>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-6 sm:grid-cols-2">
                <fieldset className="min-w-0">
                  <legend className="text-sm font-semibold">Property Type</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" aria-pressed={filters.roomType === ""} onClick={() => update("roomType", "")} className={pillClass(filters.roomType === "")}>All</button>
                    {propertyTypes.map((type) => (<button key={type} type="button" aria-pressed={filters.roomType === type} onClick={() => update("roomType", filters.roomType === type ? "" : type)} className={pillClass(filters.roomType === type)}>{type}</button>))}
                  </div>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="text-sm font-semibold">Bedrooms</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bedroomOptions.map((option) => (<button key={option.value} type="button" aria-pressed={filters.bedrooms === option.value} onClick={() => update("bedrooms", option.value)} className={pillClass(filters.bedrooms === option.value)}>{option.label}</button>))}
                  </div>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="text-sm font-semibold">Price range (฿ / month)</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label><span className="sr-only">Minimum price</span>
                      <select value={filters.minPrice} onChange={(event) => updateMinPrice(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-[#e6e1f2] bg-white px-2 text-sm text-ink">
                        <option value="">No minimum</option>
                        {minPriceOptions.map((option) => <option key={option} value={option}>{formatPriceOption(option)}</option>)}
                      </select>
                    </label>
                    <label><span className="sr-only">Maximum price</span>
                      <select value={filters.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-[#e6e1f2] bg-white px-2 text-sm text-ink">
                        <option value="">No limit</option>
                        {availableMaxPriceOptions(filters.minPrice).map((option) => <option key={option} value={option}>{formatPriceOption(option)}</option>)}
                      </select>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="text-sm font-semibold">Availability</legend>
                  <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-secondary">
                    <input type="checkbox" checked={filters.availableOnly} onChange={(event) => update("availableOnly", event.target.checked)} className="size-4 shrink-0 accent-primary"/>
                    Available now
                  </label>
                  <label className="mt-3 block min-w-0 text-sm font-semibold">
                    Location
                    <select value={filters.location} onChange={(event) => update("location", event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-[#e6e1f2] bg-white px-3 text-sm font-normal text-ink">
                      <option value="">All locations</option>
                      {filters.location && !locations.includes(filters.location) && <option value={filters.location}>{filters.location}</option>}
                      {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </label>
                </fieldset>
              </div>

              <fieldset className="mt-6 min-w-0">
                <legend className="text-sm font-semibold">Facilities</legend>
                <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  {facilities.map((facility) => (<label key={facility} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-secondary">
                      <input type="checkbox" checked={filters.facilities.includes(facility)} onChange={(event) => update("facilities", event.target.checked ? [...filters.facilities, facility] : filters.facilities.filter((item) => item !== facility))} className="size-4 shrink-0 accent-primary"/>
                      {facility}
                    </label>))}
                </div>
              </fieldset>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#ece7f7] bg-[#fbfaff] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" onClick={reset} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary-tint">Reset</button>
              <button type="button" onClick={() => setMoreOpen(false)} className="min-h-11 flex-1 rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary sm:flex-none sm:px-8">
                View {results.length} {results.length === 1 ? "Result" : "Results"}
              </button>
            </div>
          </section>
        </div>)}

      <div className="mt-5 mb-4 flex items-center justify-between gap-3 border-t border-[#e6e1f2] pt-4">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-semibold text-[#403b5b]">{results.length} {results.length === 1 ? "property" : "properties"} found</p>
        <button type="button" onClick={reset} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary-tint">
          <Icon name="close" size={15}/> Reset filters
        </button>
      </div>
      {results.length ? (<div className="grid max-w-[1320px] grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {results.map((property, index) => (<div key={property.id} className="min-w-0 rounded-xl border border-[#e6e1f2] bg-white p-1.5 pb-3 shadow-md shadow-[#20104a0d] transition-shadow duration-200 hover:shadow-lg hover:shadow-[#20104a14]">
              <PropertyCard property={property} preload={index === 0} showDetailsButton showTags/>
            </div>))}
        </div>) : (<div className="rounded-2xl border border-[#e6e1f2] bg-white px-5 py-14 text-center shadow-sm shadow-[#20104a08]">
          <Icon name="search" size={30} className="mx-auto text-primary"/>
          <h2 className="mt-4 text-lg font-semibold">No rooms found</h2>
          <p className="mt-2 text-sm text-ink-secondary">Try another location, keyword, or price range.</p>
          <button type="button" onClick={reset} className="mt-5 min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">Reset filters</button>
        </div>)}
    </>);
}
