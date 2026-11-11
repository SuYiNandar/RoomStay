import { liveEnabled, readLive, readLiveRoomStatus } from "@/lib/live-store";
import { recordMockAuditLog } from "@/lib/mock-audit-logs";
import { hasMockPartnerAccess } from "@/lib/mock-partner-application";
import { findMockListingById } from "@/lib/mock-listings";
import { properties } from "@/mocks/properties";
export const mockBookingRequestsKey = "roomstay.mockBookingRequests";
export const mockRoomStatusesKey = "roomstay.mockRoomStatuses";
export const mockRoomStatusesChangedEvent = "roomstay:room-statuses-changed";
export const mockPaymentEvidenceKey = "roomstay.mockPaymentEvidence";
export const mockReviewsKey = "roomstay.mockReviews";
export const mockReviewsChangedEvent = "roomstay:reviews-changed";
export const bookingStatuses = [
    "PENDING",
    "APPROVED",
    "DEPOSIT_PENDING",
    "VERIFICATION_PENDING",
    "CONFIRMED",
    "ACTIVE",
    "COMPLETED",
    "DECLINED",
    "CANCELLED",
    "EXPIRED",
];
function isBookingStatus(value) {
    return typeof value === "string" && bookingStatuses.some((status) => status === value);
}
function isPaymentEvidenceStatus(value) {
    return value === "PENDING_VERIFICATION" || value === "VERIFIED" || value === "REJECTED";
}
function normalizePaymentEvidence(value) {
    if (!value || typeof value !== "object")
        return null;
    const evidence = value;
    if (typeof evidence.id !== "string"
        || typeof evidence.bookingId !== "string"
        || typeof evidence.fileName !== "string"
        || typeof evidence.fileType !== "string"
        || typeof evidence.uploadedAt !== "string") {
        return null;
    }
    return {
        id: evidence.id,
        bookingId: evidence.bookingId,
        fileName: evidence.fileName,
        fileType: evidence.fileType,
        fileUrl: typeof evidence.fileUrl === "string" ? evidence.fileUrl : undefined,
        note: typeof evidence.note === "string" ? evidence.note : "",
        uploadedAt: evidence.uploadedAt,
        status: isPaymentEvidenceStatus(evidence.status) ? evidence.status : "PENDING_VERIFICATION",
        verifiedAt: typeof evidence.verifiedAt === "string" ? evidence.verifiedAt : undefined,
        verifiedBy: typeof evidence.verifiedBy === "string" ? evidence.verifiedBy : undefined,
        rejectedAt: typeof evidence.rejectedAt === "string" ? evidence.rejectedAt : undefined,
        rejectionReason: typeof evidence.rejectionReason === "string" ? evidence.rejectionReason : undefined,
    };
}
function normalizeReview(value) {
    if (!value || typeof value !== "object")
        return null;
    const review = value;
    if (typeof review.id !== "string"
        || typeof review.bookingId !== "string"
        || typeof review.renterUserId !== "string"
        || typeof review.rating !== "number"
        || typeof review.comment !== "string"
        || typeof review.createdAt !== "string") {
        return null;
    }
    return {
        id: review.id,
        bookingId: review.bookingId,
        renterUserId: review.renterUserId,
        rating: Math.min(5, Math.max(1, Math.round(review.rating))),
        comment: review.comment,
        createdAt: review.createdAt,
        status: review.status === "HIDDEN" || review.status === "REPORTED" ? review.status : "VISIBLE",
        moderatedAt: typeof review.moderatedAt === "string" ? review.moderatedAt : undefined,
        moderatedBy: typeof review.moderatedBy === "string" ? review.moderatedBy : undefined,
    };
}
function normalizeBooking(value) {
    if (!value || typeof value !== "object")
        return null;
    const booking = value;
    if (typeof booking.id !== "string"
        || typeof booking.propertyId !== "string"
        || typeof booking.renterUserId !== "string"
        || typeof booking.requestedMoveInDate !== "string"
        || typeof booking.createdAt !== "string") {
        return null;
    }
    return {
        id: booking.id,
        propertyId: booking.propertyId,
        propertyTitle: typeof booking.propertyTitle === "string" ? booking.propertyTitle : "RoomStay property",
        propertyLocation: typeof booking.propertyLocation === "string" ? booking.propertyLocation : "",
        monthlyRent: typeof booking.monthlyRent === "number" ? booking.monthlyRent : 0,
        renterUserId: booking.renterUserId,
        renterName: typeof booking.renterName === "string" ? booking.renterName : "RoomStay user",
        requestedMoveInDate: booking.requestedMoveInDate,
        message: typeof booking.message === "string" ? booking.message : "",
        status: isBookingStatus(booking.status) ? booking.status : "PENDING",
        createdAt: booking.createdAt,
        depositAmount: typeof booking.depositAmount === "number" ? booking.depositAmount : undefined,
        paymentDeadline: typeof booking.paymentDeadline === "string" ? booking.paymentDeadline : undefined,
        approvedAt: typeof booking.approvedAt === "string" ? booking.approvedAt : undefined,
        declinedAt: typeof booking.declinedAt === "string" ? booking.declinedAt : undefined,
        declineReason: typeof booking.declineReason === "string" ? booking.declineReason : undefined,
        rentalStartedAt: typeof booking.rentalStartedAt === "string" ? booking.rentalStartedAt : undefined,
        completedAt: typeof booking.completedAt === "string" ? booking.completedAt : undefined,
    };
}
export function readMockBookingRequests() {
    if (liveEnabled())
        return readLive("bookings");
    if (typeof window === "undefined")
        return [];
    try {
        const stored = window.localStorage.getItem(mockBookingRequestsKey);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.map(normalizeBooking).filter((booking) => Boolean(booking)) : [];
    }
    catch {
        return [];
    }
}
export function saveMockBookingRequest(request) {
    try {
        const requests = readMockBookingRequests();
        window.localStorage.setItem(mockBookingRequestsKey, JSON.stringify([...requests, request]));
    }
    catch {
        // Private browsing may block localStorage.
    }
}
export function findMockBookingRequest(id) {
    return readMockBookingRequests().find((booking) => booking.id === id) ?? null;
}
// Static properties take precedence in public lookup and have no account owner ID.
// Never infer ownership from display names or expose all requests to every Partner.
function roomOwnerId(record) {
    return record?.partnerUserId || findMockListingById(record?.propertyId)?.partnerUserId || null;
}
export function partnerOwnsBooking(booking, user) {
    const ownsListing = roomOwnerId(booking) === user.id;
    if (liveEnabled())
        return hasMockPartnerAccess(user) && ownsListing;
    return hasMockPartnerAccess(user)
        && !properties.some((property) => property.id === booking.propertyId)
        && ownsListing;
}
export function readMockBookingRequestsForPartner(user) {
    return readMockBookingRequests()
        .filter((booking) => partnerOwnsBooking(booking, user))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function readMockPaymentEvidence() {
    if (liveEnabled())
        return readLive("evidence");
    if (typeof window === "undefined")
        return [];
    try {
        const stored = window.localStorage.getItem(mockPaymentEvidenceKey);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.map(normalizePaymentEvidence).filter((evidence) => Boolean(evidence)) : [];
    }
    catch {
        return [];
    }
}
export function findMockPaymentEvidenceForBooking(bookingId) {
    return readMockPaymentEvidence()
        .filter((evidence) => evidence.bookingId === bookingId)
        .sort((first, second) => new Date(second.uploadedAt).getTime() - new Date(first.uploadedAt).getTime())[0] ?? null;
}
export function saveMockPaymentEvidence(evidence) {
    try {
        const storedEvidence = readMockPaymentEvidence().filter((item) => item.bookingId !== evidence.bookingId);
        window.localStorage.setItem(mockPaymentEvidenceKey, JSON.stringify([...storedEvidence, evidence]));
    }
    catch {
        // Private browsing may block localStorage.
    }
}
export function updateMockPaymentEvidence(updatedEvidence) {
    const evidence = readMockPaymentEvidence();
    window.localStorage.setItem(mockPaymentEvidenceKey, JSON.stringify(evidence.map((item) => item.id === updatedEvidence.id ? updatedEvidence : item)));
}
export function readMockReviews() {
    if (liveEnabled())
        return readLive("reviews");
    if (typeof window === "undefined")
        return [];
    try {
        const stored = window.localStorage.getItem(mockReviewsKey);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.map(normalizeReview).filter((review) => Boolean(review)) : [];
    }
    catch {
        return [];
    }
}
export function findMockReviewForBooking(bookingId) {
    return readMockReviews().find((review) => review.bookingId === bookingId) ?? null;
}
export function saveMockReview(review) {
    try {
        const reviews = readMockReviews();
        if (reviews.some((item) => item.bookingId === review.bookingId))
            return;
        window.localStorage.setItem(mockReviewsKey, JSON.stringify([...reviews, { ...review, status: review.status ?? "VISIBLE" }]));
        window.dispatchEvent(new Event(mockReviewsChangedEvent));
    }
    catch {
        // Private browsing may block localStorage.
    }
}
export const renterCancellableBookingStatuses = ["PENDING", "DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED"];
export function cancelMockBooking(id, userId) {
    if (liveEnabled())
        return null;
    const requests = readMockBookingRequests();
    const existing = requests.find((booking) => booking.id === id);
    if (!existing || existing.renterUserId !== userId || !renterCancellableBookingStatuses.includes(existing.status))
        return null;
    const updated = {
        ...existing,
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancelledById: userId,
    };
    window.localStorage.setItem(mockBookingRequestsKey, JSON.stringify(requests.map((booking) => booking.id === id ? updated : booking)));
    if (["DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED"].includes(existing.status))
        setMockRoomStatus(existing.propertyId, "AVAILABLE");
    window.dispatchEvent(new Event("roomstay:bookings-changed"));
    return updated;
}
export function updateMockBookingRequest(updatedBooking) {
    const requests = readMockBookingRequests();
    window.localStorage.setItem(mockBookingRequestsKey, JSON.stringify(requests.map((booking) => booking.id === updatedBooking.id ? updatedBooking : booking)));
}
export function readMockRoomStatuses() {
    if (typeof window === "undefined")
        return {};
    try {
        const stored = window.localStorage.getItem(mockRoomStatusesKey);
        const parsed = stored ? JSON.parse(stored) : {};
        return Object.fromEntries(Object.entries(parsed).filter((entry) => (entry[1] === "AVAILABLE" || entry[1] === "RESERVED" || entry[1] === "RENTED" || entry[1] === "UNAVAILABLE")));
    }
    catch {
        return {};
    }
}
export function defaultRoomStatus(availableNow) {
    return availableNow ? "AVAILABLE" : "UNAVAILABLE";
}
export function readMockRoomStatus(propertyId, fallbackStatus = "AVAILABLE") {
    const liveStatus = readLiveRoomStatus(propertyId);
    if (liveStatus === "AVAILABLE" || liveStatus === "RESERVED" || liveStatus === "RENTED" || liveStatus === "UNAVAILABLE")
        return liveStatus;
    const stored = readMockRoomStatuses()[propertyId];
    if (stored)
        return stored;
    // Published Partner properties expose only availableNow; use the original
    // listing to distinguish Reserved/Rented from Unavailable when no override exists.
    if (!properties.some((property) => property.id === propertyId)) {
        return findMockListingById(propertyId)?.roomStatus ?? fallbackStatus;
    }
    return fallbackStatus;
}
export function roomStatusLabel(status) {
    if (status === "AVAILABLE")
        return "Available";
    if (status === "RESERVED")
        return "Reserved";
    if (status === "RENTED")
        return "Rented";
    return "Unavailable";
}
export function roomStatusMessage(status) {
    if (status === "AVAILABLE")
        return "This property is available for viewing and booking requests.";
    if (status === "RESERVED")
        return "This property is currently reserved. New booking requests are unavailable.";
    if (status === "RENTED")
        return "This property is currently rented. New booking requests are unavailable.";
    return "This property is currently unavailable. Viewing and booking requests are disabled.";
}
export function setMockRoomStatus(propertyId, status) {
    const statuses = readMockRoomStatuses();
    window.localStorage.setItem(mockRoomStatusesKey, JSON.stringify({ ...statuses, [propertyId]: status }));
    window.dispatchEvent(new Event(mockRoomStatusesChangedEvent));
}
export function statusLabel(status) {
    if (status === "ACTIVE")
        return "RENTAL ACTIVE";
    if (status === "COMPLETED")
        return "COMPLETED";
    return status.replaceAll("_", " ");
}
// Presentational-only pill tones for booking statuses. Labels and the
// booking state machine are unchanged.
export function bookingStatusPillTone(status) {
    if (status === "ACTIVE")
        return "bg-[#1d7a3f] text-white ring-[#1d7a3f]";
    if (status === "CONFIRMED")
        return "bg-[#e7f6ee] text-[#1d7a3f] ring-[#c9e9d4]";
    if (status === "DEPOSIT_PENDING" || status === "APPROVED")
        return "bg-primary-tint text-primary ring-primary/25";
    if (status === "VERIFICATION_PENDING")
        return "bg-[#e8edff] text-[#3b4fd8] ring-[#d3dbff]";
    if (status === "DECLINED" || status === "CANCELLED" || status === "EXPIRED")
        return "bg-red-50 text-alert ring-red-100";
    if (status === "COMPLETED")
        return "bg-canvas text-ink ring-line";
    return "bg-canvas text-ink-secondary ring-line";
}
// Public and Partner displays exclude hidden reviews; renter history and Admin
// moderation continue to read the complete store, preserving duplicate checks.
export function readVisibleMockReviews() {
    return readMockReviews().filter((review) => review.status !== "HIDDEN");
}
export function moderateMockReview(id, status) {
    const reviews = readMockReviews();
    const existing = reviews.find((review) => review.id === id);
    if (!existing || (status === "HIDDEN" ? existing.status === "HIDDEN" : existing.status !== "HIDDEN"))
        return null;
    const updated = { ...existing, status, moderatedAt: new Date().toISOString(), moderatedBy: "Mock Admin" };
    window.localStorage.setItem(mockReviewsKey, JSON.stringify(reviews.map((review) => review.id === id ? updated : review)));
    window.dispatchEvent(new Event(mockReviewsChangedEvent));
    const booking = findMockBookingRequest(existing.bookingId);
    recordMockAuditLog({
        action: status === "HIDDEN" ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
        targetType: "REVIEW", targetId: updated.id, targetName: booking ? `Review of ${booking.propertyTitle}` : updated.id,
        details: `${existing.status ?? "VISIBLE"} → ${status}. Original review and booking retained.`,
    });
    return updated;
}
