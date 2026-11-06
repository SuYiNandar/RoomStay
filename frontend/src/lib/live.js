import { api } from "@/lib/api";
import { propertyTypes } from "@/types/property";
import { liveEnabled, readLive, setLiveEnabled, upsertLive, writeLive, writeLiveRoomStatus, writeLiveRoomStatuses, } from "@/lib/live-store";
function text(value) {
    return typeof value === "string" ? value : undefined;
}
export function apiPropertyToProperty(item) {
    if (!propertyTypes.includes(item.propertyType))
        return null;
    const image = item.image || item.images?.[0]?.src || "/images/home/cozy-condo.jpg";
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
        images: item.images?.length ? item.images : [{ src: image, alt: imageAlt }],
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        size: item.size,
        propertyType: item.propertyType,
        facilities: item.facilities.filter((facility) => typeof facility === "string"),
        description: item.description,
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
export async function refreshLiveSession(userId, role, isPartner) {
    setLiveEnabled(true);
    await loadApiProperties().catch(() => undefined);
    const bookingPaths = role === "ADMIN" ? [] : ["/api/bookings", ...(isPartner ? ["/api/partner/bookings"] : [])];
    const viewingPaths = role === "ADMIN" ? [] : ["/api/viewings", ...(isPartner ? ["/api/partner/viewings"] : [])];
    const bookings = bookingPaths.length ? await collect(bookingPaths, "bookings") : [];
    writeLive("bookings", bookings.map((booking) => asBooking(booking)));
    writeLive("evidence", bookings.map((booking) => booking.evidence).filter(Boolean));
    writeLive("reviews", bookings.map((booking) => booking.review).filter(Boolean));
    writeLive("viewings", viewingPaths.length ? await collect(viewingPaths, "viewings") : []);
    if (role !== "ADMIN") {
        const favorites = await api("/api/favorites");
        writeLive("favorites", favorites.favorites.map((favorite) => ({
            renterUserId: userId,
            propertyId: favorite.property.id,
            createdAt: new Date().toISOString(),
        })));
    }
    const conversations = await api("/api/conversations");
    writeLive("conversations", conversations.conversations);
    const messages = [];
    for (const conversation of conversations.conversations) {
        const detail = await api(`/api/conversations/${conversation.id}`);
        messages.push(...detail.messages);
    }
    writeLive("messages", messages);
    const notifications = await api("/api/notifications");
    writeLive("notifications", notifications.notifications.map((notification) => ({
        ...notification,
        renterUserId: notification.userId,
    })));
    if (isPartner || role === "USER") {
        const applications = await api("/api/partner-applications/me");
        writeLive("applications", applications.applications);
    }
    if (isPartner) {
        const listings = await api("/api/partner/listings");
        writeLive("listings", listings.listings);
    }
    if (role === "ADMIN") {
        const [applications, listings, reports, reviews, audits] = await Promise.all([
            api("/api/admin/partner-applications"),
            api("/api/admin/listings"),
            api("/api/admin/reports"),
            api("/api/admin/reviews"),
            api("/api/admin/audit-logs"),
        ]);
        writeLive("applications", applications.applications);
        writeLive("listings", listings.listings);
        writeLive("reports", reports.reports);
        writeLive("reviews", reviews.reviews);
        writeLive("audits", audits.auditLogs);
        const users = await api("/api/admin/users");
        writeLive("users", users.users);
    }
    if (typeof window !== "undefined") {
        for (const name of [
            "roomstay:bookings-changed",
            "roomstay:viewings-changed",
            "roomstay:favorites-changed",
            "roomstay:messages-changed",
            "roomstay:notifications-changed",
            "roomstay:listings-changed",
            "roomstay:partner-applications-changed",
            "roomstay:reports-changed",
            "roomstay:reviews-changed",
            "roomstay:audit-logs-changed",
            "roomstay:room-statuses-changed",
        ])
            window.dispatchEvent(new Event(name));
    }
}
export function liveRecords(bucket) {
    return liveEnabled() ? readLive(bucket) : null;
}
export { liveEnabled };
