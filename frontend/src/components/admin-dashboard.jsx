"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { formatBookingDate } from "@/lib/format-date";
import { readMockBookingRequests } from "@/lib/mock-bookings";
import { listingStatusLabel, listingStatusTone, mockListingsChangedEvent, readMockListings, } from "@/lib/mock-listings";
import { mockPartnerApplicationsChangedEvent, readMockPartnerApplications, } from "@/lib/mock-partner-application";
import { mockReportsChangedEvent, readMockReports, reportStatusLabel, reportStatusTone, reportTargetTypeLabel, } from "@/lib/mock-reports";
function applicationStatusTone(status) {
    if (status === "SUSPENDED")
        return "bg-amber-50 text-amber-800 ring-amber-200";
    if (status === "APPROVED")
        return "bg-[#e7f6ee] text-[#1d7a3f] ring-[#c9e9d4]";
    if (status === "REJECTED")
        return "bg-red-50 text-alert ring-red-100";
    return "bg-primary-tint text-primary ring-primary/25";
}
function applicationStatusLabel(status) {
    if (status === "SUSPENDED")
        return "Suspended";
    if (status === "PENDING")
        return "Pending";
    if (status === "APPROVED")
        return "Approved";
    return "Rejected";
}
function statCards(data) {
    return [
        { label: "Pending Partner Applications", value: data.pendingApplications, icon: "user" },
        { label: "Pending Listing Reviews", value: data.pendingListings, icon: "apartment" },
        { label: "Published Listings", value: data.publishedListings, icon: "homeFilled" },
        { label: "Active Rentals", value: data.activeRentals, icon: "room" },
        { label: "Open Reports", value: data.openReports, icon: "filter" },
    ];
}
export function AdminDashboard() {
    const [data, setData] = useState(null);
    useEffect(() => {
        function loadData() {
            const applications = readMockPartnerApplications();
            const listings = readMockListings();
            const bookings = readMockBookingRequests();
            const reports = readMockReports();
            const openReports = reports.filter((report) => report.status === "OPEN");
            setData({
                pendingApplications: applications.filter((application) => application.status === "PENDING").length,
                pendingListings: listings.filter((listing) => listing.listingStatus === "PENDING_REVIEW").length,
                publishedListings: listings.filter((listing) => listing.listingStatus === "PUBLISHED").length,
                activeRentals: bookings.filter((booking) => booking.status === "ACTIVE").length,
                openReports: openReports.length,
                recentApplications: [...applications]
                    .sort((first, second) => new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime())
                    .slice(0, 3),
                listingsAwaitingReview: listings
                    .filter((listing) => listing.listingStatus === "PENDING_REVIEW")
                    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
                    .slice(0, 3),
                recentOpenReports: [...openReports]
                    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
                    .slice(0, 3),
            });
        }
        const timeout = window.setTimeout(loadData, 0);
        window.addEventListener(mockPartnerApplicationsChangedEvent, loadData);
        window.addEventListener(mockListingsChangedEvent, loadData);
        window.addEventListener(mockReportsChangedEvent, loadData);
        window.addEventListener("roomstay:bookings-changed", loadData);
        window.addEventListener("storage", loadData);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockPartnerApplicationsChangedEvent, loadData);
            window.removeEventListener(mockListingsChangedEvent, loadData);
            window.removeEventListener(mockReportsChangedEvent, loadData);
            window.removeEventListener("roomstay:bookings-changed", loadData);
            window.removeEventListener("storage", loadData);
        };
    }, []);
    if (data === null) {
        return (<div className="rounded-2xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading dashboard...
      </div>);
    }
    return (<section>
      <div className="rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
        <p className="text-sm font-semibold text-primary">Admin Portal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Dashboard</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">Review Partner applications, listing submissions, and rental activity.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards(data).map((card) => (<article key={card.label} className="rounded-2xl border border-line bg-white p-5 shadow-sm shadow-ink/5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-tint text-primary"><Icon name={card.icon} size={22}/></span>
              <span className="text-3xl font-semibold tracking-[-0.04em] text-ink">{card.value}</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">{card.label}</p>
          </article>))}
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Quick actions</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link href="/admin/partner-applications" className="rounded-2xl border border-line bg-canvas/40 p-4 text-sm font-semibold text-ink btn-secondary">Review Partner Applications</Link>
          <Link href="/admin/listings" className="rounded-2xl border border-line bg-canvas/40 p-4 text-sm font-semibold text-ink btn-secondary">Review Listings</Link>
          <Link href="/admin/reports" className="rounded-2xl border border-line bg-canvas/40 p-4 text-sm font-semibold text-ink btn-secondary">Review Reports</Link>
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Recent Partner Applications</h2>
            <Link href="/admin/partner-applications" className="text-sm font-semibold text-primary hover:underline">View all</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {data.recentApplications.length === 0 ? (<p className="rounded-xl border border-dashed border-line bg-canvas/40 p-4 text-sm text-ink-secondary">No Partner applications yet.</p>) : data.recentApplications.map((application) => (<Link key={application.id} href={`/admin/partner-applications/${encodeURIComponent(application.id)}`} className="rounded-xl border border-line bg-canvas/40 p-4 btn-secondary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{application.fullName}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${applicationStatusTone(application.status)}`}>{applicationStatusLabel(application.status)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">Submitted {formatBookingDate(application.submittedAt)}</p>
                <p className="mt-1 text-sm font-semibold text-primary">Review ›</p>
              </Link>))}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Listings Awaiting Review</h2>
            <Link href="/admin/listings" className="text-sm font-semibold text-primary hover:underline">View all</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {data.listingsAwaitingReview.length === 0 ? (<p className="rounded-xl border border-dashed border-line bg-canvas/40 p-4 text-sm text-ink-secondary">No listings awaiting review.</p>) : data.listingsAwaitingReview.map((listing) => (<Link key={listing.id} href={`/admin/listings/${encodeURIComponent(listing.id)}`} className="rounded-xl border border-line bg-canvas/40 p-4 btn-secondary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{listing.title}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${listingStatusTone(listing.listingStatus)}`}>{listingStatusLabel(listing.listingStatus)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">Partner ID: {listing.partnerUserId}</p>
                <p className="mt-1 text-xs text-ink-secondary">Submitted {formatBookingDate(listing.submittedAt ?? listing.createdAt)}</p>
                <p className="mt-1 text-sm font-semibold text-primary">Review ›</p>
              </Link>))}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:col-span-2 md:p-7 xl:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Recent Open Reports</h2>
            <Link href="/admin/reports" className="text-sm font-semibold text-primary hover:underline">View all</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {data.recentOpenReports.length === 0 ? (<p className="rounded-xl border border-dashed border-line bg-canvas/40 p-4 text-sm text-ink-secondary">No open reports.</p>) : data.recentOpenReports.map((report) => (<Link key={report.id} href={`/admin/reports/${encodeURIComponent(report.id)}`} className="rounded-xl border border-line bg-canvas/40 p-4 btn-secondary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{report.targetLabel}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${reportStatusTone(report.status)}`}>{reportStatusLabel(report.status)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">{reportTargetTypeLabel(report.targetType)} · {report.reason}</p>
                <p className="mt-1 text-xs text-ink-secondary">Reported by {report.reporterName} · {formatBookingDate(report.createdAt)}</p>
                <p className="mt-1 text-sm font-semibold text-primary">Review ›</p>
              </Link>))}
          </div>
        </section>
      </div>
    </section>);
}
