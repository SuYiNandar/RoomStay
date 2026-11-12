"use client";
import { useState } from "react";
import { PropertyImage } from "@/components/property-image";
export function PropertyGallery({ images, title }) {
    const [active, setActive] = useState(0);
    const current = images[active] ?? images[0] ?? {};
    const hasMultipleImages = images.length > 1;
    function showPrevious() {
        setActive((currentIndex) => (currentIndex === 0 ? images.length - 1 : currentIndex - 1));
    }
    function showNext() {
        setActive((currentIndex) => (currentIndex === images.length - 1 ? 0 : currentIndex + 1));
    }
    return (<div className="min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-photo md:aspect-[16/8] lg:aspect-[16/7]">
        <PropertyImage src={current.src} alt={current.alt} fill preload sizes="(min-width: 1440px) 1344px, (min-width: 1280px) calc(100vw - 96px), (min-width: 768px) calc(100vw - 64px), calc(100vw - 44px)" className="object-cover"/>
        {hasMultipleImages && (<>
            <button type="button" onClick={showPrevious} aria-label={`Show previous photo of ${title}`} className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-2xl leading-none font-medium text-ink shadow-sm ring-1 ring-black/5 hover:bg-white md:left-4 md:size-11">
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" onClick={showNext} aria-label={`Show next photo of ${title}`} className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-2xl leading-none font-medium text-ink shadow-sm ring-1 ring-black/5 hover:bg-white md:right-4 md:size-11">
              <span aria-hidden="true">›</span>
            </button>
          </>)}
        <span className="absolute right-3 bottom-3 rounded-full bg-ink/70 px-3 py-1 text-xs font-medium text-white">
          {images.length ? active + 1 : 0} / {images.length}
        </span>
      </div>
      {hasMultipleImages && (<div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
          {images.map((image, index) => (<button key={image.src + index} type="button" onClick={() => setActive(index)} aria-label={`Show photo ${index + 1} of ${title}`} aria-pressed={index === active} className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-photo ${index === active ? "ring-2 ring-primary ring-offset-2" : "opacity-80 hover:opacity-100"}`}>
              <PropertyImage src={image.src} alt="" fill sizes="(min-width: 1024px) 300px, (min-width: 768px) calc((100vw - 88px) / 3), calc((100vw - 68px) / 3)" className="object-cover"/>
            </button>))}
        </div>)}
    </div>);
}
