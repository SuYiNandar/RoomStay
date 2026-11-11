"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EvidenceSlip } from "@/components/evidence-slip";
import { api, ApiError } from "@/lib/api";
import { liveAdminPaymentReply, livePartnerPaymentChat, livePaymentChat } from "@/lib/live-actions";
import { useMockAuth } from "@/lib/mock-auth";

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function senderLabel(message) {
    if (message.senderRole === "ADMIN")
        return "Admin";
    if (message.senderRole === "PARTNER")
        return message.senderName || "Partner";
    return message.senderName || "Renter";
}
export function PaymentChat({ bookingId, inquiryId, audience = "renter" }) {
    const { user, isReady } = useMockAuth();
    const admin = audience === "admin";
    const partner = audience === "partner";
    const [inquiry, setInquiry] = useState(undefined);
    const [slip, setSlip] = useState(null);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        if (!isReady || !user)
            return undefined;
        let active = true;
        const path = admin
            ? `/api/admin/payment-chats/${inquiryId}`
            : partner
                ? `/api/partner/bookings/${bookingId}/payment-chat`
                : `/api/bookings/${bookingId}/payment-chat`;
        const bookingPath = admin ? null : partner ? `/api/partner/bookings/${bookingId}` : `/api/bookings/${bookingId}`;
        function refresh() {
        if (document.visibilityState === "hidden") return;
        Promise.all([api(path), bookingPath ? api(bookingPath) : Promise.resolve(null)])
            .then(([data, bookingData]) => {
            if (!active)
                return;
            setInquiry(data.inquiry);
            setSlip(data.inquiry?.evidence || bookingData?.booking?.evidence || null);
        })
            .catch((caught) => {
            if (active)
                setError(caught instanceof ApiError ? caught.message : "The payment chat could not be opened.");
        });
        }
        refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
            active = false;
        };
    }, [admin, bookingId, inquiryId, isReady, partner, user]);
    async function submit(event) {
        event.preventDefault();
        if (!draft.trim())
            return;
        setError("");
        try {
            const next = admin
                ? await liveAdminPaymentReply(inquiryId, draft.trim())
                : partner
                    ? await livePartnerPaymentChat(bookingId, draft.trim())
                    : await livePaymentChat(bookingId, draft.trim());
            setInquiry(next);
            setSlip(next?.evidence || slip);
            setDraft("");
        }
        catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "The message could not be sent.");
        }
    }
    if (!isReady || (inquiry === undefined && !error)) {
        return <div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">Loading payment chat...</div>;
    }
    const messages = inquiry?.messages ?? [];
    return (<section className="rounded-2xl border border-line bg-white shadow-sm shadow-ink/5">
      <div className="border-b border-line p-4">
        <p className="text-sm font-semibold text-primary">Payment verification</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{admin ? inquiry?.partnerName || "Partner" : "Message the admin"}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{inquiry?.propertyTitle || "This chat is about the deposit slip. RoomStay does not move the money."}</p>
      </div>
      {slip ? (<div className="border-b border-line bg-[#f7f4ee] p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Deposit slip</p>
          <EvidenceSlip evidence={slip}/>
        </div>) : inquiry ? (<p className="border-b border-line px-4 py-3 text-sm leading-6 text-ink-secondary">No deposit slip has been uploaded for this booking yet.</p>) : null}
      <div className="max-h-[50vh] min-h-40 overflow-y-auto p-4">
        {messages.length === 0 ? <p className="text-sm text-ink-secondary">No messages yet. Ask the admin to check the payment evidence.</p> : <ul className="grid gap-2.5">
          {messages.map((message) => {
            const mine = admin ? message.senderRole === "ADMIN" : partner ? message.senderRole === "PARTNER" : message.senderRole === "RENTER";
            return (<li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3.5 py-2.5 text-sm leading-6 ${mine ? "rounded-2xl rounded-br-md bg-primary text-white" : "rounded-2xl rounded-bl-md bg-canvas text-ink"}`}>
                <p className="break-words">{message.text}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-white/80" : "text-ink-secondary"}`}>{senderLabel(message)} · {formatTime(message.createdAt)}</p>
              </div>
            </li>);
        })}
        </ul>}
      </div>
      {error && <p className="px-4 text-sm text-alert">{error}</p>}
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-4">
        <label htmlFor="payment-chat-input" className="sr-only">Message</label>
        <input id="payment-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={admin ? "Reply about this payment..." : "Ask the admin about this payment..."} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
        <button type="submit" disabled={!draft.trim()} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-secondary">Send</button>
      </form>
      <div className="border-t border-line px-4 py-3">
        <Link href={admin ? "/admin/payment-chats" : partner ? `/partner/bookings/${bookingId}` : `/bookings/${bookingId}`} className="text-sm font-semibold text-primary">Back</Link>
      </div>
    </section>);
}

