"use client";
import { BookingActions } from "@/components/booking-actions";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EvidenceSlip } from "@/components/evidence-slip";
import { findMockBookingRequest, findMockPaymentEvidenceForBooking, partnerOwnsBooking, readMockRoomStatus, roomStatusLabel, setMockRoomStatus, statusLabel, updateMockBookingRequest, updateMockPaymentEvidence, } from "@/lib/mock-bookings";
import { ApiError } from "@/lib/api";
import { liveApproveBooking, liveCompleteRental, liveDeclineBooking, liveRejectEvidence, liveStartRental, liveVerifyEvidence } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { useMockAuth } from "@/lib/mock-auth";
import { properties } from "@/mocks/properties";
import { formatBookingDate } from "@/lib/format-date";
import { notifyMockBookingApproved, notifyMockBookingDeclined, notifyMockPaymentRejected, notifyMockPaymentVerified, } from "@/lib/mock-notifications";
const rentFormatter = new Intl.NumberFormat("en-US");
function isFutureDateTime(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time > Date.now();
}
function formatDateTime(value) {
    if (!value)
        return "Not provided";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}
function evidenceStatusLabel(evidence) {
    if (!evidence)
        return "No evidence submitted";
    return evidence.status.replaceAll("_", " ");
}
function deadlineStillOpen(deadline) {
    if (!deadline)
        return false;
    const time = new Date(deadline).getTime();
    return Number.isFinite(time) && time > Date.now();
}
export function PartnerBookingReview({ bookingId }) {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [booking, setBooking] = useState(undefined);
    const [evidence, setEvidence] = useState(null);
    const [roomStatus, setRoomStatus] = useState("AVAILABLE");
    const [depositAmount, setDepositAmount] = useState("");
    const [paymentDeadline, setPaymentDeadline] = useState("");
    const [declineReason, setDeclineReason] = useState("");
    const [evidenceRejectReason, setEvidenceRejectReason] = useState("");
    const [errors, setErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState("");
    useEffect(() => {
        if (!isReady)
            return undefined;
        if (!user) {
            router.replace(`/login?returnTo=${encodeURIComponent(`/partner/bookings/${bookingId}`)}`);
            return undefined;
        }
        if (!user.isPartner)
            return undefined;
        const currentUser = user;
        function loadBooking() {
            const found = findMockBookingRequest(bookingId);
            const owned = found && partnerOwnsBooking(found, currentUser) ? found : null;
            setBooking(owned);
            setEvidence(owned ? findMockPaymentEvidenceForBooking(bookingId) : null);
            setRoomStatus(owned ? readMockRoomStatus(owned.propertyId, "RESERVED") : "AVAILABLE");
        }
        const timeout = window.setTimeout(loadBooking, 0);
        window.addEventListener("roomstay:bookings-changed", loadBooking);
        return () => { window.clearTimeout(timeout); window.removeEventListener("roomstay:bookings-changed", loadBooking); };
    }, [bookingId, isReady, router, user]);
    if (!isReady || booking === undefined) {
        return (<section className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading booking review...
      </section>);
    }
    if (!user) {
        return (<section className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Redirecting to login...
      </section>);
    }
    if (!user.isPartner) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <p className="text-sm font-semibold text-primary">Partner access required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Booking review is for approved Partners</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          Apply and wait for approval before managing renter booking requests.
        </p>
        <Link href="/become-a-partner" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white">
          Become a Partner
        </Link>
      </section>);
    }
    if (!booking) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Booking not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          This booking does not exist or does not belong to your properties.
        </p>
        <Link href="/partner/bookings" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white">
          Back to Partner Bookings
        </Link>
      </section>);
    }
    const property = properties.find((item) => item.id === booking.propertyId);
    const isPending = booking.status === "PENDING";
    const isVerificationPending = booking.status === "VERIFICATION_PENDING";
    const canStartRental = booking.status === "CONFIRMED" && roomStatus === "RESERVED";
    const canCompleteRental = booking.status === "ACTIVE" && roomStatus === "RENTED";
    function approve(event) {
        event.preventDefault();
        if (!booking || booking.status !== "PENDING")
            return;
        const nextErrors = {};
        const amount = Number(depositAmount);
        if (!Number.isFinite(amount) || amount <= 0)
            nextErrors.depositAmount = "Deposit amount must be greater than 0.";
        if (!paymentDeadline || !isFutureDateTime(paymentDeadline))
            nextErrors.paymentDeadline = "Payment deadline must be a future date and time.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0)
            return;
        if (liveEnabled()) {
            void liveApproveBooking(booking.id, amount, new Date(paymentDeadline).toISOString()).then((updated) => {
                setBooking(updated);
                setRoomStatus(readMockRoomStatus(booking.propertyId, "RESERVED"));
                setErrors({});
                setSuccessMessage("Booking approved and moved to deposit pending.");
            }).catch((error) => {
                setErrors({ depositAmount: error instanceof ApiError ? error.message : "The booking could not be approved." });
            });
            return;
        }
        const updated = {
            ...booking,
            status: "DEPOSIT_PENDING",
            depositAmount: amount,
            paymentDeadline,
            approvedAt: new Date().toISOString(),
            declineReason: undefined,
            declinedAt: undefined,
        };
        updateMockBookingRequest(updated);
        setMockRoomStatus(booking.propertyId, "RESERVED");
        setRoomStatus("RESERVED");
        setBooking(updated);
        setErrors({});
        setSuccessMessage("Booking approved and moved to deposit pending.");
        notifyMockBookingApproved(updated);
    }
    function decline(event) {
        event.preventDefault();
        if (!booking || booking.status !== "PENDING")
            return;
        const nextErrors = {};
        if (!declineReason.trim())
            nextErrors.declineReason = "Decline reason is required.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0)
            return;
        if (liveEnabled()) {
            void liveDeclineBooking(booking.id, declineReason.trim()).then((updated) => {
                setBooking(updated);
                setRoomStatus(readMockRoomStatus(booking.propertyId, "AVAILABLE"));
                setErrors({});
                setSuccessMessage("Booking declined.");
            }).catch((error) => {
                setErrors({ declineReason: error instanceof ApiError ? error.message : "The booking could not be declined." });
            });
            return;
        }
        const updated = {
            ...booking,
            status: "DECLINED",
            declinedAt: new Date().toISOString(),
            declineReason: declineReason.trim(),
        };
        updateMockBookingRequest(updated);
        setMockRoomStatus(booking.propertyId, "AVAILABLE");
        setRoomStatus("AVAILABLE");
        setBooking(updated);
        setErrors({});
        setSuccessMessage("Booking declined.");
        notifyMockBookingDeclined(updated);
    }
    function verifyEvidence() {
        if (!booking || booking.status !== "VERIFICATION_PENDING" || !evidence)
            return;
        if (liveEnabled()) {
            void liveVerifyEvidence(booking.id).then((updated) => {
                setBooking(updated);
                setEvidence(findMockPaymentEvidenceForBooking(booking.id));
                setRoomStatus(readMockRoomStatus(booking.propertyId, "RESERVED"));
                setErrors({});
                setSuccessMessage("Payment evidence verified. Booking is now confirmed, and the room remains reserved.");
            }).catch((error) => {
                setErrors({ evidenceReason: error instanceof ApiError ? error.message : "The evidence could not be verified." });
            });
            return;
        }
        const verifiedAt = new Date().toISOString();
        const updatedEvidence = {
            ...evidence,
            status: "VERIFIED",
            verifiedAt,
            verifiedBy: "Partner",
            rejectionReason: undefined,
            rejectedAt: undefined,
        };
        const updatedBooking = {
            ...booking,
            status: "CONFIRMED",
        };
        updateMockPaymentEvidence(updatedEvidence);
        updateMockBookingRequest(updatedBooking);
        setMockRoomStatus(booking.propertyId, "RESERVED");
        setRoomStatus("RESERVED");
        setEvidence(updatedEvidence);
        setBooking(updatedBooking);
        setErrors({});
        setSuccessMessage("Payment evidence verified. Booking is now confirmed, and the room remains reserved.");
        notifyMockPaymentVerified(updatedBooking);
    }
    function rejectEvidence(event) {
        event.preventDefault();
        if (!booking || booking.status !== "VERIFICATION_PENDING" || !evidence)
            return;
        const reason = evidenceRejectReason.trim();
        if (!reason) {
            setErrors({ evidenceReason: "Rejection reason is required." });
            return;
        }
        if (liveEnabled()) {
            void liveRejectEvidence(booking.id, reason).then((updated) => {
                setBooking(updated);
                setEvidence(findMockPaymentEvidenceForBooking(booking.id));
                setRoomStatus(readMockRoomStatus(booking.propertyId, "RESERVED"));
                setErrors({});
                setSuccessMessage(updated.status === "EXPIRED"
                    ? "Payment evidence rejected after the deadline. The booking expired and the room is available again."
                    : "Payment evidence rejected. The renter may upload new evidence before the deadline.");
            }).catch((error) => {
                setErrors({ evidenceReason: error instanceof ApiError ? error.message : "The evidence could not be rejected." });
            });
            return;
        }
        const rejectedAt = new Date().toISOString();
        const isDeadlineOpen = deadlineStillOpen(booking.paymentDeadline);
        const updatedEvidence = {
            ...evidence,
            status: "REJECTED",
            rejectedAt,
            rejectionReason: reason,
            verifiedAt: undefined,
            verifiedBy: undefined,
        };
        const updatedBooking = {
            ...booking,
            status: isDeadlineOpen ? "DEPOSIT_PENDING" : "EXPIRED",
        };
        updateMockPaymentEvidence(updatedEvidence);
        updateMockBookingRequest(updatedBooking);
        setMockRoomStatus(booking.propertyId, isDeadlineOpen ? "RESERVED" : "AVAILABLE");
        setRoomStatus(isDeadlineOpen ? "RESERVED" : "AVAILABLE");
        setEvidence(updatedEvidence);
        setBooking(updatedBooking);
        setErrors({});
        setSuccessMessage(isDeadlineOpen
            ? "Payment evidence rejected. The renter may upload new evidence before the deadline."
            : "Payment evidence rejected after the deadline. The booking expired and the room is available again.");
        notifyMockPaymentRejected(updatedBooking, updatedEvidence);
    }
    function startRental() {
        if (!booking || booking.status !== "CONFIRMED" || roomStatus !== "RESERVED")
            return;
        if (liveEnabled()) {
            void liveStartRental(booking.id).then((updated) => {
                setBooking(updated);
                setRoomStatus("RENTED");
                setErrors({});
                setSuccessMessage("Rental started. The booking is now active, and the room is marked as rented.");
            }).catch((error) => {
                setErrors({ evidenceReason: error instanceof ApiError ? error.message : "The rental could not be started." });
            });
            return;
        }
        const updated = {
            ...booking,
            status: "ACTIVE",
            rentalStartedAt: new Date().toISOString(),
        };
        updateMockBookingRequest(updated);
        setMockRoomStatus(booking.propertyId, "RENTED");
        setRoomStatus("RENTED");
        setBooking(updated);
        setErrors({});
        setSuccessMessage("Rental started. The booking is now active, and the room is marked as rented.");
    }
    function completeRental() {
        if (!booking || booking.status !== "ACTIVE" || roomStatus !== "RENTED")
            return;
        if (liveEnabled()) {
            void liveCompleteRental(booking.id).then((updated) => {
                setBooking(updated);
                setRoomStatus("AVAILABLE");
                setErrors({});
                setSuccessMessage("Rental completed. The room is available again, and the renter can leave a review.");
            }).catch((error) => {
                setErrors({ evidenceReason: error instanceof ApiError ? error.message : "The rental could not be completed." });
            });
            return;
        }
        const updated = {
            ...booking,
            status: "COMPLETED",
            completedAt: new Date().toISOString(),
        };
        updateMockBookingRequest(updated);
        setMockRoomStatus(booking.propertyId, "AVAILABLE");
        setRoomStatus("AVAILABLE");
        setBooking(updated);
        setErrors({});
        setSuccessMessage("Rental completed. The room is available again, and the renter can leave a review.");
    }
    return (<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-xl border border-line bg-white p-5 md:p-7">
        <p className="text-sm font-semibold text-primary">Partner Booking Review</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Booking {booking.id}</h1>
            <p className="mt-1 text-sm text-ink-secondary">Status: {statusLabel(booking.status)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED", "ACTIVE"].includes(booking.status) && (<Link href={`/partner/bookings/${booking.id}/payment-chat`} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white">Message admin</Link>)}
            <Link href="/partner/bookings" className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm font-semibold text-ink">Back</Link>
          </div>
        </div>

        {successMessage && (<p role="status" className="mt-5 rounded-xl bg-primary-tint px-4 py-3 text-sm leading-6 text-primary">
            {successMessage}
          </p>)}

        <dl className="mt-6 grid gap-4 text-sm text-ink-secondary sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">Renter</dt>
            <dd className="mt-1">{booking.renterName}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Requested move-in</dt>
            <dd className="mt-1">{formatBookingDate(booking.requestedMoveInDate)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Monthly rent</dt>
            <dd className="mt-1">฿{rentFormatter.format(booking.monthlyRent)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Property</dt>
            <dd className="mt-1">{booking.propertyTitle}</dd>
          </div>
          {booking.message && (<div className="sm:col-span-2">
              <dt className="font-medium text-ink">Renter message</dt>
              <dd className="mt-1 leading-6">{booking.message}</dd>
            </div>)}
          {booking.depositAmount && (<div>
              <dt className="font-medium text-ink">Deposit amount</dt>
              <dd className="mt-1">฿{rentFormatter.format(booking.depositAmount)}</dd>
            </div>)}
          {booking.paymentDeadline && (<div>
              <dt className="font-medium text-ink">Payment deadline</dt>
              <dd className="mt-1">{formatDateTime(booking.paymentDeadline)}</dd>
            </div>)}
          {(booking.depositAmount || booking.paymentDeadline) && (<div>
              <dt className="font-medium text-ink">Payment reference</dt>
              <dd className="mt-1">{booking.id}</dd>
            </div>)}
          <div>
            <dt className="font-medium text-ink">Room status</dt>
            <dd className="mt-1">{roomStatusLabel(roomStatus)}</dd>
          </div>
          {booking.rentalStartedAt && (<div>
              <dt className="font-medium text-ink">Rental started</dt>
              <dd className="mt-1">{formatDateTime(booking.rentalStartedAt)}</dd>
            </div>)}
          {booking.completedAt && (<div>
              <dt className="font-medium text-ink">Completed</dt>
              <dd className="mt-1">{formatDateTime(booking.completedAt)}</dd>
            </div>)}
          {booking.declineReason && (<div className="sm:col-span-2">
              <dt className="font-medium text-ink">Decline reason</dt>
              <dd className="mt-1 leading-6">{booking.declineReason}</dd>
            </div>)}
        </dl>

        {isPending && (<div className="mt-8 grid gap-5 lg:grid-cols-2">
            <form onSubmit={approve} noValidate className="rounded-xl border border-line p-4">
              <h2 className="font-semibold">Approve Booking</h2>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">Approval reserves the room and moves this booking to deposit pending.</p>
              <label className="mt-4 block text-sm font-medium">
                Deposit amount
                <input type="number" min="1" step="1" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="Enter deposit amount" className="mt-2 h-11 w-full rounded-lg border border-line px-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
                {errors.depositAmount && <span className="mt-1.5 block text-xs text-alert">{errors.depositAmount}</span>}
              </label>
              <label className="mt-4 block text-sm font-medium">
                Payment deadline
                <input type="datetime-local" value={paymentDeadline} onChange={(event) => setPaymentDeadline(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line px-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
                {errors.paymentDeadline && <span className="mt-1.5 block text-xs text-alert">{errors.paymentDeadline}</span>}
              </label>
              <button type="submit" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
                Approve
              </button>
            </form>

            <form onSubmit={decline} noValidate className="rounded-xl border border-line p-4">
              <h2 className="font-semibold">Decline Booking</h2>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">Declining keeps the room available for other renters.</p>
              <label className="mt-4 block text-sm font-medium">
                Decline reason
                <textarea rows={5} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-line px-3 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
                {errors.declineReason && <span className="mt-1.5 block text-xs text-alert">{errors.declineReason}</span>}
              </label>
              <button type="submit" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink">
                Decline
              </button>
            </form>
          </div>)}

        {booking.status === "CONFIRMED" && (<section className="mt-8 rounded-xl border border-line p-4">
            <h2 className="font-semibold">Start Rental</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              The booking is confirmed, but the rental has not started yet. Start the rental only when the renter has moved in.
            </p>
            {roomStatus !== "RESERVED" && (<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">
                Rental can start only while the room is reserved. Current room status: {roomStatusLabel(roomStatus)}.
              </p>)}
            <button type="button" onClick={startRental} disabled={!canStartRental} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-secondary sm:w-auto">
              Start Rental
            </button>
          </section>)}

        {booking.status === "ACTIVE" && (<section className="mt-8 rounded-xl border border-line p-4">
            <h2 className="font-semibold">Rental Active</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              The renter has moved in. The room is currently rented.
            </p>
            {roomStatus !== "RENTED" && (<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">
                Rental can be completed only while the room is rented. Current room status: {roomStatusLabel(roomStatus)}.
              </p>)}
            <dl className="mt-3 grid gap-3 text-sm text-ink-secondary sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Rental started</dt>
                <dd className="mt-1">{formatDateTime(booking.rentalStartedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Room status</dt>
                <dd className="mt-1">{roomStatusLabel(roomStatus)}</dd>
              </div>
            </dl>
            <button type="button" onClick={completeRental} disabled={!canCompleteRental} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-secondary sm:w-auto">
              Complete Rental
            </button>
          </section>)}

        {booking.status === "COMPLETED" && (<section className="mt-8 rounded-xl border border-line p-4">
            <h2 className="font-semibold">Rental Completed</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              This rental is complete. The room is available again, and the renter may leave one review.
            </p>
            <dl className="mt-3 grid gap-3 text-sm text-ink-secondary sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Rental started</dt>
                <dd className="mt-1">{formatDateTime(booking.rentalStartedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Completed</dt>
                <dd className="mt-1">{formatDateTime(booking.completedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Room status</dt>
                <dd className="mt-1">{roomStatusLabel(roomStatus)}</dd>
              </div>
            </dl>
          </section>)}

        {isVerificationPending && (<section className="mt-8 rounded-xl border border-line p-4">
            <h2 className="font-semibold">Payment Evidence Review</h2>
            {evidence ? (<>
                <div className="mt-4">
                  <EvidenceSlip evidence={evidence}/>
                </div>
                <dl className="mt-4 grid gap-4 text-sm text-ink-secondary sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-ink">Evidence file</dt>
                    <dd className="mt-1">{evidence.fileName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Uploaded</dt>
                    <dd className="mt-1">{formatDateTime(evidence.uploadedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Evidence status</dt>
                    <dd className="mt-1">{evidenceStatusLabel(evidence)}</dd>
                  </div>
                  {evidence.note && (<div className="sm:col-span-2">
                      <dt className="font-medium text-ink">Renter note</dt>
                      <dd className="mt-1 leading-6">{evidence.note}</dd>
                    </div>)}
                </dl>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-line p-4">
                    <h3 className="font-semibold">Verify Evidence</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-secondary">Verification confirms the booking but does not mark the room as rented.</p>
                    <button type="button" onClick={verifyEvidence} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
                      Verify Evidence
                    </button>
                  </div>

                  <form onSubmit={rejectEvidence} noValidate className="rounded-xl border border-line p-4">
                    <h3 className="font-semibold">Reject Evidence</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-secondary">If the deadline is still open, the renter can upload new evidence.</p>
                    <label className="mt-4 block text-sm font-medium">
                      Rejection reason
                      <textarea rows={5} value={evidenceRejectReason} onChange={(event) => setEvidenceRejectReason(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-line px-3 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
                      {errors.evidenceReason && <span className="mt-1.5 block text-xs text-alert">{errors.evidenceReason}</span>}
                    </label>
                    <button type="submit" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink">
                      Reject Evidence
                    </button>
                  </form>
                </div>
              </>) : (<p className="mt-2 text-sm leading-6 text-ink-secondary">No payment evidence metadata was found for this booking.</p>)}
          </section>)}
        <BookingActions booking={booking} partner />
      </section>

      <aside className="rounded-xl border border-line bg-white p-4 md:p-5 lg:sticky lg:top-8">
        <div className="relative aspect-[5/3] overflow-hidden rounded-lg bg-photo">
          <Image src={property?.image ?? "/images/home/cozy-condo.jpg"} alt={property?.imageAlt ?? booking.propertyTitle} fill sizes="(min-width: 1024px) 388px, calc(100vw - 44px)" className="object-cover"/>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{booking.propertyTitle}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{booking.propertyLocation}</p>
      </aside>
    </div>);
}
