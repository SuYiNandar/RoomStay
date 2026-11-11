import { liveEnabled, readLive } from "@/lib/live-store";
import { hasMockPartnerAccess } from "@/lib/mock-partner-application";
import { findMockListingById } from "@/lib/mock-listings";
import { notifyMockViewingUpdated } from "@/lib/mock-notifications";
import { viewingTimeOptions } from "@/lib/viewing-time";
import { properties } from "@/mocks/properties";
export const mockViewingRequestsKey = "roomstay.mockViewingRequests";
export const mockViewingsChangedEvent = "roomstay:viewings-changed";
export const viewingStatuses = ["REQUESTED", "APPROVED", "RESCHEDULE_REQUESTED", "DECLINED", "CANCELLED"];
export const viewingStatusLabels = {
    REQUESTED: "Requested",
    APPROVED: "Approved",
    RESCHEDULE_REQUESTED: "Reschedule Requested",
    DECLINED: "Declined",
    CANCELLED: "Cancelled",
};
export const renterCancellableViewingStatuses = ["REQUESTED", "APPROVED", "RESCHEDULE_REQUESTED"];
function normalizeViewing(value) {
    if (!value || typeof value !== "object")
        return null;
    const request = value;
    const required = ["id", "propertyId", "propertyTitle", "renterId", "renterName", "viewingDate", "viewingTime", "createdAt"];
    if (required.some((key) => typeof request[key] !== "string"))
        return null;
    // The original submission flow stored "Requested" (and accepted missing status).
    const status = request.status === "Requested" || request.status === undefined ? "REQUESTED" : request.status;
    if (!viewingStatuses.includes(status))
        return null;
    const normalized = { ...request, status, message: typeof request.message === "string" ? request.message : "" };
    for (const key of ["propertyLocation", "partnerSuggestedDate", "partnerSuggestedTime", "partnerMessage", "declineReason", "updatedAt"]) {
        if (typeof request[key] !== "string")
            delete normalized[key];
    }
    return normalized;
}
export function readMockViewingRequests() {
    if (liveEnabled())
        return readLive("viewings");
    if (typeof window === "undefined")
        return [];
    try {
        const stored = window.localStorage.getItem(mockViewingRequestsKey);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed)
            ? parsed.map(normalizeViewing).filter((request) => request !== null)
            : [];
    }
    catch {
        return [];
    }
}
export function saveMockViewingRequest(request) {
    try {
        window.localStorage.setItem(mockViewingRequestsKey, JSON.stringify([...readMockViewingRequests(), request]));
        window.dispatchEvent(new Event(mockViewingsChangedEvent));
    }
    catch {
        // localStorage may be unavailable in private browsing.
    }
}
// Static properties take precedence in public lookup and have no account owner ID.
// Never infer ownership from display names or expose all requests to every Partner.
export function partnerOwnsViewing(request, user) {
    const ownsListing = (request?.partnerUserId || findMockListingById(request.propertyId)?.partnerUserId) === user.id;
    if (liveEnabled())
        return hasMockPartnerAccess(user) && ownsListing;
    return hasMockPartnerAccess(user)
        && !properties.some((property) => property.id === request.propertyId)
        && ownsListing;
}
export function reviewMockViewing(id, user, decision) {
    const requests = readMockViewingRequests();
    const existing = requests.find((request) => request.id === id);
    if (!existing || !partnerOwnsViewing(existing, user) || existing.status !== "REQUESTED")
        return null;
    if (decision.status === "DECLINED" && !decision.declineReason.trim())
        return null;
    if (decision.status === "RESCHEDULE_REQUESTED") {
        const date = decision.partnerSuggestedDate;
        const parsed = new Date(`${date}T00:00:00`);
        // Partner suggestions are limited to the same 7:00 AM–9:00 PM preset slots as new requests.
        const allowedTimes = new Set(viewingTimeOptions.map((slot) => slot.value));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
            || parsed.getFullYear() !== Number(date.slice(0, 4))
            || parsed.getMonth() + 1 !== Number(date.slice(5, 7))
            || parsed.getDate() !== Number(date.slice(8, 10))
            || !allowedTimes.has(decision.partnerSuggestedTime))
            return null;
    }
    const updated = {
        ...existing,
        status: decision.status,
        updatedAt: new Date().toISOString(),
        partnerSuggestedDate: decision.status === "RESCHEDULE_REQUESTED" ? decision.partnerSuggestedDate : undefined,
        partnerSuggestedTime: decision.status === "RESCHEDULE_REQUESTED" ? decision.partnerSuggestedTime : undefined,
        partnerMessage: decision.status === "RESCHEDULE_REQUESTED" ? decision.partnerMessage?.trim() : undefined,
        declineReason: decision.status === "DECLINED" ? decision.declineReason.trim() : undefined,
    };
    // Only viewing storage is changed. Storage failures propagate to the review UI.
    window.localStorage.setItem(mockViewingRequestsKey, JSON.stringify(requests.map((request) => request.id === id ? updated : request)));
    window.dispatchEvent(new Event(mockViewingsChangedEvent));
    try {
        notifyMockViewingUpdated(updated);
    }
    catch {
        // A notification failure must not undo or misreport a saved decision.
    }
    return updated;
}
export function cancelMockViewing(id, userId) {
    if (liveEnabled())
        return null;
    const requests = readMockViewingRequests();
    const existing = requests.find((request) => request.id === id);
    if (!existing || existing.renterId !== userId || !renterCancellableViewingStatuses.includes(existing.status))
        return null;
    const updated = { ...existing, status: "CANCELLED", updatedAt: new Date().toISOString() };
    window.localStorage.setItem(mockViewingRequestsKey, JSON.stringify(requests.map((request) => request.id === id ? updated : request)));
    window.dispatchEvent(new Event(mockViewingsChangedEvent));
    return updated;
}
