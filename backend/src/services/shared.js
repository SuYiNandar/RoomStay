import { bookingTransaction } from "./locking.js";
import { HOLDING_BOOKING_STATUSES } from "../domain/rules.js";
import { HttpError } from "../http.js";

const bookingInclude = {
  property: { include: { photos: { orderBy: { sortOrder: "asc" } } } },
  renter: true,
  deposit: true,
  evidence: { orderBy: { uploadedAt: "desc" } },
  refund: true,
  review: true,
};

export { bookingInclude };

export async function currentCapability(db, userId) {
  const applications = await db.partnerApplication.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });
  return applications.find((application) => application.status === "SUSPENDED")
    ?? applications.find((application) => application.status !== "REJECTED")
    ?? applications[0]
    ?? null;
}

export async function requireApprovedPartner(db, userId) {
  const application = await currentCapability(db, userId);
  if (!application || application.status !== "APPROVED") {
    throw new HttpError(403, "Approved Partner access is required.");
  }
  return application;
}

export async function visiblePartnerIds(db) {
  const [approved, suspended] = await Promise.all([
    db.partnerApplication.findMany({ where: { status: "APPROVED" }, select: { userId: true } }),
    db.partnerApplication.findMany({ where: { status: "SUSPENDED" }, select: { userId: true } }),
  ]);
  const blocked = new Set(suspended.map((application) => application.userId));
  return [...new Set(approved.map((application) => application.userId).filter((id) => !blocked.has(id)))];
}

export async function releaseRoomIfClear(db, propertyId) {
  const holder = await db.booking.findFirst({
    where: { propertyId, status: { in: HOLDING_BOOKING_STATUSES } },
  });
  if (holder) return;
  const property = await db.property.findUnique({ where: { id: propertyId } });
  if (property && (property.roomStatus === "RESERVED" || property.roomStatus === "RENTED")) {
    await db.property.update({ where: { id: propertyId }, data: { roomStatus: "AVAILABLE" } });
  }
}

export async function sweepExpiredDeposits(db, now = new Date()) {
  const due = await db.booking.findMany({
    where: { status: "DEPOSIT_PENDING", paymentDeadline: { lte: now } },
  });
  for (const booking of due) {
    await bookingTransaction(db, booking.id, async (tx) => {
      const current = await tx.booking.findUnique({ where: { id: booking.id } });
      if (!current || current.status !== "DEPOSIT_PENDING" || !current.paymentDeadline || current.paymentDeadline > now) return;
      await tx.booking.update({ where: { id: current.id }, data: { status: "EXPIRED" } });
      await tx.reservationDeposit.updateMany({
        where: { bookingId: current.id },
        data: { verificationStatus: "REJECTED" },
      });
      await releaseRoomIfClear(tx, current.propertyId);
      await tx.notification.create({
        data: {
          userId: current.renterUserId,
          type: "BOOKING_EXPIRED",
          title: "Booking expired",
          message: "The payment deadline passed before the deposit was verified. The room is available again.",
          link: `/bookings/${current.id}`,
          relatedBookingId: current.id,
          relatedPropertyId: current.propertyId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorLabel: "System",
          action: "BOOKING_EXPIRED",
          targetType: "BOOKING",
          targetId: current.id,
          targetName: current.id,
          details: "DEPOSIT_PENDING → EXPIRED because the payment deadline passed.",
        },
      });
    });
  }
}

export async function loadBooking(db, id) {
  return db.booking.findUnique({ where: { id }, include: bookingInclude });
}

export function ownsProperty(property, userId) {
  return property?.partnerUserId === userId;
}

export async function assertVisibleProperty(db, propertyId) {
  if (typeof propertyId !== "string" || !propertyId.trim()) throw new HttpError(400, "Property ID is required.");
  const partnerIds = await visiblePartnerIds(db);
  const property = await db.property.findFirst({
    where: { id: propertyId, listingStatus: "PUBLISHED", partnerUserId: { in: partnerIds } },
    include: { photos: { orderBy: { sortOrder: "asc" } }, partner: true },
  });
  if (!property) throw new HttpError(404, "Property not found.");
  return property;
}
