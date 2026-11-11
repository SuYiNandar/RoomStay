import { bookingTransaction, propertyTransaction } from "./locking.js";
import {
  approveBookingState,
  assertMoveInDate,
  canRequestBooking,
  cancelBookingState,
  completeRentalState,
  createReviewState,
  declineBookingState,
  recordRefundState,
  rejectEvidenceState,
  startRentalState,
  uploadEvidenceState,
  verifyEvidenceState,
} from "../domain/rules.js";
import { HttpError } from "../http.js";
import {
  assertVisibleProperty,
  bookingInclude,
  loadBooking,
  releaseRoomIfClear,
  requireApprovedPartner,
  sweepExpiredDeposits,
} from "./shared.js";

async function partnerBooking(db, userId, id) {
  await requireApprovedPartner(db, userId);
  const booking = await loadBooking(db, id);
  if (!booking || booking.property.partnerUserId !== userId) throw new HttpError(404, "Booking not found.");
  return booking;
}

async function renterBooking(db, userId, id) {
  const booking = await loadBooking(db, id);
  if (!booking || booking.renterUserId !== userId) throw new HttpError(404, "Booking not found.");
  return booking;
}

export async function requestBooking(db, user, input) {
  await sweepExpiredDeposits(db);
  if (typeof input.propertyId !== "string" || !input.propertyId.trim()) throw new HttpError(400, "Property ID is required.");
  return propertyTransaction(db, input.propertyId, async tx => {
  const property = await assertVisibleProperty(tx, input.propertyId);
  if (property.partnerUserId === user.id) throw new HttpError(409, "You cannot book your own listing.");
  if (!canRequestBooking(property.roomStatus)) throw new HttpError(409, "This property is not available for a new booking.");
  assertMoveInDate(input.requestedMoveInDate);
  const duplicate = await tx.booking.findFirst({ where: { propertyId: property.id, renterUserId: user.id, status: { in: ["PENDING", "DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED", "ACTIVE"] } } });
  if (duplicate) throw new HttpError(409, "You already have an open booking for this property.");
  return tx.booking.create({
    data: {
      propertyId: property.id,
      renterUserId: user.id,
      requestedMoveInDate: input.requestedMoveInDate,
      message: input.message?.trim() ?? "",
      status: "PENDING",
      monthlyRent: property.monthlyRent,
    },
    include: bookingInclude,
  });
  });
}

export async function listBookingsForRenter(db, userId) {
  await sweepExpiredDeposits(db);
  return db.booking.findMany({ where: { renterUserId: userId }, include: bookingInclude, orderBy: { createdAt: "desc" } });
}

