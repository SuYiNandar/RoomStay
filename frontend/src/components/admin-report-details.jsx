"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { liveReviewReport } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { formatBookingDate } from "@/lib/format-date";
import { findMockReportById, mockReportsChangedEvent, reportStatusLabel, reportStatusTone, reportTargetTypeLabel, reviewMockReport, } from "@/lib/mock-reports";
function targetHref(report) {
    if (report.targetType === "PROPERTY")
        return { href: `/properties/${encodeURIComponent(report.targetId)}`, label: "View Property" };
    return { href: `/admin/users/${encodeURIComponent(report.targetId)}`, label: "View User" };
}
export function AdminReportDetails({ reportId }) {
    const [report, setReport] = useState(undefined);
    const [resolveNote, setResolveNote] = useState("");
    const [dismissNote, setDismissNote] = useState("");
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    useEffect(() => {
        function loadReport() {
            setReport(findMockReportById(reportId));
        }
        const timeout = window.setTimeout(loadReport, 0);
        window.addEventListener(mockReportsChangedEvent, loadReport);
        window.addEventListener("storage", loadReport);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockReportsChangedEvent, loadReport);
            window.removeEventListener("storage", loadReport);
        };
    }, [reportId]);
    if (report === undefined) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading report...
      </div>);
    }
    if (!report) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Report not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          This report may have been removed or is not available to this account.
        </p>
        <Link href="/admin/reports" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Back to Reports
        </Link>
      </section>);
    }
    const isOpen = report.status === "OPEN";
    const isActionable = isOpen || report.status === "UNDER_REVIEW";
    const target = targetHref(report);
    async function applyDecision(decision) {
        if (liveEnabled()) {
            try {
                const updated = await liveReviewReport(reportId, decision);
                setReport(updated);
                setResolveNote("");
                setDismissNote("");
                setError("");
                setSuccessMessage(`Report ${reportStatusLabel(updated.status).toLowerCase()}.`);
            }
            catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The report could not be updated.");
            }
            return;
        }
        const updated = reviewMockReport(reportId, decision);
        if (!updated) {
            setError("This report cannot be updated. It may have been reviewed already.");
            return;
        }
        setReport(updated);
        setResolveNote("");
        setDismissNote("");
        setError("");
        setSuccessMessage(`Report ${reportStatusLabel(updated.status).toLowerCase()}.`);
    }
    function markUnderReview() {
        applyDecision({ status: "UNDER_REVIEW" });
    }
    function resolve(event) {
        event.preventDefault();
        if (!resolveNote.trim()) {
            setError("A short resolution note is required to resolve a report.");
            return;
        }
        applyDecision({ status: "RESOLVED", resolutionNote: resolveNote });
    }
    function dismiss(event) {
        event.preventDefault();
        applyDecision({ status: "DISMISSED", resolutionNote: dismissNote });
    }
    return (<section>
      <Link href="/admin/reports" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary">
        <span aria-hidden="true">‹</span> Back to reports
      </Link>

      <div className="mt-3">
        <p className="text-sm font-semibold text-primary">Admin Review</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">{report.targetLabel}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${reportStatusTone(report.status)}`}>
            {reportStatusLabel(report.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-secondary">
          {reportTargetTypeLabel(report.targetType)} report · Submitted {formatBookingDate(report.createdAt)}
        </p>
      </div>

      {successMessage && (<p role="status" className="mt-5 rounded-xl bg-primary-tint px-4 py-3 text-sm leading-6 text-primary">
          {successMessage}
        </p>)}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-5 md:p-6">
          <h2 className="text-base font-semibold tracking-[-0.025em]">Reporter</h2>
          <dl className="mt-4 grid gap-3 text-sm text-ink-secondary">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="font-medium text-ink">Name</dt>
              <dd>{report.reporterName}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="font-medium text-ink">Submitted</dt>
              <dd>{formatBookingDate(report.createdAt)}</dd>
            </div>
            {report.reviewedAt && (<div className="flex flex-wrap justify-between gap-2">
                <dt className="font-medium text-ink">Last reviewed</dt>
                <dd>{formatBookingDate(report.reviewedAt)}</dd>
              </div>)}
          </dl>
          {target && (<Link href={target.href} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary">
              {target.label}
            </Link>)}
        </section>

        <section className="rounded-xl border border-line bg-white p-5 md:p-6">
          <h2 className="text-base font-semibold tracking-[-0.025em]">Report details</h2>
          <dl className="mt-4 grid gap-3 text-sm text-ink-secondary">
            <div>
              <dt className="font-medium text-ink">Reason</dt>
              <dd className="mt-1">{report.reason}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Description</dt>
              <dd className="mt-1 leading-6 break-words">{report.description}</dd>
            </div>
            {report.resolutionNote && (<div>
                <dt className="font-medium text-ink">Resolution note</dt>
                <dd className="mt-1 leading-6 break-words">{report.resolutionNote}</dd>
              </div>)}
          </dl>
        </section>
      </div>

      {isActionable ? (<section className="mt-4 rounded-xl border border-line bg-white p-5 md:p-6">
          <h2 className="text-base font-semibold tracking-[-0.025em]">Moderation actions</h2>
          {isOpen && (<button type="button" onClick={markUnderReview} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary">
              Mark Under Review
            </button>)}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <form onSubmit={resolve} className="rounded-xl bg-canvas/40 p-4 ring-1 ring-inset ring-line">
              <label className="text-sm font-medium text-ink">
                Resolution note (required)
                <textarea value={resolveNote} onChange={(event) => setResolveNote(event.target.value)} rows={3} maxLength={500} placeholder="Summarize how this report was resolved." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-secondary focus:ring-2 focus:ring-primary focus:outline-none"/>
              </label>
              <button type="submit" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
                Resolve Report
              </button>            </form>
            <form onSubmit={dismiss} className="rounded-xl bg-canvas/40 p-4 ring-1 ring-inset ring-line">
              <label className="text-sm font-medium text-ink">
                Dismissal note (optional)
                <textarea value={dismissNote} onChange={(event) => setDismissNote(event.target.value)} rows={3} maxLength={500} placeholder="Optionally record why this report was dismissed." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-secondary focus:ring-2 focus:ring-primary focus:outline-none"/>
              </label>
              <button type="submit" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary">
                Dismiss Report
              </button>
            </form>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-alert">{error}</p>}
        </section>) : (<p className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-secondary">
          This report has been {reportStatusLabel(report.status).toLowerCase()} and is read-only.
        </p>)}
    </section>);
}
