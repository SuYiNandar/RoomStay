"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { ApiError } from "@/lib/api";
import { liveCancelViewing, liveDecideViewing } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { useMockAuth } from "@/lib/mock-auth";
import { formatBookingDate } from "@/lib/format-date";
import { findMockListingById, mockListingsChangedEvent } from "@/lib/mock-listings";
import { usePublicProperty, publishedListingFallbackImage } from "@/lib/published-listings";
import { formatViewingTime, isLegacyViewingTime, viewingTimeOptions, todayDateString } from "@/lib/viewing-time";
import { cancelMockViewing, mockViewingsChangedEvent, partnerOwnsViewing, readMockViewingRequests, renterCancellableViewingStatuses, reviewMockViewing, viewingStatuses, viewingStatusLabels, } from "@/lib/mock-viewings";
const panel = "rounded-2xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7";
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary";
const inputClass = "mt-2 w-full rounded-lg border border-line bg-white p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary";
function useViewings(partner, returnTo) {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [snapshot, setSnapshot] = useState(null);
    useEffect(() => {
        if (!isReady)
            return;
        if (!user) {
            router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
            return;
        }
        if (partner && !user.isPartner)
            return;
        function sync() {
            if (!user)
                return;
            const requests = readMockViewingRequests()
                .filter((request) => partner ? partnerOwnsViewing(request, user) : request.renterId === user.id)
                .map((request) => ({ ...request, propertyLocation: request.propertyLocation ?? findMockListingById(request.propertyId)?.location }))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setSnapshot({ userId: user.id, partner, requests });
        }
        const timeout = window.setTimeout(sync, 0);
        window.addEventListener(mockViewingsChangedEvent, sync);
        window.addEventListener(mockListingsChangedEvent, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockViewingsChangedEvent, sync);
            window.removeEventListener(mockListingsChangedEvent, sync);
            window.removeEventListener("storage", sync);
        };
    }, [isReady, partner, returnTo, router, user]);
    const requests = snapshot?.userId === user?.id && snapshot?.partner === partner ? snapshot.requests : null;
    return { user, isReady, requests };
}
function ViewingAccess({ state, partner, children }) {
    if (!state.isReady)
        return <div className={panel}>Checking account access...</div>;
    if (!state.user)
        return <div className={panel}>Redirecting to login...</div>;
    if (partner && !state.user.isPartner)
        return (<section className={panel}>
      <h1 className="text-2xl font-semibold">Partner access required</h1>
      <p className="mt-2 text-sm text-ink-secondary">Viewing review is for approved Partners.</p>
      <Link href="/become-a-partner" className={`${primaryButton} mt-5`}>Become a Partner</Link>
    </section>);
    if (state.requests === null)
        return <div className={panel}>Loading viewings...</div>;
    return children;
}
function ViewingBadge({ status }) {
    const tone = status === "APPROVED" ? "bg-[#e7f6ee] text-[#1d7a3f] ring-[#c9e9d4]"
        : status === "DECLINED" ? "bg-red-50 text-alert ring-red-100"
            : status === "RESCHEDULE_REQUESTED" ? "bg-[#fdf3e3] text-[#8a5a00] ring-[#eed9ae]"
                : status === "CANCELLED" ? "bg-canvas text-ink-secondary ring-line"
                    : "bg-primary-tint text-primary ring-primary/25";
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>{viewingStatusLabels[status]}</span>;
}
function ViewingTime({ value }) {
    // Stored legacy times outside 7:00 AM–9:00 PM are preserved and still
    // shown in 12-hour AM/PM form, with a small marker. Storage is never rewritten here.
    return (<span>
      {formatViewingTime(value)}
      {isLegacyViewingTime(value) && (<span className="ml-2 inline-flex rounded-full bg-[#fdf3e3] px-2 py-0.5 text-xs font-semibold text-[#8a5a00] ring-1 ring-inset ring-[#eed9ae]">
          Legacy time
        </span>)}
    </span>);
}
function PartnerResponse({ request }) {
    if (request.status === "RESCHEDULE_REQUESTED")
        return (<div className="mt-4 rounded-xl border border-primary/20 bg-primary-tint/40 p-4 text-sm">
      <h3 className="font-semibold text-primary">Partner suggested a new time</h3>
      <p className="mt-2">Partner suggested date: {formatBookingDate(request.partnerSuggestedDate)}</p>
      <p className="mt-1">Partner suggested time: <ViewingTime value={request.partnerSuggestedTime}/></p>
      {request.partnerMessage && <p className="mt-2 whitespace-pre-wrap break-words text-ink-secondary">{request.partnerMessage}</p>}
    </div>);
    if (request.status === "DECLINED")
        return (<div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm">
      <h3 className="font-semibold text-alert">Decline reason</h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-ink-secondary">{request.declineReason || "No reason recorded."}</p>
    </div>);
    return null;
}
function ViewingCard({ request, partner, details = false }) {
    const property = usePublicProperty(request.propertyId);
    const location = request.propertyLocation ?? property?.location ?? "Location no longer available";
    return (<article className={`${panel} grid gap-4 ${details ? "" : "md:grid-cols-[160px_minmax(0,1fr)]"}`}>
      <div className={`relative overflow-hidden rounded-xl bg-photo ${details ? "aspect-[3/1]" : "aspect-[5/3] md:aspect-[4/3]"}`}>
        <Image src={property?.image ?? publishedListingFallbackImage} alt={property?.imageAlt ?? request.propertyTitle} fill sizes={details ? "(min-width: 1024px) 850px, 90vw" : "(min-width: 768px) 160px, 90vw"} className="object-cover"/>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-lg font-semibold tracking-[-0.025em]">{request.propertyTitle}</h2>
          <ViewingBadge status={request.status}/>
        </div>
        <p className="mt-1 break-words text-sm text-ink-secondary">{location}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {(partner || details) && <div className="sm:col-span-2"><dt className="font-medium">Renter</dt><dd className="break-words text-ink-secondary">{request.renterName}</dd></div>}
          <div><dt className="font-medium">Requested date</dt><dd className="text-ink-secondary">{formatBookingDate(request.viewingDate)}</dd></div>
          <div><dt className="font-medium">Requested time</dt><dd className="text-ink-secondary"><ViewingTime value={request.viewingTime}/></dd></div>
          <div><dt className="font-medium">Submitted</dt><dd className="text-ink-secondary">{formatBookingDate(request.createdAt)}</dd></div>
          {details && request.updatedAt && <div><dt className="font-medium">Updated</dt><dd className="text-ink-secondary">{formatBookingDate(request.updatedAt)}</dd></div>}
          {(partner || details) && <div className="sm:col-span-2"><dt className="font-medium">Renter message</dt><dd className="whitespace-pre-wrap break-words text-ink-secondary">{request.message || "No message provided."}</dd></div>}
        </dl>
        <PartnerResponse request={request}/>
        <div className="mt-4 flex flex-wrap gap-3">
          {!details && <Link href={`${partner ? "/partner" : ""}/viewings/${encodeURIComponent(request.id)}`} className={partner ? primaryButton : secondaryButton}>{partner ? "Review" : "View Details"}</Link>}
          {details && property && <Link href={`/properties/${encodeURIComponent(request.propertyId)}`} className={secondaryButton}>View Property</Link>}
        </div>
      </div>
    </article>);
}
export function ViewingsList({ partner = false }) {
    const state = useViewings(partner, partner ? "/partner/viewings" : "/viewings");
    const [filter, setFilter] = useState("ALL");
    const visible = state.requests?.filter((request) => filter === "ALL" || request.status === filter) ?? [];
    return (<ViewingAccess state={state} partner={partner}>
      <section>
        <div className={panel}>
          {partner && <p className="text-sm font-semibold text-primary">Partner Portal</p>}
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{partner ? "Viewing Requests" : "My Viewings"}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">{partner ? "Review viewing requests for your properties and respond to renters." : "Track your viewing requests and the Partner’s response. Viewing is optional."}</p>
        </div>
        <div role="group" aria-label="Filter viewings by status" className="my-5 flex flex-wrap gap-2 rounded-2xl border border-line bg-white p-2">
          {["ALL", ...viewingStatuses].map((status) => (<button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${filter === status ? "bg-primary text-white" : "text-ink-secondary hover:bg-primary-tint hover:text-primary"}`}>
              {status === "ALL" ? "All" : viewingStatusLabels[status]}
            </button>))}
        </div>
        {visible.length ? <div className="grid gap-4">{visible.map((request) => <ViewingCard key={request.id} request={request} partner={partner}/>)}</div> : (<div className={`${panel} text-center`}>
            <h2 className="text-lg font-semibold">{state.requests?.length ? "No viewings in this status" : "No viewing requests yet"}</h2>
            <p className="mt-2 text-sm text-ink-secondary">{state.requests?.length ? "Choose another status to see your viewing requests." : partner ? "Requests for your properties will appear here." : "Request a viewing from a property page to get started."}</p>
            {!partner && !state.requests?.length && <Link href="/search" className={`${primaryButton} mt-5`}>Browse Rooms</Link>}
          </div>)}
      </section>
    </ViewingAccess>);
}
function RenterCancelViewing({ request }) {
    const { user } = useMockAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    if (!renterCancellableViewingStatuses.includes(request.status))
        return null;
    async function cancel() {
        if (!user || busy)
            return;
        if (!window.confirm("Cancel this viewing? The room stays in its current status."))
            return;
        setBusy(true);
        setError("");
        try {
            if (liveEnabled())
                await liveCancelViewing(request.id);
            else if (!cancelMockViewing(request.id, user.id))
                throw new Error("This viewing cannot be cancelled.");
        }
        catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "This viewing could not be cancelled.");
        }
        finally {
            setBusy(false);
        }
    }
    return (<section className={panel}>
      <h2 className="text-xl font-semibold">Cancel this viewing</h2>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">Viewing is optional. Cancelling it does not change the room or any booking.</p>
      <button type="button" onClick={cancel} disabled={busy} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-alert bg-white px-4 text-sm font-semibold text-alert disabled:opacity-70">
        {busy ? "Cancelling..." : "Cancel viewing"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-alert">{error}</p>}
    </section>);
}
function ViewingReviewActions({ request }) {
    const { user } = useMockAuth();
    const [action, setAction] = useState("APPROVED");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [message, setMessage] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    async function submit(event) {
        event.preventDefault();
        if (!user || saved)
            return;
        if (action === "RESCHEDULE_REQUESTED" && (!date || !time)) {
            setError("Suggested date and time are required.");
            return;
        }
        if (action === "RESCHEDULE_REQUESTED" && !viewingTimeOptions.some((slot) => slot.value === time)) {
            setError("Please select a valid suggested time between 7:00 AM and 9:00 PM.");
            return;
        }
        if (action === "DECLINED" && !reason.trim()) {
            setError("A decline reason is required.");
            return;
        }
        const decision = action === "APPROVED" ? { status: action }
            : action === "DECLINED" ? { status: action, declineReason: reason }
                : { status: action, partnerSuggestedDate: date, partnerSuggestedTime: time, partnerMessage: message };
        try {
            if (liveEnabled()) {
                await liveDecideViewing(request.id, decision);
                setSaved(true);
                setError("");
                return;
            }
            if (!reviewMockViewing(request.id, user, decision)) {
                setError("This request cannot be updated. Check your date and time, or refresh to see the latest status.");
                return;
            }
            setSaved(true);
            setError("");
        }
        catch {
            setError("Your decision could not be saved. Please try again.");
        }
    }
    if (request.status !== "REQUESTED" || saved)
        return <p role="status" className={`${panel} text-sm text-ink-secondary`}>Partner response recorded. This viewing has already been reviewed.</p>;
    return (<section className={panel}>
      <h2 className="text-xl font-semibold">Respond to request</h2>
      <form onSubmit={submit} noValidate className="mt-5 grid gap-5">
        <fieldset>
          <legend className="text-sm font-medium">Choose a response</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {[
            ["APPROVED", "Approve"], ["RESCHEDULE_REQUESTED", "Suggest new date/time"], ["DECLINED", "Decline"],
        ].map(([value, label]) => (<label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm">
                <input type="radio" name="viewing-response" checked={action === value} onChange={() => { setAction(value); setError(""); }} className="accent-primary"/>{label}
              </label>))}
          </div>
        </fieldset>
        {action === "APPROVED" && <p className="text-sm text-ink-secondary">Approve the requested viewing on {formatBookingDate(request.viewingDate)} at <ViewingTime value={request.viewingTime}/>.</p>}
        {action === "RESCHEDULE_REQUESTED" && (<div className="grid gap-4 sm:grid-cols-2">
            <div className="text-sm font-medium">
              <span id="suggested-date-label">Suggested date (required)</span>
              <DatePicker id="suggested-date" min={todayDateString()} value={date} onChange={setDate} labelledBy="suggested-date-label" invalid={Boolean(error && !date)}/>
            </div>
            <label className="text-sm font-medium">Suggested time (required)
              <select value={time} onChange={(event) => setTime(event.target.value)} required className={inputClass}>
                <option value="">Select a time</option>
                {viewingTimeOptions.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium sm:col-span-2">Message to renter (optional)
              <textarea rows={3} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass}/>
            </label>
          </div>)}
        {action === "DECLINED" && <label className="text-sm font-medium">Decline reason (required)<textarea rows={3} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}/></label>}
        {error && <p role="alert" className="text-sm text-alert">{error}</p>}
        <button type="submit" className={`${primaryButton} justify-self-start`}>{action === "APPROVED" ? "Approve Viewing" : action === "DECLINED" ? "Decline Viewing" : "Send Reschedule Request"}</button>
      </form>
    </section>);
}
export function ViewingDetails({ viewingId, partner = false }) {
    const base = partner ? "/partner/viewings" : "/viewings";
    const state = useViewings(partner, `${base}/${encodeURIComponent(viewingId)}`);
    const request = state.requests?.find((item) => item.id === viewingId);
    return (<ViewingAccess state={state} partner={partner}>
      <div className="grid gap-5">
        <Link href={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">‹ Back to {partner ? "Viewing Requests" : "My Viewings"}</Link>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">{partner ? "Review Viewing" : "Viewing Details"}</h1>
        {request ? <>
          <ViewingCard request={request} partner={partner} details/>
          {!partner && <RenterCancelViewing key={request.id} request={request}/>}
          {partner && <ViewingReviewActions key={request.id} request={request}/>}
        </> : <div className={panel}><h2 className="text-lg font-semibold">Viewing request not found</h2><p className="mt-2 text-sm text-ink-secondary">This viewing is unavailable or does not belong to your account.</p></div>}
      </div>
    </ViewingAccess>);
}
