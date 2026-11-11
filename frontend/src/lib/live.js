import { api, publicImageUrl, authToken } from "@/lib/api";
import { propertyTypes } from "@/types/property";
import { liveEnabled, liveVersion, readLive, setLiveEnabled, upsertLive, writeLive, writeLiveRoomStatus, writeLiveRoomStatuses, } from "@/lib/live-store";
function text(value) {
    return typeof value === "string" ? value : undefined;
}
export function apiPropertyToProperty(item) {
    if (!propertyTypes.includes(item.propertyType))
        return null;
    const image = publicImageUrl(item.image || item.images?.[0]?.src || "/images/home/cozy-condo.jpg");
    const imageAlt = item.imageAlt || item.images?.[0]?.alt || item.title;
    return {
        id: item.id,
        title: item.title,
        location: item.location,
        buildingName: text(item.buildingName),
        fullAddress: text(item.fullAddress),
        area: text(item.area),
        province: text(item.province),
        price: item.price,
        image,
        imageAlt,
        images: item.images?.length ? item.images.map(photo => ({ ...photo, src: publicImageUrl(photo.src) })) : [{ src: image, alt: imageAlt }],
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        size: item.size,
        propertyType: item.propertyType,
        facilities: item.facilities.filter((facility) => typeof facility === "string"),
        description: item.description,
        reviews: item.reviews || [],
        owner: {
            name: item.owner?.name ?? "Property Partner",
            initials: item.owner?.initials ?? "PP",
            memberSince: "2026",
            rating: item.rating ?? 0,
            reviews: item.reviewCount ?? 0,
        },
        availableNow: item.roomStatus === "AVAILABLE",
        popular: item.popular,
        houseRules: item.houseRules ?? undefined,
        roomStatus: item.roomStatus,
        partnerUserId: text(item.partnerUserId),
    };
}
let catalog = null;
export function cachedApiProperties() {
    return catalog;
}
export async function loadApiProperties() {
    const data = await api("/api/properties");
    const properties = data.properties.map(apiPropertyToProperty).filter((property) => Boolean(property));
    catalog = properties;
    writeLiveRoomStatuses(Object.fromEntries(data.properties.map((property) => [property.id, property.roomStatus])));
    if (typeof window !== "undefined")
        window.dispatchEvent(new Event("roomstay:room-statuses-changed"));
    return properties;
}
function asBooking(raw) {
    const booking = {
        ...raw,
        message: raw.message ?? "",
        depositAmount: raw.depositAmount ?? undefined,
        paymentDeadline: text(raw.paymentDeadline),
        approvedAt: text(raw.approvedAt),
        declinedAt: text(raw.declinedAt),
        declineReason: text(raw.declineReason),
        rentalStartedAt: text(raw.rentalStartedAt),
        completedAt: text(raw.completedAt),
    };
    if (raw.roomStatus)
        writeLiveRoomStatus(raw.propertyId, raw.roomStatus);
    if (raw.evidence)
        upsertLive("evidence", raw.evidence);
    if (raw.review)
        upsertLive("reviews", raw.review);
    return booking;
}
export function rememberBooking(raw) {
    const booking = asBooking(raw);
    upsertLive("bookings", booking);
    return booking;
}
async function collect(paths, key) {
    const pages = await Promise.all(paths.map((path) => api(path)));
    const seen = new Set();
    const records = [];
    for (const page of pages) {
        for (const record of page[key] ?? []) {
            const id = record.id;
            if (seen.has(id))
                continue;
            seen.add(id);
            records.push(record);
        }
    }
    return records;
}
export async function refreshLiveSession(userId, role, isPartner, { reset = true } = {}) {
    if (reset) { setLiveEnabled(false); setLiveEnabled(true); }
    const version = liveVersion();
    const token = authToken();
    const bookingPaths = role === "ADMIN" ? ["/api/admin/bookings"] : ["/api/bookings", ...(isPartner ? ["/api/partner/bookings"] : [])];
    const viewingPaths = role === "ADMIN" ? [] : ["/api/viewings", ...(isPartner ? ["/api/partner/viewings"] : [])];
    const [bookings, viewings, favorites, conversations, notifications, applications, listings, reports, reviews, audits, users] = await Promise.all([
        collect(bookingPaths, "bookings"),
        viewingPaths.length ? collect(viewingPaths, "viewings") : [],
        role !== "ADMIN" ? api("/api/favorites") : { favorites: [] },
        api("/api/conversations"), api("/api/notifications"),
        api(role === "ADMIN" ? "/api/admin/partner-applications" : "/api/partner-applications/me"),
        role === "ADMIN" ? api("/api/admin/listings") : isPartner ? api("/api/partner/listings") : { listings: [] },
        role === "ADMIN" ? api("/api/admin/reports") : { reports: [] },
        role === "ADMIN" ? api("/api/admin/reviews") : { reviews: [] },
        role === "ADMIN" ? api("/api/admin/audit-logs") : { auditLogs: [] },
        role === "ADMIN" ? api("/api/admin/users") : { users: [] },
    ]);
    const details = await Promise.all(conversations.conversations.map(item => api(`/api/conversations/${item.id}`)));
    // Never repopulate private caches after logout, a new account, or a newer local write.
    if (authToken() !== token || liveVersion() !== version || !liveEnabled()) return false;
    const snapshot = {
        bookings: bookings.map(asBooking), viewings,
        evidence: bookings.map(item => item.evidence).filter(Boolean),
        reviews: role === "ADMIN" ? reviews.reviews : bookings.map(item => item.review).filter(Boolean),
        favorites: favorites.favorites.map(item => ({ renterUserId: userId, propertyId: item.property.id, createdAt: item.createdAt || "" })),
        conversations: conversations.conversations, messages: details.flatMap(item => item.messages),
        notifications: notifications.notifications.map(item => ({ ...item, renterUserId: item.userId })),
        applications: applications.applications, listings: listings.listings, reports: reports.reports,
        audits: audits.auditLogs, users: users.users,
    };
    for (const [key, records] of Object.entries(snapshot)) writeLive(key, records);
    if (typeof window !== "undefined") {
        for (const name of ["bookings", "viewings", "favorites", "messages", "notifications", "listings", "partner-applications", "reports", "reviews", "audit-logs", "room-statuses", "users"])
            window.dispatchEvent(new Event(`roomstay:${name}-changed`));
    }
    return true;
}
export function liveRecords(bucket) {
    return liveEnabled() ? readLive(bucket) : null;
}
export { liveEnabled };
