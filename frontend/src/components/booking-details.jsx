"use client";
import { BookingActions } from "@/components/booking-actions";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EvidenceSlip } from "@/components/evidence-slip";
import { ApiError } from "@/lib/api";
import { liveCancelBooking } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { bookingStatusPillTone, cancelMockBooking, findMockBookingRequest, findMockPaymentEvidenceForBooking, findMockReviewForBooking, renterCancellableBookingStatuses, statusLabel } from "@/lib/mock-bookings";
import { formatBookingDate } from "@/lib/format-date";
import { usePublicProperties } from "@/lib/published-listings";
import { useMockAuth } from "@/lib/mock-auth";
function statusName(status) {
    if (status === "DEPOSIT_PENDING")
        return "Deposit Pending";
    if (status === "VERIFICATION_PENDING")
        return "Verification Pending";
    if (status === "ACTIVE")
        return "Rental Active";
    if (status === "COMPLETED")
        return "Rental Completed";
    return statusLabel(status);
}
function statusMessage(status) {
    if (status === "PENDING")
        return "Waiting for Partner review. The room is not reserved yet. Deposit instructions appear after the Partner approves this request.";
    if (status === "APPROVED")
        return "Partner approved this booking. Deposit details will appear here when they are available.";
    if (status === "DEPOSIT_PENDING")
        return "Deposit Pending. The room is currently reserved while your deposit payment is pending.";
    if (status === "VERIFICATION_PENDING")
        return "Your payment evidence is waiting for Partner verification.";
    if (status === "CONFIRMED")
        return "Booking confirmed. Your reservation is confirmed, but the rental has not started yet.";
    if (status === "ACTIVE")
        return "Rental Active. The renter has moved in, and the room is currently rented.";
    if (status === "COMPLETED")
        return "Rental Completed. The room is available again, and you may leave one review for this booking.";
    if (status === "DECLINED")
        return "Booking declined.";
    if (status === "CANCELLED")
        return "Booking cancelled.";
    return "Booking expired. The payment deadline passed, and the room is available again.";
}
function timeLeft(deadline, now) {
    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime()))
        return "Deadline unavailable";
    const difference = deadlineDate.getTime() - now;
    if (difference <= 0)
        return "Deadline passed";
    const minutes = Math.floor(difference / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const remainingMinutes = minutes % 60;
    if (days > 0)
        return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} left`;
    if (hours > 0)
        return `${hours} hour${hours === 1 ? "" : "s"} ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} left`;
    return `${Math.max(1, remainingMinutes)} minute${remainingMinutes === 1 ? "" : "s"} left`;
}
function isDeadlineExpired(deadline) {
    if (!deadline)
        return false;
    const deadlineDate = new Date(deadline);
    return !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() <= Date.now();
}
export function BookingDetails({ bookingId }) {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [booking, setBooking] = useState(undefined);
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const { properties: publicProperties } = usePublicProperties();
    useEffect(() => {
        if (!isReady)
            return undefined;
        if (!user) {
            router.replace(`/login?returnTo=${encodeURIComponent(`/bookings/${bookingId}`)}`);
            return undefined;
        }
        function loadBooking() {
            const found = findMockBookingRequest(bookingId);
            setBooking(found && found.renterUserId === user.id ? found : null);
        }
        const timeout = window.setTimeout(loadBooking, 0);
        window.addEventListener("roomstay:bookings-changed", loadBooking);
        return () => { window.clearTimeout(timeout); window.removeEventListener("roomstay:bookings-changed", loadBooking); };
    }, [bookingId, isReady, router, user]);
    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 60000);
        return () => window.clearInterval(interval);
    }, []);
    if (!isReady || booking === undefined) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading booking details...
      </div>);
    }
    if (!user) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Redirecting to login...
      </div>);
    }
    if (!booking) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Booking not found</h1>
        <p className="mt-2 text-sm text-ink-secondary">This booking may belong to another user or may no longer exist.</p>
        <Link href="/bookings" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white">
          Back to My Bookings
        </Link>
      </section>);
    }
    const property = publicProperties.find((item) => item.id === booking.propertyId);
    const image = property?.image ?? "/images/home/cozy-condo.jpg";
    const imageAlt = property?.imageAlt ?? booking.propertyTitle;
    const rentFormatter = new Intl.NumberFormat("en-US");
    const deadlineExpired = isDeadlineExpired(booking.paymentDeadline);
    const countdown = booking.paymentDeadline ? timeLeft(booking.paymentDeadline, now) : "Payment deadline unavailable";
    const evidence = findMockPaymentEvidenceForBooking(booking.id);
    const review = findMockReviewForBooking(booking.id);
    const evidenceRejected = evidence?.status === "REJECTED";
    const evidenceVerified = evidence?.status === "VERIFIED";
    const canCancel = renterCancellableBookingStatuses.includes(booking.status);
    async function cancelBooking() {
        if (!user || cancelling)
            return;
        if (!window.confirm("Cancel this booking? If the room is reserved for you, it becomes available again."))
            return;
        setCancelling(true);
        setCancelError("");
        try {
            const updated = liveEnabled()
                ? await liveCancelBooking(booking.id)
                : cancelMockBooking(booking.id, user.id);
            if (!updated)
                throw new Error("This booking cannot be cancelled.");
            setBooking(updated);
        }
        catch (error) {
            setCancelError(error instanceof ApiError ? error.message : "This booking could not be cancelled.");
        }
        finally {
            setCancelling(false);
        }
    }
    return (<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <section className="rounded-xl border border-line bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Booking ID {booking.id}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Booking Details</h1>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${bookingStatusPillTone(booking.status)}`}>{statusName(booking.status)}</span>
        </div>

        {booking.status !== "DEPOSIT_PENDING" && (<div className="mt-4 rounded-2xl bg-primary-tint px-4 py-3 text-sm leading-6 text-ink-secondary">
            {statusMessage(booking.status)}
          </div>)}

        {booking.status === "PENDING" && (<section className="mt-4 rounded-2xl border border-line bg-[#f7f4ee] p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">No payment yet</h2>
            <p className="mt-2 leading-6">You do not upload a slip while this request is pending. After the partner approves it, this page shows the deposit instructions, amount, and button to upload the transfer photo.</p>
          </section>)}

        {evidence && (<section className="mt-4">
            <h2 className="text-sm font-semibold text-ink">Deposit slip</h2>
            <div className="mt-2">
              <EvidenceSlip evidence={evidence}/>
            </div>
          </section>)}

        {booking.status === "APPROVED" && (<div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-white p-4 text-sm text-ink-secondary">
            <p className="font-medium text-ink">Deposit stage</p>
            <p className="mt-2">Deposit amount and payment deadline will be shown here after Partner approval data is added.</p>
          </div>)}

        {booking.status === "DEPOSIT_PENDING" && (<div className="mt-4 space-y-4">
            <section className="rounded-xl border border-primary/20 bg-primary-tint p-4 text-sm text-ink-secondary">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-primary">Deposit Pending</p>
                  <p className="mt-1 leading-6">The room is currently RESERVED while you complete the external deposit payment.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deadlineExpired ? "bg-red-50 text-alert" : "bg-white text-primary"}`}>
                  {countdown}
                </span>
              </div>
              {deadlineExpired && (<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">
                  The payment deadline has passed. Refresh to load the latest booking status. Contact the Partner if you already paid.
                </p>)}
            </section>

            {evidenceRejected && (<section className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-ink-secondary">
                <h2 className="font-semibold text-alert">Payment Evidence Rejected</h2>
                <p className="mt-2 leading-6">Your payment evidence was rejected. The deadline is still open, so you may upload new evidence.</p>
                {evidence.rejectionReason && (<p className="mt-2 leading-6"><span className="font-medium text-ink">Reason:</span> {evidence.rejectionReason}</p>)}
              </section>)}

            <section className="rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
              <h2 className="font-semibold text-ink">Deposit information</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-ink">Deposit amount</dt>
                  <dd className="mt-1">{booking.depositAmount ? `฿${rentFormatter.format(booking.depositAmount)}` : "Not provided"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Payment deadline</dt>
                  <dd className="mt-1">{formatBookingDate(booking.paymentDeadline)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Payment reference</dt>
                  <dd className="mt-1">{booking.id}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
              <h2 className="font-semibold text-ink">Payment instructions</h2>
              <p className="mt-2 leading-6">RoomStay does not process payments. Pay the deposit outside the system, then upload payment evidence for Partner verification.</p>
              <p className="mt-3 rounded-lg bg-canvas p-3 leading-6">{booking.deposit?.paymentInstructions || "Contact the Partner to confirm the deposit instructions."}</p>
              <p className="mt-2 leading-6">Confirm the recipient’s bank details directly with the Partner before paying.</p>
              <Link href={`/bookings/${booking.id}/upload-evidence`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary sm:w-auto">
                {evidenceRejected ? "Upload New Evidence" : "Upload Payment Evidence"}
              </Link>
            </section>
          </div>)}

        {booking.status === "CONFIRMED" && (<section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">Reservation confirmed</h2>
            <p className="mt-2 leading-6">Your payment evidence was verified by the Partner. The room is reserved for you, but the rental has not started yet.</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Planned move-in date</dt>
                  <dd className="mt-1">{formatBookingDate(booking.requestedMoveInDate)}</dd>
                </div>
                {evidenceVerified && (<div>
                    <dt className="font-medium text-ink">Evidence verified</dt>
                    <dd className="mt-1">{formatBookingDate(evidence.verifiedAt)}</dd>
                </div>)}
              {evidenceVerified && (<div>
                  <dt className="font-medium text-ink">Evidence file</dt>
                  <dd className="mt-1">{evidence.fileName}</dd>
                </div>)}
            </dl>
          </section>)}

        {booking.status === "ACTIVE" && (<section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">Rental Active</h2>
            <p className="mt-2 leading-6">The rental has started. The room is currently RENTED.</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Rental start date</dt>
                  <dd className="mt-1">{formatBookingDate(booking.rentalStartedAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Requested move-in date</dt>
                  <dd className="mt-1">{formatBookingDate(booking.requestedMoveInDate)}</dd>
              </div>
            </dl>
          </section>)}

        {booking.status === "COMPLETED" && (<section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">Rental Completed</h2>
            <p className="mt-2 leading-6">This rental is complete. The room is available again.</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Rental start date</dt>
                  <dd className="mt-1">{formatBookingDate(booking.rentalStartedAt)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Completion date</dt>
                  <dd className="mt-1">{formatBookingDate(booking.completedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Review eligibility</dt>
                <dd className="mt-1">{review ? "Review submitted" : "Eligible to leave one review"}</dd>
              </div>
            </dl>
            {review ? (<div className="mt-4 rounded-lg bg-primary-tint px-4 py-3">
                <p className="font-medium text-ink">Your review</p>
                <p className="mt-1 text-sm text-primary">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                <p className="mt-2 leading-6">{review.comment}</p>
                <p className="mt-2 text-xs text-ink-secondary">Reviewed on {formatBookingDate(review.createdAt)}</p>
              </div>) : (<Link href={`/bookings/${booking.id}/review`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary sm:w-auto">
                Leave a Review
              </Link>)}
          </section>)}

        {booking.status === "EXPIRED" && (<section className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-alert">Booking expired</h2>
            <p className="mt-2 leading-6">The payment deadline has passed. This booking can no longer receive new payment evidence, and the room is available again.</p>
            {evidenceRejected && evidence.rejectionReason && (<p className="mt-2 leading-6"><span className="font-medium text-ink">Rejection reason:</span> {evidence.rejectionReason}</p>)}
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">Payment deadline</dt>
                  <dd className="mt-1">{formatBookingDate(booking.paymentDeadline)}</dd>
                </div>
                {evidenceRejected && evidence.rejectedAt && (<div>
                    <dt className="font-medium text-ink">Rejected</dt>
                    <dd className="mt-1">{formatBookingDate(evidence.rejectedAt)}</dd>
                </div>)}
            </dl>
          </section>)}

        {booking.status === "VERIFICATION_PENDING" && (<section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">Payment evidence</h2>
            {evidence ? (<dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-ink">Evidence file</dt>
                  <dd className="mt-1">{evidence.fileName}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Uploaded</dt>
                  <dd className="mt-1">{formatBookingDate(evidence.uploadedAt)}</dd>
                </div>
                {evidence.note && (<div className="sm:col-span-2">
                    <dt className="font-medium text-ink">Note</dt>
                    <dd className="mt-1 leading-6">{evidence.note}</dd>
                  </div>)}
              </dl>) : (<p className="mt-2">Evidence metadata is not available in this browser.</p>)}
          </section>)}

        {["DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED"].includes(booking.status) && (<section className="mt-4 rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <h2 className="font-semibold text-ink">Ask the admin about this payment</h2>
            <p className="mt-2 leading-6">RoomStay does not move the money. Message an admin here if you need the payment evidence checked.</p>
            <Link href={`/bookings/${booking.id}/payment-chat`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink btn-secondary">Message admin</Link>
          </section>)}

        <dl className="mt-5 grid gap-4 text-sm text-ink-secondary sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">Renter</dt>
            <dd className="mt-1">{booking.renterName}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Current status</dt>
            <dd className="mt-1">{statusName(booking.status)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Requested move-in date</dt>
            <dd className="mt-1">{formatBookingDate(booking.requestedMoveInDate)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Created date</dt>
            <dd className="mt-1">{formatBookingDate(booking.createdAt)}</dd>
          </div>
          {booking.message && (<div className="sm:col-span-2">
              <dt className="font-medium text-ink">Message to Partner</dt>
              <dd className="mt-1 leading-6">{booking.message}</dd>
            </div>)}
          {booking.declineReason && (<div className="sm:col-span-2">
              <dt className="font-medium text-ink">Decline reason</dt>
              <dd className="mt-1 leading-6">{booking.declineReason}</dd>
            </div>)}
        </dl>

        {canCancel && (<div className="mt-5">
            <button type="button" onClick={cancelBooking} disabled={cancelling} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-alert bg-white px-5 text-sm font-semibold text-alert disabled:opacity-70">
              {cancelling ? "Cancelling..." : "Cancel booking"}
            </button>
            {cancelError && <p role="alert" className="mt-2 text-sm text-alert">{cancelError}</p>}
          </div>)}

        <Link href="/bookings" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink btn-secondary">
          Back to My Bookings
        </Link>
        <BookingActions booking={booking} />
      </section>

      <aside className="rounded-xl border border-line bg-white p-4 shadow-sm md:p-5 lg:sticky lg:top-8">
        <div className="relative aspect-[5/3] overflow-hidden rounded-lg bg-photo">
          <Image src={image} alt={imageAlt} fill sizes="(min-width: 1024px) 348px, calc(100vw - 44px)" className="object-cover"/>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{booking.propertyTitle}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{booking.propertyLocation}</p>
        {property && (<ul aria-label="Room details" className="mt-3 flex flex-wrap gap-4 text-sm text-ink-secondary">
            <li>{property.bedrooms === 0 ? "Studio" : `${property.bedrooms} Bedroom${property.bedrooms === 1 ? "" : "s"}`}</li>
            <li>{property.bathrooms} Bath</li>
            <li>{property.size} m²</li>
          </ul>)}
      </aside>
    </div>);
}
