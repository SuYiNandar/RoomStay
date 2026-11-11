import { propertyTypes } from "@/types/property";
export function initialSearchFilters(params = {}) {
    const value = (key) => typeof params[key] === "string" ? params[key] : "";
    const type = value("type");
    return {
        query: value("q"),
        location: value("location"),
        roomType: propertyTypes.some((propertyType) => propertyType === type) ? type : "",
        minPrice: typeof params.min === "string" ? params.min : "5000",
        maxPrice: value("max"),
        bedrooms: value("bedrooms"),
        facilities: value("facilities").split(",").map((item) => item.trim()).filter(Boolean),
        availableOnly: value("availableOnly") === "true",
        petFriendly: value("petFriendly") === "true",
        nearUniversity: value("nearUniversity") === "true",
        nearTransit: value("nearTransit") === "true",
        sort: ["price-asc", "price-desc"].includes(value("sort")) ? value("sort") : "default",
    };
}
export const minPriceOptions = ["5000", "8000", "10000", "15000", "20000", "30000"];
export const maxPriceOptions = ["10000", "15000", "20000", "30000", "50000"];
export function formatPriceOption(value) {
    return `฿${Number(value).toLocaleString("en-US")}`;
}
export function availableMaxPriceOptions(minPrice) {
    return maxPriceOptions.filter((option) => minPrice === "" || Number(option) >= Number(minPrice));
}
export function hasInvalidPriceRange(filters) {
    if ([filters.minPrice, filters.maxPrice].some((price) => price !== "" && (!Number.isFinite(Number(price)) || Number(price) < 0)))
        return true;
    return filters.minPrice !== "" && filters.maxPrice !== "" && Number(filters.minPrice) > Number(filters.maxPrice);
}
export function filterProperties(properties, filters) {
    if (hasInvalidPriceRange(filters))
        return [];
    const words = filters.query.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
    const results = properties.filter((property) => {
        const text = `${property.title} ${property.location} ${property.propertyType} ${property.buildingName ?? ""} ${property.fullAddress ?? ""}`.toLowerCase();
        const categoryText = [property.title, property.location, property.buildingName, property.fullAddress, ...property.facilities].join(" ");
        return words.every((word) => text.includes(word))
            && (!filters.petFriendly || property.facilities.includes("Pet friendly"))
            && (!filters.nearUniversity || /\b(university|campus)\b/i.test(categoryText))
            && (!filters.nearTransit || /\b(bts|mrt|station)\b/i.test(categoryText))
            && (!filters.location || property.location === filters.location)
            && (!filters.roomType || property.propertyType === filters.roomType)
            && (!filters.minPrice || property.price >= Number(filters.minPrice))
            && (!filters.maxPrice || property.price <= Number(filters.maxPrice))
            && (!filters.bedrooms || (filters.bedrooms === "3+" ? property.bedrooms >= 3 : property.bedrooms === Number(filters.bedrooms)))
            && filters.facilities.every((facility) => property.facilities.some((item) => item === facility))
            && (!filters.availableOnly || property.availableNow);
    });
    if (filters.sort === "price-asc")
        results.sort((a, b) => a.price - b.price);
    if (filters.sort === "price-desc")
        results.sort((a, b) => b.price - a.price);
    return results;
}

export function searchFiltersQuery(filters) {
    const params = new URLSearchParams();
    const fields = { q: filters.query, location: filters.location, type: filters.roomType,
        min: filters.minPrice, max: filters.maxPrice, bedrooms: filters.bedrooms,
        facilities: filters.facilities.join(","), sort: filters.sort };
    for (const [key, value] of Object.entries(fields)) {
        if (key === "min" ? value !== "5000" : value && value !== "default") params.set(key, value);
    }
    for (const key of ["availableOnly", "petFriendly", "nearUniversity", "nearTransit"]) {
        if (filters[key]) params.set(key, "true");
    }
    return params.toString();
}