export async function listBookingsForPartner(db, userId) {
  await requireApprovedPartner(db, userId);
  await sweepExpiredDeposits(db);
  return db.booking.findMany({
    where: { property: { partnerUserId: userId } },
    include: bookingInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingForRenter(db, userId, id) {
  await sweepExpiredDeposits(db);
  return renterBooking(db, userId, id);
}

export async function getBookingForPartner(db, userId, id) {
  await sweepExpiredDeposits(db);
  return partnerBooking(db, userId, id);
}

export async function approveBooking(db, user, id, input) {
  await requireApprovedPartner(db, user.id);
  await sweepExpiredDeposits(db);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await tx.booking.findUnique({ where: { id }, include: { property: true, renter: true } });
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const next = approveBookingState({
      booking,
      roomStatus: booking.property.roomStatus,
      depositAmount: input.depositAmount,
      paymentDeadline: input.paymentDeadline,
      now,
    });
    const reserved = await tx.property.updateMany({
      where: { id: booking.propertyId, roomStatus: "AVAILABLE" },
      data: { roomStatus: "RESERVED" },
    });
    if (reserved.count !== 1) throw new HttpError(409, "This room was just reserved by another booking.");
    await tx.booking.update({ where: { id }, data: next.booking });
    await tx.reservationDeposit.create({ data: { bookingId: id, ...next.deposit } });
    const others = await tx.booking.findMany({
      where: { propertyId: booking.propertyId, status: "PENDING", id: { not: id } },
    });
    if (others.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: others.map((item) => item.id) } },
        data: { status: "DECLINED", declinedAt: now, declineReason: "The room was reserved by another renter." },
      });
      await tx.notification.createMany({
        data: others.map((item) => ({
          userId: item.renterUserId,
          type: "BOOKING_DECLINED",
          title: "Booking declined",
          message: "The room was reserved by another renter.",
          link: `/bookings/${item.id}`,
          relatedBookingId: item.id,
          relatedPropertyId: booking.propertyId,
        })),
      });
    }
    await tx.notification.create({
      data: {
        userId: booking.renterUserId,
        type: "BOOKING_APPROVED",
        title: "Booking approved",
        message: `Your booking was approved. Pay the deposit outside RoomStay before the deadline, then upload evidence.`,
        link: `/bookings/${booking.id}`,
        relatedBookingId: booking.id,
        relatedPropertyId: booking.propertyId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "BOOKING_APPROVED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: `PENDING → DEPOSIT_PENDING. Room set to RESERVED. Deposit ${next.deposit.amount}.`,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function declineBooking(db, user, id, input) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await tx.booking.findUnique({ where: { id }, include: { property: true } });
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const next = declineBookingState({ booking, declineReason: input.declineReason, now });
    await tx.booking.update({ where: { id }, data: next.booking });
    await tx.notification.create({
      data: {
        userId: booking.renterUserId,
        type: "BOOKING_DECLINED",
        title: "Booking declined",
        message: `Your booking request was declined. ${next.booking.declineReason}`,
        link: `/bookings/${booking.id}`,
        relatedBookingId: booking.id,
        relatedPropertyId: booking.propertyId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "BOOKING_DECLINED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: `PENDING → DECLINED. Reason: ${next.booking.declineReason}`,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function uploadEvidence(db, user, id, file) {
  await sweepExpiredDeposits(db);
  const now = new Date();
  const preview = await db.booking.findUnique({ where: { id } });
  if (!preview || preview.renterUserId !== user.id) throw new HttpError(404, "Booking not found.");
  const decision = uploadEvidenceState({ booking: preview, now, fileName: file.fileName, fileType: file.fileType });
  if (decision.expired) {
    await bookingTransaction(db, id, async (tx) => {
      const current = await tx.booking.findUnique({ where: { id } });
      if (!current || current.status !== "DEPOSIT_PENDING") return;
      await tx.booking.update({ where: { id }, data: { status: "EXPIRED" } });
      await releaseRoomIfClear(tx, current.propertyId);
    });
    throw new HttpError(409, "The payment deadline has passed. The booking expired and the room is available again.");
  }
  return bookingTransaction(db, id, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id }, include: { property: true } });
    if (!booking || booking.renterUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const next = uploadEvidenceState({ booking, now: new Date(), fileName: file.fileName, fileType: file.fileType });
    if (next.expired) throw new HttpError(409, "The payment deadline has passed. The booking expired and the room is available again.");
    await tx.booking.update({ where: { id }, data: next.booking });
    await tx.reservationDeposit.update({
      where: { bookingId: id },
      data: { verificationStatus: next.depositStatus },
    });
    await tx.paymentEvidence.create({
      data: {
        bookingId: id,
        fileName: next.evidence.fileName,
        fileType: next.evidence.fileType,
        storedPath: file.storedPath ?? null,
        note: file.note?.trim() ?? "",
        status: "PENDING_VERIFICATION",
        uploadedAt: now,
      },
    });
    await tx.notification.create({
      data: {
        userId: booking.property.partnerUserId,
        type: "EVIDENCE_UPLOADED",
        title: "Payment evidence uploaded",
        message: `${user.fullName} uploaded payment evidence for ${booking.property.title}.`,
        link: `/partner/bookings/${booking.id}`,
        relatedBookingId: booking.id,
        relatedPropertyId: booking.propertyId,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function verifyEvidence(db, user, id) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await loadBooking(tx, id);
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const evidence = booking.evidence[0];
    const next = verifyEvidenceState({ booking, evidence });
    await tx.booking.update({ where: { id }, data: next.booking });
    await tx.property.update({ where: { id: booking.propertyId }, data: { roomStatus: next.roomStatus } });
    await tx.reservationDeposit.update({ where: { bookingId: id }, data: { verificationStatus: next.depositStatus } });
    await tx.paymentEvidence.update({
      where: { id: evidence.id },
      data: { ...next.evidence, verifiedAt: now, verifiedById: user.id },
    });
    await tx.notification.create({
      data: {
        userId: booking.renterUserId,
        type: "PAYMENT_VERIFIED",
        title: "Payment evidence verified",
        message: "Your payment evidence was verified. The booking is confirmed and the room stays reserved.",
        link: `/bookings/${booking.id}`,
        relatedBookingId: booking.id,
        relatedEvidenceId: evidence.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "EVIDENCE_VERIFIED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: "VERIFICATION_PENDING → CONFIRMED. Room remains RESERVED.",
      },
    });
    return loadBooking(tx, id);
  });
}

export async function rejectEvidence(db, user, id, input) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await loadBooking(tx, id);
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const evidence = booking.evidence[0];
    const next = rejectEvidenceState({ booking, evidence, rejectionReason: input.rejectionReason, now });
    await tx.booking.update({ where: { id }, data: next.booking });
    if (next.releaseRoom) await releaseRoomIfClear(tx, booking.propertyId);
    else await tx.property.update({ where: { id: booking.propertyId }, data: { roomStatus: "RESERVED" } });
    await tx.reservationDeposit.update({ where: { bookingId: id }, data: { verificationStatus: next.depositStatus } });
    await tx.paymentEvidence.update({ where: { id: evidence.id }, data: next.evidence });
    await tx.notification.create({
      data: {
        userId: booking.renterUserId,
        type: "PAYMENT_REJECTED",
        title: next.booking.status === "EXPIRED" ? "Booking expired" : "Payment evidence rejected",
        message: next.booking.status === "EXPIRED"
          ? "Payment evidence was rejected after the deadline. The booking expired and the room is available again."
          : `Payment evidence was rejected. You can upload new evidence before the deadline. ${next.evidence.rejectionReason}`,
        link: `/bookings/${booking.id}`,
        relatedBookingId: booking.id,
        relatedEvidenceId: evidence.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: next.booking.status === "EXPIRED" ? "BOOKING_EXPIRED" : "EVIDENCE_REJECTED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: `Evidence rejected. Booking is ${next.booking.status}. Reason: ${next.evidence.rejectionReason}`,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function startRental(db, user, id) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await loadBooking(tx, id);
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const next = startRentalState({ booking, roomStatus: booking.property.roomStatus, now });
    await tx.booking.update({ where: { id }, data: next.booking });
    await tx.property.update({ where: { id: booking.propertyId }, data: { roomStatus: next.roomStatus } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "RENTAL_STARTED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: "CONFIRMED → ACTIVE. Room set to RENTED.",
      },
    });
    return loadBooking(tx, id);
  });
}

export async function completeRental(db, user, id) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await loadBooking(tx, id);
    if (!booking || booking.property.partnerUserId !== user.id) throw new HttpError(404, "Booking not found.");
    const next = completeRentalState({ booking, roomStatus: booking.property.roomStatus, now });
    await tx.booking.update({ where: { id }, data: next.booking });
    await releaseRoomIfClear(tx, booking.propertyId);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "RENTAL_COMPLETED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: "ACTIVE → COMPLETED. Room returned to AVAILABLE when no other reservation holds it.",
      },
    });
    return loadBooking(tx, id);
  });
}

