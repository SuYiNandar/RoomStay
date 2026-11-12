import { liveEnabled, readLive } from "@/lib/live-store";
import { recordMockAuditLog } from "@/lib/mock-audit-logs";
import { formatPropertyLocation } from "@/lib/property-location";
import { suitableForOptions } from "@/types/property";
export const mockListingsKey = "roomstay.mockListings";
export const mockListingsChangedEvent = "roomstay:listings-changed";
function isListingStatus(value) {
    return (value === "DRAFT"
        || value === "PENDING_REVIEW"
        || value === "PUBLISHED"
        || value === "REJECTED"
        || value === "SUSPENDED");
}
function isRoomStatus(value) {
    return value === "AVAILABLE" || value === "RESERVED" || value === "RENTED" || value === "UNAVAILABLE";
}
function isGuestsPolicy(value) {
    return value === "ALLOWED" || value === "LIMITED" || value === "NOT_ALLOWED";
}
function isSuitableFor(value) {
    return typeof value === "string" && suitableForOptions.includes(value);
}
function normalizeHouseRules(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const rules = value;
    if (typeof rules.smokingAllowed !== "boolean" || typeof rules.petsAllowed !== "boolean" || !isGuestsPolicy(rules.guestsPolicy)) {
        return undefined;
    }
    const quietHoursStart = typeof rules.quietHoursStart === "string" && rules.quietHoursStart.trim() ? rules.quietHoursStart : undefined;
    const quietHoursEnd = typeof rules.quietHoursEnd === "string" && rules.quietHoursEnd.trim() ? rules.quietHoursEnd : undefined;
    const suitableFor = Array.isArray(rules.suitableFor) ? rules.suitableFor.filter(isSuitableFor) : undefined;
    const additionalRules = typeof rules.additionalRules === "string" && rules.additionalRules.trim() ? rules.additionalRules.slice(0, 500) : undefined;
    return {
        smokingAllowed: rules.smokingAllowed,
        petsAllowed: rules.petsAllowed,
        guestsPolicy: rules.guestsPolicy,
        quietHoursStart,
        quietHoursEnd,
        suitableFor: suitableFor && suitableFor.length > 0 ? suitableFor : undefined,
        additionalRules,
    };
}
function normalizePhoto(value) {
    if (!value || typeof value !== "object")
        return null;
    const photo = value;
    if (typeof photo.name !== "string")
        return null;
    return { name: photo.name, type: typeof photo.type === "string" ? photo.type : "file" };
}
function normalizeListing(value) {
    if (!value || typeof value !== "object")
        return null;
    const listing = value;
    if (typeof listing.id !== "string"
        || typeof listing.partnerUserId !== "string"
        || typeof listing.title !== "string"
        || typeof listing.propertyType !== "string"
        || typeof listing.monthlyRent !== "number"
        || typeof listing.location !== "string"
        || typeof listing.description !== "string"
        || typeof listing.bedrooms !== "number"
        || typeof listing.bathrooms !== "number"
        || typeof listing.sizeSqm !== "number"
        || !Array.isArray(listing.facilities)
        || !Array.isArray(listing.photos)
        || !isListingStatus(listing.listingStatus)
        || !isRoomStatus(listing.roomStatus)
        || typeof listing.createdAt !== "string"
        || typeof listing.updatedAt !== "string") {
        return null;
    }
    const identity = {
        location: listing.location,
        buildingName: typeof listing.buildingName === "string" ? listing.buildingName.trim() || undefined : undefined,
        fullAddress: typeof listing.fullAddress === "string" ? listing.fullAddress.trim() || undefined : undefined,
        area: typeof listing.area === "string" ? listing.area.trim() || undefined : undefined,
        province: typeof listing.province === "string" ? listing.province.trim() || undefined : undefined,
    };
    return {
        ...identity,
        id: listing.id,
        partnerUserId: listing.partnerUserId,
        title: listing.title,
        propertyType: listing.propertyType,
        monthlyRent: listing.monthlyRent,
        location: formatPropertyLocation(identity),
        description: listing.description,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sizeSqm: listing.sizeSqm,
        facilities: listing.facilities.filter((facility) => typeof facility === "string"),
        photos: listing.photos.map(normalizePhoto).filter((photo) => Boolean(photo)),
        houseRules: normalizeHouseRules(listing.houseRules),
        listingStatus: listing.listingStatus,
        roomStatus: listing.roomStatus,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        submittedAt: typeof listing.submittedAt === "string" ? listing.submittedAt : undefined,
        reviewedAt: typeof listing.reviewedAt === "string" ? listing.reviewedAt : undefined,
        rejectionReason: typeof listing.rejectionReason === "string" ? listing.rejectionReason : undefined,
    };
}
export function readMockListings() {
    if (liveEnabled())
        return readLive("listings");
    if (typeof window === "undefined")
        return [];
    try {
        const stored = window.localStorage.getItem(mockListingsKey);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed)
            ? parsed.map(normalizeListing).filter((listing) => Boolean(listing))
            : [];
    }
    catch {
        return [];
    }
}
function writeMockListings(listings) {
    window.localStorage.setItem(mockListingsKey, JSON.stringify(listings));
    window.dispatchEvent(new Event(mockListingsChangedEvent));
}
export function readMockListingsForPartner(partnerUserId) {
    return readMockListings()
        .filter((listing) => listing.partnerUserId === partnerUserId)
        .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}
