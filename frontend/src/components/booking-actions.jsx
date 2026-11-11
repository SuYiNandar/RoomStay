"use client";
import { useState } from "react";
import { liveCancelBooking, liveRecordRefund, liveSubmitReport } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
const buttonClass = "mt-3 min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink";
export function BookingActions({ booking, partner = false }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [confirmCancel, setConfirmCancel] = useState(false);
    if (!liveEnabled()) return null;
    const cancellable = ["PENDING", "DEPOSIT_PENDING", "VERIFICATION_PENDING", "CONFIRMED", ...(partner ? ["ACTIVE"] : [])].includes(booking.status);
    async function perform(action, success) {
        setBusy(true); setError(""); setMessage("");
        try { await action(); setMessage(success); setConfirmCancel(false); }
        catch (caught) { setError(caught.message || "Please try again."); }
        finally { setBusy(false); }
    }
    function refund(event) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        if (data.refundedAt) data.refundedAt = new Date(data.refundedAt).toISOString();
        void perform(() => liveRecordRefund(booking.id, data), "Refund record saved.");
    }
    function report(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        void perform(async () => {
            await liveSubmitReport({ ...data, targetType: "PROPERTY", targetId: booking.propertyId, targetLabel: booking.propertyTitle });
            form.reset();
        }, "Report submitted to the admin.");
    }
    return <section className="mt-5 rounded-xl border border-line p-4 text-sm">
        {cancellable && <div>
            <h2 className="font-semibold">Cancel booking</h2>
            <p className="mt-2 text-ink-secondary">Cancellation ends this booking. Any refund is handled separately with the partner.</p>
            {!confirmCancel ? <button className={buttonClass} onClick={() => setConfirmCancel(true)}>Cancel booking</button> : <div>
                <p className="mt-3">Confirm cancellation of this booking?</p>
                <button disabled={busy} className={buttonClass} onClick={() => perform(() => liveCancelBooking(booking.id, partner), "Booking cancelled.")}>Confirm cancellation</button>{" "}
                <button disabled={busy} className={buttonClass} onClick={() => setConfirmCancel(false)}>Keep booking</button>
            </div>}
        </div>}
        {booking.status === "CANCELLED" && <div>
            <h2 className="font-semibold">Refund record</h2>
            <p className="mt-2 text-ink-secondary">RoomStay records refunds; money is settled outside RoomStay.</p>
            {booking.refund ? <dl className="mt-3 grid gap-2">
                <div><dt>Status</dt><dd>{booking.refund.status.replaceAll("_", " ")}</dd></div>
                {booking.refund.amount != null && <div><dt>Amount</dt><dd>฿{booking.refund.amount.toLocaleString()}</dd></div>}
                {booking.refund.method && <div><dt>Method</dt><dd>{booking.refund.method}</dd></div>}
                {booking.refund.refundedAt && <div><dt>Refund date</dt><dd>{new Date(booking.refund.refundedAt).toLocaleDateString()}</dd></div>}
                {booking.refund.note && <div><dt>Note</dt><dd>{booking.refund.note}</dd></div>}
            </dl> : <p className="mt-2">No refund has been recorded.</p>}
            {partner && <details className="mt-3"><summary className="cursor-pointer font-semibold">Record or update refund</summary>
                <form key={booking.refund?.recordedAt || "new"} onSubmit={refund} className="mt-3 grid gap-3">
                    <label>Status<select name="status" defaultValue={booking.refund?.status || "REFUND_PENDING"} className={inputClass}>{["NOT_APPLICABLE", "REFUND_PENDING", "REFUNDED", "FORFEITED"].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
                    <label>Amount (THB)<input name="amount" type="number" min="0" step="1" defaultValue={booking.refund?.amount ?? ""} className={inputClass}/></label>
                    <label>Method<input name="method" maxLength={200} defaultValue={booking.refund?.method || ""} className={inputClass}/></label>
                    <label>Refund date<input name="refundedAt" type="date" defaultValue={booking.refund?.refundedAt?.slice(0,10) || ""} className={inputClass}/></label>
                    <label>Note<textarea name="note" maxLength={2000} defaultValue={booking.refund?.note || ""} className={inputClass}/></label>
                    <button disabled={busy} className={buttonClass}>Save refund record</button>
                </form>
            </details>}
        </div>}
        {!partner && <details className="mt-4"><summary className="cursor-pointer font-semibold">Report this property</summary>
            <form onSubmit={report} className="mt-3 grid gap-3">
                <label>Reason<input name="reason" required maxLength={200} className={inputClass}/></label>
                <label>Details<textarea name="description" maxLength={2000} className={inputClass}/></label>
                <button disabled={busy} className={buttonClass}>Submit report</button>
            </form>
        </details>}
        {error && <p role="alert" className="mt-3 text-alert">{error}</p>}
        {message && <p role="status" className="mt-3 text-primary">{message}</p>}
    </section>;
}
