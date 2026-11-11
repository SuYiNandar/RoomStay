import { api } from "@/lib/api";
import { rememberBooking } from "@/lib/live";
import { invalidateLiveRefresh, readLive, upsertLive, writeLive, writeLiveRoomStatus } from "@/lib/live-store";
function changed(name) {
    invalidateLiveRefresh();
    window.dispatchEvent(new Event(name));
}
export async function liveRequestBooking(input) {
    const data = await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify(input),
    });
    const booking = rememberBooking(data.booking);
    changed("roomstay:bookings-changed");
    changed("roomstay:room-statuses-changed");
    return booking;
}
export async function liveSetRoomAvailability(propertyId, roomStatus) {
    const data = await api(`/api/partner/listings/${propertyId}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ roomStatus }),
    });
    upsertLive("listings", data.listing);
    writeLiveRoomStatus(propertyId, data.listing.roomStatus);
    changed("roomstay:listings-changed");
    changed("roomstay:room-statuses-changed");
    return data.listing;
}
export async function liveRequestViewing(input) {
    const data = await api("/api/viewings", {
        method: "POST",
        body: JSON.stringify(input),
    });
    upsertLive("viewings", data.viewing);
    changed("roomstay:viewings-changed");
    return data.viewing;
}
export async function liveCancelViewing(id) {
    const data = await api(`/api/viewings/${id}/cancel`, { method: "POST" });
    upsertLive("viewings", data.viewing);
    changed("roomstay:viewings-changed");
    return data.viewing;
}
export async function liveDecideViewing(id, decision) {
    const data = await api(`/api/partner/viewings/${id}/decision`, {
        method: "POST",
        body: JSON.stringify(decision),
    });
    upsertLive("viewings", data.viewing);
    changed("roomstay:viewings-changed");
    return data.viewing;
}
async function partnerBooking(path, body) {
    const data = await api(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const booking = rememberBooking(data.booking);
    const list = await api("/api/partner/bookings");
    for (const item of list.bookings)
        rememberBooking(item);
    changed("roomstay:bookings-changed");
    changed("roomstay:room-statuses-changed");
    return booking;
}
export function liveApproveBooking(id, depositAmount, paymentDeadline) {
    return partnerBooking(`/api/partner/bookings/${id}/approve`, { depositAmount, paymentDeadline });
}
export function liveDeclineBooking(id, declineReason) {
    return partnerBooking(`/api/partner/bookings/${id}/decline`, { declineReason });
}
export function liveVerifyEvidence(id) {
    return partnerBooking(`/api/partner/bookings/${id}/verify-evidence`);
}
export function liveRejectEvidence(id, rejectionReason) {
    return partnerBooking(`/api/partner/bookings/${id}/reject-evidence`, { rejectionReason });
}
export function liveStartRental(id) {
    return partnerBooking(`/api/partner/bookings/${id}/start`);
}
export function liveCompleteRental(id) {
    return partnerBooking(`/api/partner/bookings/${id}/complete`);
}
export async function liveUploadEvidence(bookingId, input) {
    const body = new FormData();
    body.append("file", input.file);
    body.append("note", input.note ?? "");
    const data = await api(`/api/bookings/${bookingId}/evidence`, {
        method: "POST",
        body,
    });
    const booking = rememberBooking(data.booking);
    changed("roomstay:bookings-changed");
    return booking;
}
export async function liveLeaveReview(bookingId, input) {
    const data = await api(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const booking = rememberBooking(data.booking);
    changed("roomstay:bookings-changed");
    changed("roomstay:reviews-changed");
    if (!data.booking.review)
        throw new Error("Review was not saved.");
    return { ...data.booking.review, booking };
}
export async function liveToggleFavorite(userId, propertyId) {
    const data = await api(`/api/favorites/${propertyId}`, { method: "POST" });
    const current = readLive("favorites");
    writeLive("favorites", data.saved
        ? [...current.filter((favorite) => favorite.propertyId !== propertyId), { renterUserId: userId, propertyId, createdAt: new Date().toISOString() }]
        : current.filter((favorite) => favorite.propertyId !== propertyId));
    changed("roomstay:favorites-changed");
    return data.saved;
}
export async function liveOpenConversation(propertyId) {
    const existing = await api("/api/conversations");
    const found = existing.conversations.find((conversation) => conversation.propertyId === propertyId);
    if (found)
        return found;
    const created = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ propertyId }),
    });
    upsertLive("conversations", created.conversation);
    for (const message of created.messages)
        upsertLive("messages", message);
    changed("roomstay:messages-changed");
    return created.conversation;
}
export async function livePartnerPaymentChat(bookingId, text) {
    const data = await api(`/api/partner/bookings/${bookingId}/payment-chat`, {
        method: "POST",
        body: JSON.stringify({ text }),
    });
    return data.inquiry;
}
export async function livePaymentChat(bookingId, text) {
    const data = await api(`/api/bookings/${bookingId}/payment-chat`, {
        method: "POST",
        body: JSON.stringify({ text }),
    });
    return data.inquiry;
}
export async function liveAdminPaymentReply(inquiryId, text) {
    const data = await api(`/api/admin/payment-chats/${inquiryId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
    });
    return data.inquiry;
}
export async function liveSendMessage(conversationId, text) {
    const data = await api(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
    });
    upsertLive("messages", data.message);
    changed("roomstay:messages-changed");
    return data.message;
}
export async function liveSubmitPartnerApplication(input) {
    const body = new FormData();
    for (const [key, value] of Object.entries(input)) if (value !== undefined) body.append(key, value);
    const data = await api("/api/partner-applications", {
        method: "POST",
        body,
    });
    upsertLive("applications", data.application);
    changed("roomstay:partner-applications-changed");
    return data.application;
}
export async function liveSaveListing(input, submit) {
    const fields = {
        title: input.title,
        propertyType: input.propertyType,
        monthlyRent: input.monthlyRent,
        location: input.location,
        buildingName: input.buildingName,
        fullAddress: input.fullAddress,
        area: input.area,
        province: input.province,
        description: input.description,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        sizeSqm: input.sizeSqm,
        facilities: input.facilities,

        houseRules: input.houseRules,
    };
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) body.append(key, key === "facilities" ? value.join(",") : typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    body.append("keptPhotos", JSON.stringify((input.keptPhotos || []).map(photo => photo.src)));
    for (const file of input.files || []) body.append("photos", file);
    const saved = input.id
        ? await api(`/api/partner/listings/${input.id}`, { method: "PATCH", body })
        : await api("/api/partner/listings", { method: "POST", body });
    const listing = submit
        ? (await api(`/api/partner/listings/${saved.listing.id}/submit`, { method: "POST" })).listing
        : saved.listing;
    upsertLive("listings", listing);
    writeLiveRoomStatus(listing.id, listing.roomStatus);
    changed("roomstay:listings-changed");
    return listing;
}
function syncDirectoryApplication(application) {
    writeLive("users", readLive("users").map((person) => person.id === application.userId
        ? { ...person, partnerState: application.status, application }
        : person));
}
export async function liveReloadAdminApplications() {
    const data = await api("/api/admin/partner-applications");
    writeLive("applications", data.applications);
    changed("roomstay:partner-applications-changed");
    return data.applications;
}
export async function liveReviewApplication(id, decision) {
    const data = await api(`/api/admin/partner-applications/${id}/review`, {
        method: "POST",
        body: JSON.stringify(decision),
    });
    upsertLive("applications", data.application);
    syncDirectoryApplication(data.application);
    changed("roomstay:partner-applications-changed");
    return data.application;
}
export async function liveChangePartnerAccess(userId, decision) {
    const path = decision.status === "SUSPENDED" ? "suspend" : "restore";
    const data = await api(`/api/admin/partners/${userId}/${path}`, {
        method: "POST",
        body: JSON.stringify(decision.status === "SUSPENDED" ? { reason: decision.reason } : {}),
    });
    upsertLive("applications", data.application);
    syncDirectoryApplication(data.application);
    changed("roomstay:partner-applications-changed");
    return data.application;
}
export async function liveReviewListing(id, decision) {
    const data = await api(`/api/admin/listings/${id}/review`, {
        method: "POST",
        body: JSON.stringify(decision),
    });
    upsertLive("listings", data.listing);
    changed("roomstay:listings-changed");
    return data.listing;
}
export async function liveReviewReport(id, decision) {
    const data = await api(`/api/admin/reports/${id}/review`, {
        method: "POST",
        body: JSON.stringify(decision),
    });
    upsertLive("reports", data.report);
    changed("roomstay:reports-changed");
    return data.report;
}
export async function liveModerateReview(id, status) {
    const data = await api(`/api/admin/reviews/${id}/moderate`, {
        method: "POST",
        body: JSON.stringify({ status }),
    });
    upsertLive("reviews", data.review);
    changed("roomstay:reviews-changed");
    return data.review;
}

export async function liveCancelBooking(id, partner = false) {
    const data = await api(`/api/${partner ? "partner/" : ""}bookings/${id}/cancel`, { method: "POST" });
    const booking = rememberBooking(data.booking);
    changed("roomstay:bookings-changed");
    changed("roomstay:room-statuses-changed");
    return booking;
}
export function liveRecordRefund(id, input) {
    return partnerBooking(`/api/partner/bookings/${id}/refund`, input);
}
export async function liveSubmitReport(input) {
    const data = await api("/api/reports", { method: "POST", body: JSON.stringify(input) });
    return data.report;
}
