import assert from "node:assert/strict";
import test from "node:test";
import {
  approveBookingState,
  cancelBookingState,
  cancelViewingState,
  completeRentalState,
  createReviewState,
  declineBookingState,
  decideViewing,
  DEPOSIT_AMOUNT_ERROR,
  DEPOSIT_INCREMENT_ERROR,
  PAYMENT_DEADLINE_ERROR,
  rejectEvidenceState,
  startRentalState,
  uploadEvidenceState,
  verifyEvidenceState,
} from "../src/domain/rules.js";

const now = new Date("2026-10-10T12:00:00.000Z");
const future = "2026-10-20T12:00:00.000Z";
const pending = { id: "bk-1", status: "PENDING", paymentDeadline: null };

test("approval reserves the room and opens the deposit", () => {
  const result = approveBookingState({
    booking: pending,
    roomStatus: "AVAILABLE",
    depositAmount: 5000,
    paymentDeadline: future,
    now,
  });
  assert.equal(result.booking.status, "DEPOSIT_PENDING");
  assert.equal(result.roomStatus, "RESERVED");
  assert.equal(result.deposit.verificationStatus, "AWAITING_EVIDENCE");
  assert.match(result.deposit.paymentInstructions, /outside RoomStay/);
});

test("approval enforces the THB 1,000 minimum deposit", () => {
  for (const depositAmount of [999, 0, -1, 19, "", "   ", "not-a-number", null, undefined]) {
    assert.throws(
      () => approveBookingState({ booking: pending, roomStatus: "AVAILABLE", depositAmount, paymentDeadline: future, now }),
      { message: DEPOSIT_AMOUNT_ERROR },
    );
  }
  for (const depositAmount of [1000, 2000, 5000, "1000"]) {
    const result = approveBookingState({ booking: pending, roomStatus: "AVAILABLE", depositAmount, paymentDeadline: future, now });
    assert.equal(result.booking.depositAmount, Number(depositAmount));
  }
});

test("approval requires deposit amounts in THB 1,000 increments", () => {
  for (const depositAmount of [1500, 2500, 1000.5, "1500"]) {
    assert.throws(
      () => approveBookingState({ booking: pending, roomStatus: "AVAILABLE", depositAmount, paymentDeadline: future, now }),
      { message: DEPOSIT_INCREMENT_ERROR },
    );
  }
});

test("approval requires a valid future payment deadline", () => {
  const currentTime = new Date("2026-10-10T12:00:00.000Z");
  const valid = approveBookingState({
    booking: pending,
    roomStatus: "AVAILABLE",
    depositAmount: 1000,
    paymentDeadline: "2026-11-20T21:42:00.000Z",
    now: currentTime,
  });
  assert.equal(valid.booking.paymentDeadline.toISOString(), "2026-11-20T21:42:00.000Z");
  for (const paymentDeadline of [
    "2026-10-01T00:00:00.000Z",
    currentTime,
    "2026-10-10T12:00:00.000Z",
    "not-a-date",
    "20/11/2026 21:42",
    "",
    null,
  ]) {
    assert.throws(
      () => approveBookingState({ booking: pending, roomStatus: "AVAILABLE", depositAmount: 1000, paymentDeadline, now: currentTime }),
      { message: PAYMENT_DEADLINE_ERROR },
    );
  }
});

test("valid deposit and future deadline allow approval", () => {
  const result = approveBookingState({
    booking: pending,
    roomStatus: "AVAILABLE",
    depositAmount: 2000,
    paymentDeadline: future,
    now,
  });
  assert.equal(result.booking.status, "DEPOSIT_PENDING");
  assert.equal(result.booking.depositAmount, 2000);
  assert.equal(result.deposit.amount, 2000);
  assert.equal(result.booking.paymentDeadline.toISOString(), future);
});

test("approval is refused when the room is already reserved", () => {
  assert.throws(
    () => approveBookingState({ booking: pending, roomStatus: "RESERVED", depositAmount: 5000, paymentDeadline: future, now }),
    /not available/,
  );
});

test("declining a pending request does not release the room", () => {
  const result = declineBookingState({ booking: pending, declineReason: "Dates do not work", now });
  assert.equal(result.booking.status, "DECLINED");
  assert.equal(result.roomStatus, undefined);
});

