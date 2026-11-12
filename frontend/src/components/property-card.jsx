import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { Icon } from "@/components/icon";
const rentFormatter = new Intl.NumberFormat("en-US");
export function PropertyCard({ property, preload = false, showDetailsButton = false, showMeta = false, showTags = false, }) {
    const metaTags = showMeta || showTags ? [property.propertyType, ...property.facilities.slice(0, 2)] : [];
    return (<article aria-labelledby={`${property.id}-title`} className="group flex h-full min-w-0 flex-col rounded-2xl border border-line bg-white p-3 shadow-sm shadow-ink/5 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:shadow-ink/10">
      <div className="relative">
        <Link href={`/properties/${property.id}`} aria-label={`View details for ${property.title}`} className="block rounded-lg">
          <div className={`relative overflow-hidden bg-photo transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-ink/10 ${showMeta ? "aspect-[16/10.7] rounded-[10px]" : showTags ? "aspect-[16/11] rounded-[10px]" : "aspect-[5/3] rounded-lg"}`}>
            <Image src={property.image} alt={property.imageAlt} fill preload={preload} sizes="(min-width: 1440px) 318px, (min-width: 1280px) calc((100vw - 168px) / 4), (min-width: 1024px) calc((100vw - 112px) / 3), (min-width: 768px) calc((100vw - 88px) / 2), calc(100vw - 44px)" className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"/>
          </div>
        </Link>
        <FavoriteButton propertyId={property.id} propertyTitle={property.title} returnTo={`/properties/${property.id}`}/>
      </div>
      <div className={`flex flex-1 flex-col ${showMeta ? "px-2 pt-2" : "px-1 pt-2"}`}>
        {showMeta ? (<>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-5 font-medium text-[#211648]">
                <span className="text-lg font-bold text-[#171044]">฿{rentFormatter.format(property.price)}</span>
                {" "}/ month
              </p>
              <p className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink" aria-label={`Rated ${property.owner.rating} out of 5 from ${property.owner.reviews} reviews`}>
                <span aria-hidden="true" className="text-base leading-none text-amber-400">★</span>
                {property.owner.rating.toFixed(1)} <span className="font-normal text-ink-secondary">({property.owner.reviews})</span>
              </p>
            </div>
            <h3 id={`${property.id}-title`} className="mt-0.5 line-clamp-1 text-sm leading-5 font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">
              <Link href={`/properties/${property.id}`} className="rounded-sm">
                {property.title}
              </Link>
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-secondary">
              <Icon name="location" size={14} className="shrink-0"/>
              <span className="truncate">{property.location}</span>
            </p>
            {metaTags.length > 0 && (<ul aria-label="Property highlights" className="mt-1.5 mb-3 flex flex-wrap gap-1">
                {metaTags.map((tag) => (<li key={tag} className="rounded-full bg-[#f0ebff] px-2 py-1 text-[10px] font-medium text-[#4a396d]">
                    {tag}
                  </li>))}
              </ul>)}
          </>) : (<>
            <h3 id={`${property.id}-title`} className="line-clamp-2 h-12 shrink-0 text-lg leading-6 font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">
              <Link href={`/properties/${property.id}`} className="rounded-sm">
                {property.title}
              </Link>
            </h3>
            <p className="mt-1.5 line-clamp-2 h-10 shrink-0 text-sm leading-5 text-ink-secondary [overflow-wrap:anywhere]">{property.location}</p>
            <p className="mt-1.5 text-sm text-ink-secondary">
              <span className="text-xl font-semibold text-ink">฿{rentFormatter.format(property.price)}</span>
              {" "}/ month
            </p>
            <ul aria-label="Room details" className="mt-2.5 flex flex-wrap gap-4 text-sm text-ink-secondary">
              <li className="flex items-center gap-1.5">
                <Icon name="bed" size={17}/>
                <span>{property.bedrooms === 0 ? "Studio" : property.bedrooms}{property.bedrooms !== 0 && <span className="sr-only"> bedroom</span>}</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Icon name="bath" size={17}/>
                <span>{property.bathrooms}<span className="sr-only"> bathroom</span></span>
              </li>
              <li className="flex items-center gap-1.5">
                <Icon name="area" size={17}/>
                <span>{property.size} m²</span>
              </li>
            </ul>
            {showTags && metaTags.length > 0 && (<ul aria-label="Property highlights" className="mt-2.5 mb-3 flex flex-wrap gap-1.5">
                {metaTags.map((tag) => (<li key={tag} className="rounded-full bg-[#f0ebff] px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {tag}
                  </li>))}
              </ul>)}
          </>)}
        {showDetailsButton && (<Link href={`/properties/${property.id}`} className={`inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white btn-primary ${showMeta ? "mt-auto bg-indigo-deep" : "mt-3 bg-primary"}`}>
            View details <span aria-hidden="true">→</span>
          </Link>)}
      </div>
    </article>);
}