export function findMockListingById(id) {
    return readMockListings().find((listing) => listing.id === id) ?? null;
}
export function saveMockListing(listing) {
    writeMockListings([...readMockListings(), listing]);
}
export function updateMockListing(updatedListing) {
    writeMockListings(readMockListings().map((listing) => listing.id === updatedListing.id ? updatedListing : listing));
}
// Saving published content takes it offline until Admin review.
export function isMockListingEditable(listing) {
    return ["DRAFT", "REJECTED", "PUBLISHED"].includes(listing.listingStatus);
}
export function listingStatusLabel(status) {
    return status.replaceAll("_", " ");
}
// Presentational-only pill tones. Statuses and transitions are unchanged.
export function listingStatusTone(status) {
    if (status === "PUBLISHED")
        return "bg-[#e7f6ee] text-[#1d7a3f] ring-[#c9e9d4]";
    if (status === "PENDING_REVIEW")
        return "bg-primary-tint text-primary ring-primary/25";
    if (status === "REJECTED" || status === "SUSPENDED")
        return "bg-red-50 text-alert ring-red-100";
    return "bg-canvas text-ink-secondary ring-line";
}
// Applies an Admin decision. Only PENDING_REVIEW listings can transition;
// room status is always preserved. Returns the updated listing, or null
// when no transition happened.
export function reviewMockListing(id, decision) {
    const listings = readMockListings();
    const existing = listings.find((listing) => listing.id === id);
    if (!existing || existing.listingStatus !== "PENDING_REVIEW")
        return null;
    const updated = {
        ...existing,
        listingStatus: decision.status,
        updatedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        rejectionReason: decision.status === "REJECTED" ? decision.rejectionReason : undefined,
    };
    writeMockListings(listings.map((listing) => listing.id === id ? updated : listing));
    recordMockAuditLog({
        action: decision.status === "PUBLISHED" ? "LISTING_PUBLISHED" : "LISTING_REJECTED",
        targetType: "LISTING", targetId: updated.id, targetName: updated.title,
        details: `PENDING_REVIEW → ${updated.listingStatus}.${updated.rejectionReason ? ` Reason: ${updated.rejectionReason}` : ""}`,
    });
    return updated;
}
export function createMockListingId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `mock-listing-${crypto.randomUUID()}`;
    }
    return `mock-listing-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