export async function cancelBooking(db, user, id) {
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await loadBooking(tx, id);
    if (!booking) throw new HttpError(404, "Booking not found.");
    const isPartner = booking.property.partnerUserId === user.id;
    const isRenter = booking.renterUserId === user.id;
    if (!isPartner && !isRenter) throw new HttpError(404, "Booking not found.");
    if (isPartner) await requireApprovedPartner(tx, user.id);
    const next = cancelBookingState({
      booking,
      actorRole: isPartner ? "PARTNER" : "RENTER",
      now,
      actorId: user.id,
    });
    await tx.booking.update({ where: { id }, data: next.booking });
    if (next.releaseRoom) await releaseRoomIfClear(tx, booking.propertyId);
    const recipient = isPartner ? booking.renterUserId : booking.property.partnerUserId;
    await tx.notification.create({
      data: {
        userId: recipient,
        type: "BOOKING_CANCELLED",
        title: "Booking cancelled",
        message: `${user.fullName} cancelled the booking for ${booking.property.title}.`,
        link: isPartner ? `/bookings/${booking.id}` : `/partner/bookings/${booking.id}`,
        relatedBookingId: booking.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "BOOKING_CANCELLED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: `${booking.status} → CANCELLED.`,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function recordRefund(db, user, id, input) {
  await requireApprovedPartner(db, user.id);
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await partnerBooking(tx, user.id, id);
    const next = recordRefundState({ booking, ...input });
    await tx.refund.upsert({
      where: { bookingId: id },
      update: { ...next, recordedAt: now, recordedById: user.id },
      create: { bookingId: id, ...next, recordedAt: now, recordedById: user.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorLabel: user.fullName,
        action: "REFUND_RECORDED",
        targetType: "BOOKING",
        targetId: booking.id,
        targetName: booking.property.title,
        details: `Refund recorded as ${next.status}. Money movement stays outside RoomStay.`,
      },
    });
    return loadBooking(tx, id);
  });
}

export async function leaveReview(db, user, id, input) {
  return bookingTransaction(db, id, async (tx) => {
    const now = new Date();
    const booking = await renterBooking(tx, user.id, id);
    const next = createReviewState({ booking, existingReview: booking.review, rating: input.rating, comment: input.comment });
    await tx.review.create({
      data: { bookingId: id, renterUserId: user.id, ...next, createdAt: now },
    });
    return loadBooking(tx, id);
  });
}
