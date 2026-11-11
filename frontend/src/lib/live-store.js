const buckets = {
    bookings: [],
    evidence: [],
    reviews: [],
    viewings: [],
    favorites: [],
    conversations: [],
    messages: [],
    notifications: [],
    listings: [],
    applications: [],
    reports: [],
    audits: [],
    users: [],
};
const roomStatuses = {};
let enabled = false;
let version = 0;
export function liveVersion() { return version; }
export function invalidateLiveRefresh() { version += 1; }
export function liveEnabled() {
    return enabled;
}
export function setLiveEnabled(value) {
    enabled = value;
    if (!value) {
        version += 1;
        for (const bucket of Object.keys(buckets)) buckets[bucket] = [];
        for (const id of Object.keys(roomStatuses)) delete roomStatuses[id];
    }
}
export function readLive(bucket) {
    return buckets[bucket];
}
export function writeLive(bucket, records) {
    buckets[bucket] = records;
}
export function upsertLive(bucket, record) {
    const records = buckets[bucket];
    const index = records.findIndex((item) => item.id === record.id);
    buckets[bucket] = index === -1 ? [...records, record] : records.map((item) => item.id === record.id ? record : item);
}
export function readLiveRoomStatus(propertyId) {
    return roomStatuses[propertyId];
}
export function writeLiveRoomStatus(propertyId, status) {
    roomStatuses[propertyId] = status;
}
export function writeLiveRoomStatuses(statuses) {
    for (const [propertyId, status] of Object.entries(statuses))
        roomStatuses[propertyId] = status;
}
