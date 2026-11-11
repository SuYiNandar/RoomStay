"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { api } from "@/lib/api";
import { mockReviewsChangedEvent } from "@/lib/mock-bookings";
function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
export function PropertyReviews({ propertyId, showEmptyState = false }) {
    const [reviews, setReviews] = useState([]);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        async function loadReviews() {
            try {
                const data = await api(`/api/properties/${propertyId}`);
                if (active) { setReviews(data.property.reviews || []); setError(""); }
            } catch { if (active) setError("Reviews could not be loaded. Please try again."); }
        }
        void loadReviews();
        const interval = window.setInterval(loadReviews, 15000);
        window.addEventListener(mockReviewsChangedEvent, loadReviews);
        window.addEventListener("focus", loadReviews);
        return () => { active = false; window.clearInterval(interval); window.removeEventListener(mockReviewsChangedEvent, loadReviews); window.removeEventListener("focus", loadReviews); };
    }, [propertyId]);
    if (error) return <p role="status" className="text-sm text-ink-secondary">{error}</p>;
    if (reviews.length === 0) {
        if (!showEmptyState)
            return null;
        return (<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-5 text-center">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary"><Icon name="star" size={22}/></span>
        <div>
          <p className="text-sm font-semibold text-ink">No reviews yet</p>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">Be the first to share your experience.</p>
        </div>
      </div>);
    }
    return (<div className="grid gap-3">
        {reviews.map((review) => (<article key={review.id} className="rounded-xl border border-line bg-white p-4 text-sm text-ink-secondary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{review.renterName}</p>
              <p className="text-primary" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
            </div>
            <p className="mt-2 leading-6">{review.comment}</p>
            <p className="mt-2 text-xs">Reviewed on {formatDate(review.createdAt)}</p>
          </article>))}
    </div>);
}
