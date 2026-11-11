"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBookingDate } from "@/lib/format-date";
import { useMockAuth } from "@/lib/mock-auth";
import { roomStatusLabel } from "@/lib/mock-bookings";
import { isMockListingEditable, listingStatusLabel, listingStatusTone, mockListingsChangedEvent, readMockListingsForPartner, } from "@/lib/mock-listings";
const rentFormatter = new Intl.NumberFormat("en-US");
export function PartnerListingsList() {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [listings, setListings] = useState(null);
    useEffect(() => {
        if (!isReady)
            return undefined;
        if (!user) {
            router.replace(`/login?returnTo=${encodeURIComponent("/partner/listings")}`);
            return undefined;
        }
        const currentUser = user;
        function loadListings() {
            setListings(readMockListingsForPartner(currentUser.id));
        }
        const timeout = window.setTimeout(loadListings, 0);
        window.addEventListener(mockListingsChangedEvent, loadListings);
        return () => {
            window.clearTimeout(timeout);
            window.removeEventListener(mockListingsChangedEvent, loadListings);
        };
    }, [isReady, router, user]);
    if (!isReady || listings === null) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading listings...
      </div>);
    }
    if (!user) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Redirecting to login...
      </div>);
    }
    if (!user.isPartner) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <p className="text-sm font-semibold text-primary">Partner access required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Listings are for approved Partners</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          Only users with approved Partner capability can create property listings. Apply to become a Partner first.
        </p>
        <Link href="/become-a-partner" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Become a Partner
        </Link>
      </section>);
    }
    return (<section>
      <div className="rounded-3xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-7">
        <p className="text-sm font-semibold text-primary">Partner Portal</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink">My Listings</h1>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">Only the rooms you own. Other partners cannot manage them.</p>
          </div>
          <Link href="/partner/listings/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
            Create Listing
          </Link>
        </div>
      </div>

      {listings.length === 0 ? (<div className="mt-5 rounded-2xl border border-line bg-white px-5 py-14 text-center shadow-sm shadow-ink/5">
          <h2 className="text-lg font-semibold tracking-[-0.025em]">No listings yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
            Create your first property listing and submit it for Admin review.
          </p>
          <Link href="/partner/listings/new" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
            Create Listing
          </Link>
        </div>) : (<ul className="mt-5 grid gap-4">
          {listings.map((listing) => (<li key={listing.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm shadow-ink/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-[-0.025em]">{listing.title.trim() || "Untitled draft"}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${listingStatusTone(listing.listingStatus)}`}>
                      {listingStatusLabel(listing.listingStatus)}
                    </span>
                    <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-secondary ring-1 ring-inset ring-line">
                      Room: {roomStatusLabel(listing.roomStatus)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-secondary">{[listing.location, listing.propertyType].filter(Boolean).join(" · ") || "Details not set"}</p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {listing.monthlyRent > 0 ? (<><span className="font-medium text-ink">฿{rentFormatter.format(listing.monthlyRent)}</span> / month</>) : "Rent not set"} · {listing.photos.length} photo{listing.photos.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-ink-secondary">Created {formatBookingDate(listing.createdAt)}</p>
                  {listing.listingStatus === "REJECTED" && listing.rejectionReason && (<p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-ink-secondary">
                      <span className="font-semibold text-alert">Rejection reason:</span> {listing.rejectionReason}
                    </p>)}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {listing.listingStatus === "PUBLISHED" && (<Link href={`/properties/${listing.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink btn-secondary">
                      View
                    </Link>)}
                  {isMockListingEditable(listing) && (<Link href={`/partner/listings/new?edit=${encodeURIComponent(listing.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white btn-primary">
                      Edit
                    </Link>)}
                </div>
              </div>
            </li>))}
        </ul>)}
    </section>);
}
