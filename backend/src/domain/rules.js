import { HttpError } from "../http.js";

export const VIEWING_TIMES = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
  "19:00", "20:00", "21:00",
];

export const HOLDING_BOOKING_STATUSES = [
  "DEPOSIT_PENDING",
  "VERIFICATION_PENDING",
  "CONFIRMED",
  "ACTIVE",
];

const GUEST_POLICIES = new Set(["ALLOWED", "LIMITED", "NOT_ALLOWED"]);
const SUITABLE_FOR = new Set(["STUDENTS", "PROFESSIONALS", "FAMILIES"]);

export const MINIMUM_DEPOSIT_AMOUNT = 1000;
export const DEPOSIT_AMOUNT_ERROR = "Deposit amount must be at least ฿1,000.";
export const PAYMENT_DEADLINE_ERROR = "Payment deadline must be a future date and time.";

function parseDepositAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePaymentDeadline(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value !== "string" || value.trim() === "") return null;
  const deadline = new Date(value);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

export function todayDateString(now = new Date()) {
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

export function assertIsoDate(value, label) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} must be a valid date.`);
  }
}

export function paymentInstructions(amount, deadline, bookingId) {
  const formatted = new Intl.NumberFormat("en-US").format(amount);
  return `Pay the reservation deposit of ฿${formatted} outside RoomStay before ${deadline.toISOString()}. Use booking ${bookingId} as the payment reference. RoomStay does not process the bank transfer. After you pay, upload the payment evidence so the Partner can verify it.`;
}

export function normalizeHouseRules(value) {
  if (value == null) return undefined;
  if (typeof value !== "object") throw new HttpError(400, "House rules are invalid.");
  if (typeof value.smokingAllowed !== "boolean" || typeof value.petsAllowed !== "boolean" || !GUEST_POLICIES.has(value.guestsPolicy)) {
    throw new HttpError(400, "House rules must include smoking, pets, and a guests policy.");
  }
  const suitableFor = Array.isArray(value.suitableFor) ? value.suitableFor.filter((item) => SUITABLE_FOR.has(item)) : undefined;
  const additionalRules = typeof value.additionalRules === "string" ? value.additionalRules.trim().slice(0, 500) : undefined;
  return Object.fromEntries(Object.entries({
    smokingAllowed: value.smokingAllowed,
    petsAllowed: value.petsAllowed,
    guestsPolicy: value.guestsPolicy,
    quietHoursStart: typeof value.quietHoursStart === "string" && value.quietHoursStart.trim() ? value.quietHoursStart.trim() : undefined,
    quietHoursEnd: typeof value.quietHoursEnd === "string" && value.quietHoursEnd.trim() ? value.quietHoursEnd.trim() : undefined,
    suitableFor: suitableFor && suitableFor.length > 0 ? suitableFor : undefined,
    additionalRules: additionalRules || undefined,
  }).filter(([, item]) => item !== undefined));
}

export function displayLocation({ location, area, province }) {
  const composed = [area, province].map((part) => part?.trim()).filter(Boolean).join(", ");
  return composed || location?.trim() || "";
}

export function canRequestViewing(roomStatus) {
  return roomStatus !== "UNAVAILABLE";
}

export function canRequestBooking(roomStatus) {
  return roomStatus === "AVAILABLE";
}

export function cancelViewingState(viewing) {
  const open = ["REQUESTED", "APPROVED", "RESCHEDULE_REQUESTED"];
  if (!open.includes(viewing.status)) throw new HttpError(409, "This viewing cannot be cancelled.");
  return { status: "CANCELLED" };
}

export function decideViewing(viewing, decision) {
  if (viewing.status !== "REQUESTED") {
    throw new HttpError(409, "Only a requested viewing can be reviewed.");
  }
  if (decision.status === "APPROVED") {
    return { status: "APPROVED", partnerSuggestedDate: null, partnerSuggestedTime: null, partnerMessage: null, declineReason: null };
  }
  if (decision.status === "DECLINED") {
    const reason = decision.declineReason?.trim() ?? "";
    if (!reason) throw new HttpError(400, "Decline reason is required.");
    return { status: "DECLINED", declineReason: reason, partnerSuggestedDate: null, partnerSuggestedTime: null, partnerMessage: null };
  }
  if (decision.status === "RESCHEDULE_REQUESTED") {
    assertIsoDate(decision.partnerSuggestedDate, "Suggested date");
    if (!VIEWING_TIMES.includes(decision.partnerSuggestedTime)) {
      throw new HttpError(400, "Suggested time must be between 7:00 AM and 9:00 PM.");
    }
    return {
      status: "RESCHEDULE_REQUESTED",
      partnerSuggestedDate: decision.partnerSuggestedDate,
      partnerSuggestedTime: decision.partnerSuggestedTime,
      partnerMessage: decision.partnerMessage?.trim() || null,
      declineReason: null,
    };
  }
  throw new HttpError(400, "Viewing decision is invalid.");
}

export function approveBookingState({ booking, roomStatus, depositAmount, paymentDeadline, now }) {
  if (booking.status !== "PENDING") throw new HttpError(409, "Only a pending booking can be approved.");
  if (roomStatus !== "AVAILABLE") throw new HttpError(409, "This room is not available, so the booking cannot be approved.");
  const amount = parseDepositAmount(depositAmount);
  if (amount === null || amount < MINIMUM_DEPOSIT_AMOUNT) throw new HttpError(400, DEPOSIT_AMOUNT_ERROR);
  const deadline = parsePaymentDeadline(paymentDeadline);
  if (!deadline || deadline.getTime() <= now.getTime()) {
    throw new HttpError(400, PAYMENT_DEADLINE_ERROR);
  }
  const rounded = Math.round(amount);
  return {
    booking: {
      status: "DEPOSIT_PENDING",
      depositAmount: rounded,
      paymentDeadline: deadline,
      approvedAt: now,
      declineReason: null,
      declinedAt: null,
    },
    roomStatus: "RESERVED",
    deposit: {
      amount: rounded,
      deadline,
      verificationStatus: "AWAITING_EVIDENCE",
      paymentInstructions: paymentInstructions(rounded, deadline, booking.id),
    },
  };
}

export function declineBookingState({ booking, declineReason, now }) {
  if (booking.status !== "PENDING") throw new HttpError(409, "Only a pending booking can be declined.");
  const reason = declineReason?.trim() ?? "";
  if (!reason) throw new HttpError(400, "Decline reason is required.");
  return {
    booking: { status: "DECLINED", declinedAt: now, declineReason: reason },
  };
}

export function uploadEvidenceState({ booking, now, fileName, fileType }) {
  if (booking.status !== "DEPOSIT_PENDING") {
    throw new HttpError(409, "Payment evidence can be uploaded only while the deposit is pending.");
  }
  const deadline = booking.paymentDeadline ? new Date(booking.paymentDeadline) : null;
  if (!deadline || deadline <= now) {
    return { expired: true, booking: { status: "EXPIRED" }, roomStatus: "AVAILABLE" };
  }
  const name = fileName?.trim() ?? "";
  if (!name) throw new HttpError(400, "Payment evidence file is required.");
  return {
    expired: false,
    booking: { status: "VERIFICATION_PENDING" },
    depositStatus: "PENDING_VERIFICATION",
    evidence: {
      fileName: name,
      fileType: fileType?.trim() || "application/octet-stream",
      status: "PENDING_VERIFICATION",
      uploadedAt: now,
    },
  };
}

export function verifyEvidenceState({ booking, evidence }) {
  if (booking.status !== "VERIFICATION_PENDING" || !evidence || evidence.status !== "PENDING_VERIFICATION") {
    throw new HttpError(409, "There is no payment evidence waiting for verification.");
  }
  return {
    booking: { status: "CONFIRMED" },
    roomStatus: "RESERVED",
    depositStatus: "VERIFIED",
    evidence: { status: "VERIFIED", rejectionReason: null, rejectedAt: null },
  };
}

export function rejectEvidenceState({ booking, evidence, rejectionReason, now }) {
  if (booking.status !== "VERIFICATION_PENDING" || !evidence || evidence.status !== "PENDING_VERIFICATION") {
    throw new HttpError(409, "There is no payment evidence waiting for verification.");
  }
  const reason = rejectionReason?.trim() ?? "";
  if (!reason) throw new HttpError(400, "Rejection reason is required.");
  const deadlineOpen = booking.paymentDeadline && new Date(booking.paymentDeadline) > now;
  return {
    booking: { status: deadlineOpen ? "DEPOSIT_PENDING" : "EXPIRED" },
    roomStatus: deadlineOpen ? "RESERVED" : "AVAILABLE",
    releaseRoom: !deadlineOpen,
    depositStatus: "REJECTED",
    evidence: { status: "REJECTED", rejectionReason: reason, rejectedAt: now, verifiedAt: null, verifiedById: null },
  };
}

export function startRentalState({ booking, roomStatus, now }) {
  if (booking.status !== "CONFIRMED" || roomStatus !== "RESERVED") {
    throw new HttpError(409, "A confirmed reservation with a reserved room can be started.");
  }
  return {
    booking: { status: "ACTIVE", rentalStartedAt: now },
    roomStatus: "RENTED",
  };
}

export function completeRentalState({ booking, roomStatus, now }) {
  if (booking.status !== "ACTIVE" || roomStatus !== "RENTED") {
    throw new HttpError(409, "An active rental with a rented room can be completed.");
  }
  return {
    booking: { status: "COMPLETED", completedAt: now },
    releaseRoom: true,
  };
}

export function cancelBookingState({ booking, actorRole, now, actorId }) {
  const renterStatuses = ["PENDING", "DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED"];
  const partnerStatuses = [...renterStatuses, "ACTIVE"];
  const allowed = actorRole === "PARTNER" ? partnerStatuses : renterStatuses;
  if (!allowed.includes(booking.status)) throw new HttpError(409, "This booking cannot be cancelled.");
  return {
    booking: { status: "CANCELLED", cancelledAt: now, cancelledById: actorId },
    releaseRoom: HOLDING_BOOKING_STATUSES.includes(booking.status),
  };
}

export function recordRefundState({ booking, status, amount, method, refundedAt, note }) {
  if (booking.status !== "CANCELLED") {
    throw new HttpError(409, "A refund can be recorded after the booking is cancelled. Settlement stays outside RoomStay.");
  }
  const allowed = ["NOT_APPLICABLE", "REFUND_PENDING", "REFUNDED", "FORFEITED"];
  if (!allowed.includes(status)) throw new HttpError(400, "Refund status is invalid.");
  let parsedAmount = null;
  if (amount != null && amount !== "") {
    parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < 0) throw new HttpError(400, "Refund amount must be a whole number of 0 or more.");
  }
  let parsedDate = null;
  if (refundedAt) {
    parsedDate = new Date(refundedAt);
    if (Number.isNaN(parsedDate.getTime())) throw new HttpError(400, "Refund date is invalid.");
  }
  return {
    status,
    amount: parsedAmount,
    method: method?.trim() || null,
    refundedAt: parsedDate,
    note: note?.trim() || "",
  };
}

export function createReviewState({ booking, existingReview, rating, comment }) {
  if (booking.status !== "COMPLETED") throw new HttpError(409, "A review can be left only after the rental is completed.");
  if (existingReview) throw new HttpError(409, "This booking already has a review.");
  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(400, "Rating must be a whole number from 1 to 5.");
  const text = comment?.trim() ?? "";
  if (!text) throw new HttpError(400, "Review comment is required.");
  return { rating: score, comment: text, status: "VISIBLE" };
}

export function reviewListingState({ listing, decision, now }) {
  if (listing.listingStatus !== "PENDING_REVIEW") throw new HttpError(409, "Only a listing waiting for review can be moderated.");
  if (decision.status === "PUBLISHED") {
    return { listingStatus: "PUBLISHED", reviewedAt: now, rejectionReason: null, roomStatus: listing.roomStatus };
  }
  if (decision.status === "REJECTED") {
    const reason = decision.rejectionReason?.trim() ?? "";
    if (!reason) throw new HttpError(400, "Rejection reason is required.");
    return { listingStatus: "REJECTED", reviewedAt: now, rejectionReason: reason, roomStatus: listing.roomStatus };
  }
  throw new HttpError(400, "Listing decision is invalid.");
}

export function suspendListingState(listing, now) {
  if (listing.listingStatus !== "PUBLISHED") throw new HttpError(409, "Only a published listing can be suspended.");
  return { listingStatus: "SUSPENDED", reviewedAt: now, roomStatus: listing.roomStatus };
}

export function setAvailabilityState(roomStatus, nextStatus) {
  if (nextStatus !== "AVAILABLE" && nextStatus !== "UNAVAILABLE") {
    throw new HttpError(400, "A Partner can mark a room available or unavailable.");
  }
  if (roomStatus === "RESERVED" || roomStatus === "RENTED") {
    throw new HttpError(409, "This room status is controlled by the active reservation.");
  }
  return nextStatus;
}

export function reviewApplicationState(application, decision, now) {
  if (!application || application.status !== "PENDING") throw new HttpError(409, "Only a pending application can be reviewed.");
  if (decision.status === "APPROVED") {
    return { status: "APPROVED", reviewedAt: now, rejectionReason: null };
  }
  if (decision.status === "REJECTED") {
    const reason = decision.rejectionReason?.trim() ?? "";
    if (!reason) throw new HttpError(400, "Rejection reason is required.");
    return { status: "REJECTED", reviewedAt: now, rejectionReason: reason };
  }
  throw new HttpError(400, "Application decision is invalid.");
}

export function suspendPartnerState(application, reason, now, adminId) {
  if (!application || application.status !== "APPROVED") throw new HttpError(409, "Only an approved Partner can be suspended.");
  const text = reason?.trim() ?? "";
  if (!text) throw new HttpError(400, "Suspension reason is required.");
  return { status: "SUSPENDED", suspendedAt: now, suspensionReason: text, suspendedById: adminId, unsuspendedAt: null };
}

export function restorePartnerState(application, now) {
  if (!application || application.status !== "SUSPENDED") throw new HttpError(409, "Only a suspended Partner can be restored.");
  return { status: "APPROVED", unsuspendedAt: now, suspendedAt: null, suspensionReason: null, suspendedById: null };
}

export function reviewReportState(report, decision, now) {
  if (!report) throw new HttpError(404, "Report not found.");
  if (decision.status === "UNDER_REVIEW" && report.status !== "OPEN") {
    throw new HttpError(409, "Only an open report can be marked under review.");
  }
  if ((decision.status === "RESOLVED" || decision.status === "DISMISSED") && report.status !== "OPEN" && report.status !== "UNDER_REVIEW") {
    throw new HttpError(409, "This report has already been closed.");
  }
  if (!["UNDER_REVIEW", "RESOLVED", "DISMISSED"].includes(decision.status)) {
    throw new HttpError(400, "Report decision is invalid.");
  }
  const note = decision.status === "UNDER_REVIEW" ? null : decision.resolutionNote?.trim() || null;
  if (decision.status === "RESOLVED" && !note) throw new HttpError(400, "A resolution note is required.");
  return { status: decision.status, reviewedAt: now, resolutionNote: note };
}

export function moderateReviewState(review, status, now, adminId) {
  if (!review) throw new HttpError(404, "Review not found.");
  if (status !== "HIDDEN" && status !== "VISIBLE") throw new HttpError(400, "Review moderation status is invalid.");
  if (status === "HIDDEN" && review.status === "HIDDEN") throw new HttpError(409, "This review is already hidden.");
  if (status === "VISIBLE" && review.status !== "HIDDEN") throw new HttpError(409, "This review is already visible.");
  return { status, moderatedAt: now, moderatedById: adminId };
}

export function assertMoveInDate(value, now = new Date()) {
  assertIsoDate(value, "Preferred move-in date");
  if (value < todayDateString(now)) throw new HttpError(400, "Preferred move-in date cannot be in the past.");
}

export function assertViewingSlot(date, time, now = new Date()) {
  assertIsoDate(date, "Viewing date");
  if (date < todayDateString(now)) throw new HttpError(400, "Viewing date cannot be in the past.");
  if (!VIEWING_TIMES.includes(time)) throw new HttpError(400, "Viewing time must be between 7:00 AM and 9:00 PM.");
}
