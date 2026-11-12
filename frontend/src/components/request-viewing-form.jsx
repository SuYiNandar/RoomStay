"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMockAuth } from "@/lib/mock-auth";
import { formatViewingTime, viewingTimeOptions, todayDateString } from "@/lib/viewing-time";
import { DatePicker } from "@/components/date-picker";
import { formatBookingDate } from "@/lib/format-date";
import { mockRoomStatusesChangedEvent, defaultRoomStatus, readMockRoomStatus, roomStatusMessage } from "@/lib/mock-bookings";
import { mockListingsChangedEvent } from "@/lib/mock-listings";
import { ApiError } from "@/lib/api";
import { liveRequestViewing } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { saveMockViewingRequest } from "@/lib/mock-viewings";
const rentFormatter = new Intl.NumberFormat("en-US");
export function RequestViewingForm({ property }) {
    const router = useRouter();
    const { user, isReady, setPendingAction } = useMockAuth();
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [message, setMessage] = useState("");
    const [errors, setErrors] = useState({});
    const [request, setRequest] = useState(null);
    const [formError, setFormError] = useState("");
    const [roomStatus, setRoomStatus] = useState(() => defaultRoomStatus(property.availableNow));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submissionPending = useRef(false);
    const returnTo = `/properties/${property.id}/request-viewing`;
    const today = todayDateString();
    useEffect(() => {
        if (!isReady || user)
            return;
        setPendingAction({
            action: "request-viewing",
            propertyId: property.id,
            propertyTitle: property.title,
            returnTo,
            createdAt: new Date().toISOString(),
        });
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}&action=request-viewing`);
    }, [isReady, property.id, property.title, returnTo, router, setPendingAction, user]);
    useEffect(() => {
        if (!isReady || !user)
            return undefined;
        function loadStatus() {
            setRoomStatus(readMockRoomStatus(property.id, defaultRoomStatus(property.availableNow)));
        }
        const timeout = window.setTimeout(loadStatus, 0);
        const events = [mockRoomStatusesChangedEvent, mockListingsChangedEvent, "storage", "focus"];
        events.forEach(event => window.addEventListener(event, loadStatus));
        return () => {
            window.clearTimeout(timeout);
            events.forEach(event => window.removeEventListener(event, loadStatus));
        };
    }, [isReady, property.availableNow, property.id, user]);
    async function submit(event) {
        event.preventDefault();
        if (submissionPending.current || request || !user || roomStatus !== "AVAILABLE")
            return;
        const currentStatus = readMockRoomStatus(property.id, defaultRoomStatus(property.availableNow));
        setRoomStatus(currentStatus);
        if (currentStatus !== "AVAILABLE") return;
        const nextErrors = {};
        if (!date)
            nextErrors.date = "Preferred viewing date is required.";
        else if (date < today)
            nextErrors.date = "Preferred viewing date cannot be in the past.";
        if (!time)
            nextErrors.time = "Preferred viewing time is required.";
        else if (!viewingTimeOptions.some((option) => option.value === time)) {
            nextErrors.time = "Please select a valid viewing time between 7:00 AM and 9:00 PM.";
        }
        setErrors(nextErrors);
        setFormError("");
        if (Object.keys(nextErrors).length > 0)
            return;
        // Ref closes the gap before React renders the disabled button.
        submissionPending.current = true;
        setIsSubmitting(true);
        try {
            if (liveEnabled()) {
                setRequest(await liveRequestViewing({
                    propertyId: property.id,
                    viewingDate: date,
                    viewingTime: time,
                    message: message.trim(),
                }));
            } else {
                const nextRequest = {
                    id: `mock-viewing-${Date.now()}`,
                    propertyId: property.id,
                    propertyTitle: property.title,
                    propertyLocation: property.location,
                    renterId: user.id,
                    renterName: user.fullName,
                    viewingDate: date,
                    viewingTime: time,
                    message: message.trim(),
                    status: "REQUESTED",
                    createdAt: new Date().toISOString(),
                };
                saveMockViewingRequest(nextRequest);
                setRequest(nextRequest);
            }
        } catch (error) {
            submissionPending.current = false;
            setFormError(error instanceof ApiError ? error.message : "The viewing request could not be saved.");
        } finally {
            setIsSubmitting(false);
        }
    }
    if (!isReady) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Checking account access...
      </div>);
    }
    if (!user) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Redirecting to login...
      </div>);
    }
    if (property.partnerUserId && user.id === property.partnerUserId) {
        return (<section className="rounded-xl border border-line bg-white p-5 md:p-7">
        <p className="text-sm font-semibold text-primary">Your room</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">You cannot request a viewing of your own room</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">Viewing requests for this room are sent to you. Open your viewing requests to respond.</p>
        <Link href="/partner/viewings" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">Review viewing requests</Link>
      </section>);
    }
    if (roomStatus !== "AVAILABLE") {
        return (<section className="rounded-xl border border-line bg-white p-5 md:p-7">
        <div className="rounded-xl bg-primary-tint p-5">
          <p className="text-sm font-semibold text-primary">Property unavailable</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Viewing requests are unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            {roomStatusMessage(roomStatus)}
          </p>
        </div>
        <Link href={`/properties/${property.id}`} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white">
          Back to Property
        </Link>
      </section>);
    }
    if (request) {
        return (<section className="rounded-xl border border-line bg-white p-5 md:p-7">
        <div className="rounded-xl bg-primary-tint p-5">
          <p className="text-sm font-semibold text-primary">Viewing request sent</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Your viewing request is pending</h1>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            The partner can approve, request a reschedule, or decline this viewing later.
          </p>
        </div>
        <dl className="mt-5 grid gap-3 text-sm text-ink-secondary sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">Property</dt>
            <dd className="mt-1">{request.propertyTitle}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Preferred date and time</dt>
            <dd className="mt-1">{formatBookingDate(request.viewingDate)} at {formatViewingTime(request.viewingTime)}</dd>
          </div>
          {request.message && (<div className="sm:col-span-2">
              <dt className="font-medium text-ink">Message</dt>
              <dd className="mt-1">{request.message}</dd>
            </div>)}
        </dl>
        <Link href="/viewings" className="mt-6 mr-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-sm font-semibold text-primary">
          My Viewings
        </Link>
        <Link href={`/properties/${property.id}`} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white">
          Back to Property
        </Link>
      </section>);
    }
    return (<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-xl border border-line bg-white p-5 md:p-7">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Request Viewing</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Viewing is optional. You can still submit a booking request later without requesting a viewing first.
        </p>

        <form onSubmit={submit} noValidate className="mt-6 grid gap-5">
          <div className="text-sm font-medium">
            <span id="viewing-date-label">Preferred viewing date</span>
            <DatePicker id="viewing-date" value={date} min={today} onChange={setDate} invalid={Boolean(errors.date)} describedBy={errors.date ? "viewing-date-error" : undefined} labelledBy="viewing-date-label"/>
            {errors.date && <span id="viewing-date-error" className="mt-1.5 block text-xs text-alert">{errors.date}</span>}
          </div>

          <label className="text-sm font-medium">
            Preferred viewing time
            <select value={time} onChange={(event) => setTime(event.target.value)} required aria-invalid={Boolean(errors.time)} className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="" disabled>Select a time</option>
              {viewingTimeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {errors.time && <span className="mt-1.5 block text-xs text-alert">{errors.time}</span>}
          </label>

          <label className="text-sm font-medium">
            Message to Partner (Optional)
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={500} placeholder="Let the partner know your preferred details or questions." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-secondary focus:ring-2 focus:ring-primary focus:outline-none"/>
            <span className="mt-1.5 block text-right text-xs text-ink-secondary">{message.length}/500</span>
          </label>
          {formError && <p role="alert" className="text-sm text-alert">{formError}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            <Link href={`/properties/${property.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
              {isSubmitting ? "Sending request..." : "Submit Viewing Request"}
            </button>
          </div>
        </form>
      </section>

      <aside className="rounded-xl border border-line bg-white p-4 md:p-5 lg:sticky lg:top-8">
        <div className="relative aspect-[5/3] overflow-hidden rounded-lg bg-photo">
          <Image src={property.image} alt={property.imageAlt} fill sizes="(min-width: 1024px) 388px, calc(100vw - 44px)" className="object-cover"/>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{property.title}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{property.location}</p>
        <p className="mt-2 text-sm text-ink-secondary">
          <span className="text-xl font-semibold text-ink">฿{rentFormatter.format(property.price)}</span> / month
        </p>
      </aside>
    </div>);
}
