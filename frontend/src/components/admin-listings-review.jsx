"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, publicImageUrl } from "@/lib/api";
import { liveReviewListing } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { formatBookingDate } from "@/lib/format-date";
import { roomStatusLabel } from "@/lib/mock-bookings";
import { bedroomLabel } from "@/lib/property-format";
import { findMockListingById, mockListingsChangedEvent, reviewMockListing, } from "@/lib/mock-listings";
const rentFormatter = new Intl.NumberFormat("en-US");
export function AdminListingReview({ listingId }) {
    const [listing, setListing] = useState(undefined);
    const [rejectionReason, setRejectionReason] = useState("");
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    useEffect(() => {
        function loadListing() {
            setListing(findMockListingById(listingId));
        }
        const timeout = window.setTimeout(loadListing, 0);
        window.addEventListener(mockListingsChangedEvent, loadListing);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockListingsChangedEvent, loadListing);
        };
    }, [listingId]);
    if (listing === undefined) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading listing...
      </div>);
    }
    if (!listing) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Listing not found</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          This Partner listing does not exist in this browser.
        </p>
        <Link href="/admin/listings" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Back to Listings
        </Link>
      </section>);
    }
    const isPendingReview = listing.listingStatus === "PENDING_REVIEW";
    async function approve() {
        if (!listing || !isPendingReview)
            return;
        if (liveEnabled()) {
            try {
                setListing(await liveReviewListing(listing.id, { status: "PUBLISHED" }));
                setError("");
                setSuccessMessage("Listing approved and published. Room status was left unchanged.");
            }
            catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The listing could not be published.");
            }
            return;
        }
        const updated = reviewMockListing(listing.id, { status: "PUBLISHED" });
        if (!updated)
            return;
        setListing(updated);
        setError("");
        setSuccessMessage("Listing approved and published. Room status was left unchanged.");
    }
    async function reject(event) {
        event.preventDefault();
        if (!listing || !isPendingReview)
            return;
        const reason = rejectionReason.trim();
        if (!reason) {
            setError("Rejection reason is required.");
            return;
        }
        if (liveEnabled()) {
            try {
                setListing(await liveReviewListing(listing.id, { status: "REJECTED", rejectionReason: reason }));
                setRejectionReason("");
                setError("");
                setSuccessMessage("Listing rejected. The Partner can edit and resubmit it.");
            }
            catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "The listing could not be rejected.");
            }
            return;
        }
        const updated = reviewMockListing(listing.id, { status: "REJECTED", rejectionReason: reason });
        if (!updated)
            return;
        setListing(updated);
        setRejectionReason("");
        setError("");
        setSuccessMessage("Listing rejected. The Partner can edit and resubmit it.");
    }
    return (<section>
      <Link href="/admin/listings" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary">
        <span aria-hidden="true">‹</span> Back to listings
      </Link>

      <div className="mt-3">
        <p className="text-sm font-semibold text-primary">Admin Review</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{listing.title}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Listing: {listing.listingStatus.replaceAll("_", " ")} · Room: {roomStatusLabel(listing.roomStatus)}
        </p>
      </div>

      {successMessage && (<p role="status" className="mt-5 rounded-xl bg-primary-tint px-4 py-3 text-sm leading-6 text-primary">
          {successMessage}
        </p>)}

      <dl className="mt-5 grid gap-4 rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary sm:grid-cols-2 md:p-6">
        <div>
          <dt className="font-medium text-ink">Listing ID</dt>
          <dd className="mt-1 break-all">{listing.id}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Partner user ID</dt>
          <dd className="mt-1 break-all">{listing.partnerUserId}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Property type</dt>
          <dd className="mt-1">{listing.propertyType}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Monthly rent</dt>
          <dd className="mt-1">฿{rentFormatter.format(listing.monthlyRent)}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Location</dt>
          <dd className="mt-1">{listing.location}</dd>
        </div>
        {listing.buildingName && (<div>
            <dt className="font-medium text-ink">Property / Building Name</dt>
            <dd className="mt-1 break-words">{listing.buildingName}</dd>
          </div>)}
        {listing.fullAddress && (<div className="sm:col-span-2">
            <dt className="font-medium text-ink">Full Address</dt>
            <dd className="mt-1 break-words leading-6">{listing.fullAddress}</dd>
          </div>)}
        <div>
          <dt className="font-medium text-ink">Submitted</dt>
          <dd className="mt-1">{formatBookingDate(listing.submittedAt ?? listing.createdAt)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-ink">Description</dt>
          <dd className="mt-1 leading-6">{listing.description}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Bedrooms</dt>
          <dd className="mt-1">{bedroomLabel(listing.bedrooms)}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Bathrooms</dt>
          <dd className="mt-1">{listing.bathrooms}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Size</dt>
          <dd className="mt-1">{listing.sizeSqm} m²</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Facilities</dt>
          <dd className="mt-1">{listing.facilities.length > 0 ? listing.facilities.join(", ") : "None listed"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-ink">Photos</dt>
          <dd className="mt-1">
            {listing.photos.length > 0 ? (<ul className="grid gap-1.5">
                {listing.photos.map((photo) => (<li key={photo.name} className="rounded-lg bg-canvas px-3 py-2">{photo.src ? <a href={publicImageUrl(photo.src)} target="_blank" rel="noopener noreferrer" className="text-primary underline">{photo.name}</a> : photo.name} ({photo.type})</li>))}
              </ul>) : ("No photos attached")}
          </dd>
        </div>
        {listing.reviewedAt && (<div>
            <dt className="font-medium text-ink">Reviewed</dt>
            <dd className="mt-1">{formatBookingDate(listing.reviewedAt)}</dd>
          </div>)}
        {listing.rejectionReason && (<div className="sm:col-span-2">
            <dt className="font-medium text-ink">Rejection reason</dt>
            <dd className="mt-1 leading-6">{listing.rejectionReason}</dd>
          </div>)}
      </dl>

      {isPendingReview && (<div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Approve Listing</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Approval publishes the listing. Room status stays unchanged.</p>
            <button type="button" onClick={approve} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
              Approve Listing
            </button>
          </div>

          <form onSubmit={reject} noValidate className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Reject Listing</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">The Partner can edit and resubmit a rejected listing.</p>
            <label className="mt-4 block text-sm font-medium">
              Rejection reason
              <textarea rows={4} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-line px-3 py-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"/>
              {error && <span className="mt-1.5 block text-xs text-alert">{error}</span>}
            </label>
            <button type="submit" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary">
              Reject Listing
            </button>
          </form>
        </div>)}
    </section>);
}
