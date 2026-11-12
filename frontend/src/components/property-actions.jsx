"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mockListingsChangedEvent } from "@/lib/mock-listings";
import { useRouter } from "next/navigation";
import { useMockAuth } from "@/lib/mock-auth";
import { mockRoomStatusesChangedEvent, defaultRoomStatus, readMockRoomStatus, roomStatusLabel, roomStatusMessage, setMockRoomStatus } from "@/lib/mock-bookings";
import { liveOpenConversation, liveSetRoomAvailability } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { ApiError } from "@/lib/api";
import { getOrCreateMockConversation } from "@/lib/mock-messages";
export function PropertyActions({ propertyId, propertyTitle, monthlyRent, availableNow, partnerUserId, }) {
    const router = useRouter();
    const { user, isReady, setPendingAction } = useMockAuth();
    const [roomStatus, setRoomStatus] = useState(() => defaultRoomStatus(availableNow));
    const [statusReady, setStatusReady] = useState(false);
    const [ownerError, setOwnerError] = useState("");
    const [openingMessage, setOpeningMessage] = useState(false);
    const [messageError, setMessageError] = useState("");
    const openingMessageRef = useRef(false);
    const ownsRoom = Boolean(user && partnerUserId && user.id === partnerUserId);
    const canSetAvailability = roomStatus === "AVAILABLE" || roomStatus === "UNAVAILABLE";
    const propertyPath = `/properties/${propertyId}`;
    const viewingDisabled = roomStatus === "UNAVAILABLE";
    const bookingDisabled = !statusReady || roomStatus !== "AVAILABLE";
    useEffect(() => {
        function loadStatus() {
            setRoomStatus(readMockRoomStatus(propertyId, defaultRoomStatus(availableNow)));
            setStatusReady(true);
        }
        const timeout = window.setTimeout(loadStatus, 0);
        window.addEventListener(mockRoomStatusesChangedEvent, loadStatus);
        window.addEventListener(mockListingsChangedEvent, loadStatus);
        window.addEventListener("storage", loadStatus);
        window.addEventListener("focus", loadStatus);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockRoomStatusesChangedEvent, loadStatus);
            window.removeEventListener(mockListingsChangedEvent, loadStatus);
            window.removeEventListener("storage", loadStatus);
            window.removeEventListener("focus", loadStatus);
        };
    }, [availableNow, propertyId]);
    function chooseAction(action) {
        if (action === "message" && openingMessageRef.current)
            return;
        if (action === "request-viewing" && viewingDisabled)
            return;
        if (action === "request-booking") {
            const currentStatus = readMockRoomStatus(propertyId, defaultRoomStatus(availableNow));
            setRoomStatus(currentStatus);
            if (bookingDisabled || currentStatus !== "AVAILABLE")
                return;
        }
        const returnTo = action === "request-viewing"
            ? `${propertyPath}/request-viewing`
            : action === "request-booking"
                ? `${propertyPath}/request-booking`
                : propertyPath;
        setPendingAction({
            action,
            propertyId,
            propertyTitle,
            returnTo,
            createdAt: new Date().toISOString(),
        });
        if (!user) {
            router.push(`/login?returnTo=${encodeURIComponent(returnTo)}&action=${action}`);
            return;
        }
        if (action === "message") {
            openingMessageRef.current = true;
            setOpeningMessage(true);
            setMessageError("");
            if (liveEnabled()) {
                void liveOpenConversation(propertyId, user.id).then((conversation) => {
                    router.push(`/messages/${encodeURIComponent(conversation.id)}`);
                }).catch((error) => {
                    openingMessageRef.current = false;
                    setOpeningMessage(false);
                    setMessageError(error instanceof ApiError ? error.message : "Could not open chat. Please try again.");
                });
                return;
            }
            try {
                const conversation = getOrCreateMockConversation(user.id, propertyId, user.fullName);
                router.push(`/messages/${encodeURIComponent(conversation.id)}`);
            } catch (error) {
                openingMessageRef.current = false;
                setOpeningMessage(false);
                setMessageError(error instanceof ApiError ? error.message : "Could not open chat. Please try again.");
            }
            return;
        }
        if (action === "request-viewing" || action === "request-booking") {
            router.push(returnTo);
            return;
        }
    }
    async function setAvailability(nextStatus) {
        if (!ownsRoom)
            return;
        setOwnerError("");
        try {
            if (liveEnabled())
                await liveSetRoomAvailability(propertyId, nextStatus);
            else
                setMockRoomStatus(propertyId, nextStatus);
            setRoomStatus(nextStatus);
        }
        catch (error) {
            setOwnerError(error instanceof ApiError ? error.message : "The room status could not be changed.");
        }
    }
    return (<aside aria-label="Booking options" className="order-[-1] rounded-2xl border border-[#e6e1f2] bg-white p-5 shadow-lg shadow-[#20104a0d] ring-1 ring-primary/10 lg:order-none lg:sticky lg:top-8">
      <p className="text-sm font-medium text-ink-secondary">Monthly rent</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#171044]">{monthlyRent}</p>
      <div className="mt-4 rounded-xl bg-primary-tint px-3 py-2.5 text-sm leading-6 text-ink-secondary">
        <span className="font-medium text-ink">Status: {roomStatusLabel(roomStatus)}.</span> {roomStatusMessage(roomStatus)}
      </div>
      {!isReady ? (<div className="mt-4 rounded-xl bg-primary-tint px-3 py-2 text-sm text-ink-secondary">
          Checking account status...
        </div>) : !user ? (<div className="mt-4 grid gap-2">
          <button type="button" onClick={() => router.push(`/login?returnTo=${encodeURIComponent(propertyPath)}`)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
            Log In
          </button>
          <button type="button" onClick={() => router.push(`/register?returnTo=${encodeURIComponent(propertyPath)}`)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e6e1f2] bg-white px-4 text-sm font-semibold text-ink btn-secondary">
            Sign Up
          </button>
        </div>) : ownsRoom ? (<div className="mt-4 grid gap-2">
          <p className="text-sm leading-6 text-ink-secondary">Signed in as {user.fullName}. You own this room, so only this account can change it. Log out to browse as a guest.</p>
          {canSetAvailability ? (<button type="button" onClick={() => setAvailability(roomStatus === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE")} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
              {roomStatus === "AVAILABLE" ? "Mark unavailable" : "Mark available"}
            </button>) : (<p className="text-sm leading-6 text-ink-secondary">The current reservation controls this room status.</p>)}
          <Link href="/partner/bookings" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e6e1f2] bg-white px-4 text-sm font-semibold text-ink btn-secondary">Review booking requests</Link>
          <Link href="/partner/listings" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e6e1f2] bg-white px-4 text-sm font-semibold text-ink btn-secondary">My rooms</Link>
          {ownerError && <p className="text-sm text-alert">{ownerError}</p>}
        </div>) : (<div className="mt-4 grid gap-2 max-[1199px]:sticky max-[1199px]:bottom-[calc(78px+env(safe-area-inset-bottom))] max-[1199px]:z-40 max-[1199px]:scroll-mb-28 max-[1199px]:bg-white max-[1199px]:py-2">
          <button type="button" onClick={() => chooseAction("message")} disabled={openingMessage} aria-busy={openingMessage || undefined} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e6e1f2] bg-white px-4 text-sm font-semibold text-ink btn-secondary disabled:cursor-wait disabled:opacity-70">
            {openingMessage ? "Opening chat..." : "Message"}
          </button>
          {messageError && <p role="alert" className="text-sm text-alert">{messageError}</p>}
          <button type="button" onClick={() => chooseAction("request-viewing")} disabled={viewingDisabled} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#e6e1f2] bg-white px-4 text-sm font-semibold text-ink btn-secondary disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-secondary">
            Request Viewing
          </button>
          <button type="button" onClick={() => chooseAction("request-booking")} disabled={bookingDisabled} aria-describedby={roomStatus === "RESERVED" ? "reserved-booking-help" : undefined} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold ${bookingDisabled ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-500 shadow-none" : "bg-primary text-white btn-primary"}`}>
            Request Booking
          </button>
          {roomStatus === "RESERVED" && (<p id="reserved-booking-help" className="text-center text-xs leading-5 text-ink-secondary">Booking unavailable while reserved.</p>)}
        </div>)}
    </aside>);
}