test("evidence upload waits for verification while the deadline is open", () => {
  const result = uploadEvidenceState({
    booking: { status: "DEPOSIT_PENDING", paymentDeadline: future },
    now,
    fileName: "slip.png",
    fileType: "image/png",
  });
  assert.equal(result.expired, false);
  assert.equal(result.booking.status, "VERIFICATION_PENDING");
  assert.equal(result.depositStatus, "PENDING_VERIFICATION");
});

test("a missed deposit deadline expires the booking", () => {
  const result = uploadEvidenceState({
    booking: { status: "DEPOSIT_PENDING", paymentDeadline: "2026-10-01T00:00:00.000Z" },
    now,
    fileName: "slip.png",
  });
  assert.equal(result.expired, true);
  assert.equal(result.booking.status, "EXPIRED");
  assert.equal(result.roomStatus, "AVAILABLE");
});

test("verified evidence confirms the booking and keeps the room reserved", () => {
  const result = verifyEvidenceState({
    booking: { status: "VERIFICATION_PENDING" },
    evidence: { status: "PENDING_VERIFICATION" },
  });
  assert.equal(result.booking.status, "CONFIRMED");
  assert.equal(result.roomStatus, "RESERVED");
});

test("rejected evidence can be replaced before the deadline and expires after it", () => {
  const open = rejectEvidenceState({
    booking: { status: "VERIFICATION_PENDING", paymentDeadline: future },
    evidence: { status: "PENDING_VERIFICATION" },
    rejectionReason: "Unclear slip",
    now,
  });
  assert.equal(open.booking.status, "DEPOSIT_PENDING");
  assert.equal(open.roomStatus, "RESERVED");
  const closed = rejectEvidenceState({
    booking: { status: "VERIFICATION_PENDING", paymentDeadline: "2026-10-01T00:00:00.000Z" },
    evidence: { status: "PENDING_VERIFICATION" },
    rejectionReason: "Too late",
    now,
  });
  assert.equal(closed.booking.status, "EXPIRED");
  assert.equal(closed.releaseRoom, true);
});

test("rental start and completion move the room from reserved to rented to available", () => {
  const started = startRentalState({ booking: { status: "CONFIRMED" }, roomStatus: "RESERVED", now });
  assert.equal(started.booking.status, "ACTIVE");
  assert.equal(started.roomStatus, "RENTED");
  const completed = completeRentalState({ booking: { status: "ACTIVE" }, roomStatus: "RENTED", now });
  assert.equal(completed.booking.status, "COMPLETED");
  assert.equal(completed.releaseRoom, true);
});

test("a review is allowed once, only after completion", () => {
  assert.throws(() => createReviewState({ booking: { status: "CONFIRMED" }, rating: 5, comment: "Great" }), /completed/);
  const review = createReviewState({ booking: { status: "COMPLETED" }, rating: 5, comment: "Great stay" });
  assert.equal(review.rating, 5);
  assert.throws(() => createReviewState({ booking: { status: "COMPLETED" }, existingReview: { id: "r1" }, rating: 4, comment: "Again" }), /already/);
});

test("a renter can cancel an open viewing without a room change", () => {
  const cancelled = cancelViewingState({ status: "APPROVED" });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.roomStatus, undefined);
  assert.throws(() => cancelViewingState({ status: "DECLINED" }), /cannot be cancelled/);
});

test("viewing decisions do not describe a room change", () => {
  const approved = decideViewing({ status: "REQUESTED" }, { status: "APPROVED" });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.roomStatus, undefined);
  assert.throws(() => decideViewing({ status: "APPROVED" }, { status: "DECLINED", declineReason: "Busy" }), /requested/);
});

test("a renter can cancel a deposit hold and a partner can cancel an active rental", () => {
  const renter = cancelBookingState({ booking: { status: "DEPOSIT_PENDING" }, actorRole: "RENTER", now, actorId: "u1" });
  assert.equal(renter.booking.status, "CANCELLED");
  assert.equal(renter.releaseRoom, true);
  assert.throws(() => cancelBookingState({ booking: { status: "ACTIVE" }, actorRole: "RENTER", now, actorId: "u1" }), /cannot be cancelled/);
  const partner = cancelBookingState({ booking: { status: "ACTIVE" }, actorRole: "PARTNER", now, actorId: "p1" });
  assert.equal(partner.releaseRoom, true);
});