export function AdminPaymentChatList() {
    const { user, isReady } = useMockAuth();
    const [inquiries, setInquiries] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!isReady || user?.role !== "ADMIN")
            return undefined;
        let active = true;
        function refresh() {
        if (document.visibilityState === "hidden") return;
        api("/api/admin/payment-chats")
            .then((data) => {
            if (active)
                setInquiries(data.inquiries);
        })
            .catch((caught) => {
            if (active)
                setError(caught instanceof ApiError ? caught.message : "Payment chats could not be loaded.");
        });
        }
        refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
            active = false;
        };
    }, [isReady, user]);
    if (!isReady || (inquiries === null && !error)) {
        return <div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">Loading payment chats...</div>;
    }
    return (<section>
      <p className="text-sm font-semibold text-primary">Admin</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Payment chats</h1>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">Partners message here when a deposit needs to be checked. Reply in the chat. RoomStay still does not move the money.</p>
      {error && <p className="mt-4 text-sm text-alert">{error}</p>}
      {inquiries?.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-ink-secondary">No payment messages yet.</p> : <ul className="mt-5 grid gap-3">
        {inquiries?.map((inquiry) => <li key={inquiry.id}>
          <Link href={`/admin/payment-chats/${inquiry.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm">
            <p className="font-semibold">{inquiry.partnerName || inquiry.renterName}</p>
            <p className="mt-1 text-sm text-ink-secondary">{inquiry.propertyTitle} · {inquiry.bookingStatus?.replaceAll("_", " ")}</p>
            <p className="mt-2 text-sm text-ink">{inquiry.messages.at(-1)?.text || "No message text"}</p>
          </Link>
        </li>)}
      </ul>}
    </section>);
}

export function PartnerPaymentChatList() {
    const { user, isReady } = useMockAuth();
    const [inquiries, setInquiries] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!isReady || !user?.isPartner)
            return undefined;
        let active = true;
        function refresh() {
        if (document.visibilityState === "hidden") return;
        api("/api/partner/payment-chats")
            .then((data) => {
            if (active)
                setInquiries(data.inquiries);
        })
            .catch((caught) => {
            if (active)
                setError(caught instanceof ApiError ? caught.message : "Payment chats could not be loaded.");
        });
        }
        refresh();
        const interval = window.setInterval(refresh, 15000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
            active = false;
        };
    }, [isReady, user]);
    if (!isReady || (inquiries === null && !error)) {
        return <div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">Loading payment chats...</div>;
    }
    return (<section>
      <p className="text-sm font-semibold text-primary">Partner</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Payment chat</h1>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">Message the admin about a deposit that is waiting to be checked. RoomStay does not move the money.</p>
      {error && <p className="mt-4 text-sm text-alert">{error}</p>}
      {inquiries?.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-ink-secondary">No payment chats yet. Open a booking that is waiting for a deposit, then choose Message admin.</p> : <ul className="mt-5 grid gap-3">
        {inquiries?.map((inquiry) => <li key={inquiry.id}>
          <Link href={`/partner/bookings/${inquiry.bookingId}/payment-chat`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm">
            <p className="font-semibold">{inquiry.propertyTitle}</p>
            <p className="mt-1 text-sm text-ink-secondary">{inquiry.renterName} · {inquiry.bookingStatus?.replaceAll("_", " ")}</p>
            <p className="mt-2 text-sm text-ink">{inquiry.messages.at(-1)?.text || "No message text"}</p>
          </Link>
        </li>)}
      </ul>}
    </section>);
}
