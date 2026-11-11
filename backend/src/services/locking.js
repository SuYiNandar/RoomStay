import { HttpError } from "../http.js";

// Every room/booking mutation takes this same lock before reading mutable state.
// ReadCommitted makes reads after a waiting lock see the committed winner.
export async function lockProperty(tx, propertyId) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
  if (!rows.length) throw new HttpError(404, "Property not found.");
}
export function propertyTransaction(db, propertyId, work) {
  return db.$transaction(async tx => {
    await lockProperty(tx, propertyId);
    return work(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 });
}
export function bookingTransaction(db, bookingId, work) {
  return db.$transaction(async tx => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { propertyId: true } });
    if (!booking) throw new HttpError(404, "Booking not found.");
    await lockProperty(tx, booking.propertyId);
    return work(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 });
}
