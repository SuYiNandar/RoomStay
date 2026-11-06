"use client";
import { useEffect, useMemo, useState } from "react";
import { cachedApiProperties, loadApiProperties } from "@/lib/live";
import { properties } from "@/mocks/properties";
import { formatPropertyLocation } from "@/lib/property-location";
import { readMockListings, mockListingsChangedEvent } from "@/lib/mock-listings";
import { findMockPartnerCapability, mockPartnerApplicationsChangedEvent } from "@/lib/mock-partner-application";
import { propertyTypes } from "@/types/property";
// Fallback image for published Partner listings, matching the existing
// fallback behavior elsewhere. Listing photos store metadata only, so no
// real listing photo URLs are ever invented.
export const publishedListingFallbackImage = "/images/home/cozy-condo.jpg";
function isPropertyType(value) {
    return propertyTypes.includes(value);
}
function toValidFacilities(values) {
    return values.filter((value) => typeof value === "string");
}
// Converts a published MockListing into the existing public Property shape.
// Returns null when the stored listing cannot satisfy the shape.
export function mockListingToProperty(listing) {
    if (listing.listingStatus !== "PUBLISHED")
        return null;
    if (findMockPartnerCapability(listing.partnerUserId)?.status === "SUSPENDED")
        return null;
    if (!isPropertyType(listing.propertyType))
        return null;
    const memberSince = new Date(listing.createdAt).getFullYear();
    const imageAlt = `${listing.title} photo`;
    return {
        id: listing.id,
        title: listing.title,
        location: formatPropertyLocation(listing),
        buildingName: listing.buildingName,
        fullAddress: listing.fullAddress,
        area: listing.area,
        province: listing.province,
        price: listing.monthlyRent,
        image: publishedListingFallbackImage,
        imageAlt,
        images: [{ src: publishedListingFallbackImage, alt: imageAlt }],
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        size: listing.sizeSqm,
        propertyType: listing.propertyType,
        facilities: toValidFacilities(listing.facilities),
        description: listing.description,
        owner: {
            name: "Property Partner",
            initials: "PP",
            memberSince: Number.isFinite(memberSince) ? String(memberSince) : "2026",
            rating: 0,
            reviews: 0,
        },
        availableNow: listing.roomStatus === "AVAILABLE",
        popular: false,
        houseRules: listing.houseRules,
    };
}
const staticPropertyIds = new Set(properties.map((property) => property.id));
// Published Partner listings merged into the public property source at
// runtime. Static properties always win on ID collisions.
export function readPublishedListingProperties() {
    if (typeof window === "undefined")
        return [];
    const result = [];
    for (const listing of readMockListings()) {
        if (staticPropertyIds.has(listing.id))
            continue;
        const property = mockListingToProperty(listing);
        if (property)
            result.push(property);
    }
    return result;
}
// Static-first lookup; also resolves published listings (client only).
// Safe to call inside effects and event handlers.
export function findPublicProperty(propertyId) {
    return cachedApiProperties()?.find((property) => property.id === propertyId)
        ?? properties.find((property) => property.id === propertyId)
        ?? readPublishedListingProperties().find((property) => property.id === propertyId);
}
// Reactive merged public property source. The first render is static-only
// (identical on server and client); published listings merge after mount.
export function usePublicProperties() {
    const [published, setPublished] = useState(null);
    const [apiProperties, setApiProperties] = useState(cachedApiProperties());
    useEffect(() => {
        function loadPublished() {
            setPublished(readPublishedListingProperties());
        }
        let active = true;
        function loadCatalog() {
            loadApiProperties()
                .then((next) => {
                if (active)
                    setApiProperties(next);
            })
                .catch(() => undefined);
        }
        function refreshCatalog() {
            loadPublished();
            loadCatalog();
        }
        loadCatalog();
        const timeout = window.setTimeout(loadPublished, 0);
        window.addEventListener(mockListingsChangedEvent, refreshCatalog);
        window.addEventListener(mockPartnerApplicationsChangedEvent, refreshCatalog);
        window.addEventListener("storage", loadPublished);
        return () => {
            active = false;
            window.clearTimeout(timeout);
            window.removeEventListener(mockListingsChangedEvent, refreshCatalog);
            window.removeEventListener(mockPartnerApplicationsChangedEvent, refreshCatalog);
            window.removeEventListener("storage", loadPublished);
        };
    }, []);
    const merged = useMemo(() => (published === null ? properties : [...properties, ...published]), [published]);
    if (apiProperties)
        return { properties: apiProperties, isReady: true };
    return { properties: merged, isReady: published !== null };
}
// Single-property lookup. Returns the static property synchronously when
// known; otherwise undefined while published listings load, then the
// published property or null when it does not exist publicly.
export function usePublicProperty(propertyId) {
    const { properties: publicProperties, isReady } = usePublicProperties();
    if (propertyId === undefined)
        return null;
    const found = publicProperties.find((property) => property.id === propertyId);
    if (found)
        return found;
    return isReady ? null : undefined;
}
