"use client";
import { PrivateFileLink } from "@/components/private-file-link";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { liveChangePartnerAccess, liveReloadAdminApplications, liveReviewApplication } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { formatBookingDate } from "@/lib/format-date";
import { useMockAuth } from "@/lib/mock-auth";
import { findMockPartnerApplicationById, mockPartnerApplicationsChangedEvent, reviewMockPartnerApplication, } from "@/lib/mock-partner-application";
export function AdminPartnerApplicationReview({ applicationId }) {
    const { grantPartnerAccess, isReady } = useMockAuth();
    const [application, setApplication] = useState(undefined);
    const [rejectionReason, setRejectionReason] = useState("");
    const [banReason, setBanReason] = useState("");
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    useEffect(() => {
        if (!isReady)
            return undefined;
        let active = true;
        function loadApplication() {
            if (active)
                setApplication(findMockPartnerApplicationById(applicationId));
        }
        async function load() {
            if (liveEnabled()) {
                try {
                    await liveReloadAdminApplications();
                }
                catch {
                    // Keep the application that is already in the session cache.
                }
            }
            loadApplication();
        }
        void load();
        window.addEventListener(mockPartnerApplicationsChangedEvent, loadApplication);
        return () => {
            active = false;
            window.removeEventListener(mockPartnerApplicationsChangedEvent, loadApplication);
        };
    }, [applicationId, isReady]);
    if (application === undefined) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading application...
      </div>);
    }
    if (!application) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Application not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          This Partner application does not exist in this browser.
        </p>
        <Link href="/admin/partner-applications" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Back to Applications
        </Link>
      </section>);
    }
    const isPending = application.status === "PENDING";
    async function approve() {
        if (!application || !isPending)
            return;
        if (liveEnabled()) {
            try {
                const updated = await liveReviewApplication(application.id, { status: "APPROVED" });
                grantPartnerAccess(updated.userId);
                setApplication(updated);
                setError("");
                setSuccessMessage("Application approved. The user account now has Partner access.");
            }
            catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The application could not be approved.");
            }
            return;
        }
        const updated = reviewMockPartnerApplication(application.id, { status: "APPROVED" });
        if (!updated)
            return;
        grantPartnerAccess(updated.userId);
        setApplication(updated);
        setError("");
        setSuccessMessage("Application approved. The user account now has Partner access.");
    }
    async function reject(event) {
        event.preventDefault();
        if (!application || !isPending)
            return;
        const reason = rejectionReason.trim();
        if (!reason) {
            setError("A ban reason is required.");
            return;
        }
        if (liveEnabled()) {
            try {
                const updated = await liveReviewApplication(application.id, { status: "REJECTED", rejectionReason: reason });
                setApplication(updated);
                setError("");
                setRejectionReason("");
                setSuccessMessage("Application banned. The user remains a Normal User and may submit a new application later.");
            }
            catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The application could not be rejected.");
            }
            return;
        }
        const updated = reviewMockPartnerApplication(application.id, { status: "REJECTED", rejectionReason: reason });
        if (!updated)
            return;
        setApplication(updated);
        setRejectionReason("");
        setError("");
        setSuccessMessage("Application banned. The user remains a Normal User and may submit a new application later.");
    }
    async function banPartner(event) {
        event.preventDefault();
        if (!application || application.status !== "APPROVED")
            return;
        const reason = banReason.trim();
        if (!reason) {
            setError("A ban reason is required.");
            return;
        }
        if (!liveEnabled()) {
            setError("Partner bans are saved through the API.");
            return;
        }
        try {
            const updated = await liveChangePartnerAccess(application.userId, { status: "SUSPENDED", reason });
            setApplication(updated);
            setBanReason("");
            setError("");
            setSuccessMessage("Partner banned. Their listings are hidden and new partner activity is blocked. Past bookings stay on record.");
        }
        catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "The partner could not be banned.");
        }
    }
    async function restorePartner() {
        if (!application || application.status !== "SUSPENDED")
            return;
        if (!liveEnabled())
            return;
        try {
            const updated = await liveChangePartnerAccess(application.userId, { status: "APPROVED" });
            setApplication(updated);
            setError("");
            setSuccessMessage("Partner access restored.");
        }
        catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Partner access could not be restored.");
        }
    }
    return (<section>
      <Link href="/admin/partner-applications" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary">
        <span aria-hidden="true">‹</span> Back to applications
      </Link>

      <div className="mt-3">
        <p className="text-sm font-semibold text-primary">Admin Review</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Application {application.id}</h1>
        <p className="mt-2 text-sm text-ink-secondary">Status: {application.status}</p>
      </div>

      {successMessage && (<p role="status" className="mt-5 rounded-xl bg-primary-tint px-4 py-3 text-sm leading-6 text-primary">
          {successMessage}
        </p>)}

      <dl className="mt-5 grid gap-4 rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary sm:grid-cols-2 md:p-6">
        <div>
          <dt className="font-medium text-ink">Applicant</dt>
          <dd className="mt-1">{application.fullName}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Email</dt>
          <dd className="mt-1">{application.email}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Phone</dt>
          <dd className="mt-1">{application.phone}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Submitted</dt>
          <dd className="mt-1">{formatBookingDate(application.submittedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">ID document</dt>
          <dd className="mt-1"><PrivateFileLink url={application.idDocumentUrl} name={application.idDocumentName}>{application.idDocumentName}</PrivateFileLink> ({application.idDocumentType})</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Ownership document</dt>
          <dd className="mt-1"><PrivateFileLink url={application.ownershipDocumentUrl} name={application.ownershipDocumentName}>{application.ownershipDocumentName}</PrivateFileLink> ({application.ownershipDocumentType})</dd>
        </div>
        {application.note && (<div className="sm:col-span-2">
            <dt className="font-medium text-ink">Applicant note</dt>
            <dd className="mt-1 leading-6">{application.note}</dd>
          </div>)}
        {application.reviewedAt && (<div>
            <dt className="font-medium text-ink">Reviewed</dt>
            <dd className="mt-1">{formatBookingDate(application.reviewedAt)}</dd>
          </div>)}
        {application.rejectionReason && (<div className="sm:col-span-2">
            <dt className="font-medium text-ink">Rejection reason</dt>
            <dd className="mt-1 leading-6">{application.rejectionReason}</dd>
          </div>)}
      </dl>

      {isPending && (<div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Approve Application</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Approval upgrades the same user account with Partner access.</p>
            <button type="button" onClick={approve} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
              Approve
            </button>
          </div>

          <form onSubmit={reject} noValidate className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Ban application</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Banning a pending application rejects it. The user stays a Normal User and may apply again.</p>
            <label className="mt-4 block text-sm font-medium">
              Ban reason
              <textarea rows={4} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-line px-3 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
              {error && <span className="mt-1.5 block text-xs text-alert">{error}</span>}
            </label>
            <button type="submit" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-alert px-4 text-sm font-semibold text-white">
              Ban application
            </button>
          </form>
        </div>)}

      {application.status === "APPROVED" && (<form onSubmit={banPartner} noValidate className="mt-5 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold">Ban partner</h2>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">This suspends an approved partner. Published listings are hidden and new partner activity is blocked. The Normal User account and booking history remain.</p>
          <label className="mt-4 block text-sm font-medium">
            Ban reason
            <textarea rows={4} value={banReason} onChange={(event) => setBanReason(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-line px-3 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
            {error && <span className="mt-1.5 block text-xs text-alert">{error}</span>}
          </label>
          <button type="submit" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-alert px-4 text-sm font-semibold text-white">
            Ban partner
          </button>
        </form>)}

      {application.status === "SUSPENDED" && (<div className="mt-5 rounded-xl border border-line bg-white p-4">
          <h2 className="font-semibold">Partner is banned</h2>
          {application.suspensionReason && <p className="mt-2 text-sm leading-6 text-ink-secondary">{application.suspensionReason}</p>}
          {error && <p className="mt-2 text-sm text-alert">{error}</p>}
          <button type="button" onClick={restorePartner} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
            Restore partner access
          </button>
        </div>)}
    </section>);
}
