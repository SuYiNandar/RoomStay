import Image from "next/image";
import styles from "@/components/home-layout.module.css";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { SiteHeader } from "@/components/site-header";
import { HomeListings } from "@/components/home-listings";
import { HomePartnerCta } from "@/components/home-partner-cta";
import { homeLocation } from "@/mocks/home";
const categories = [
    { label: "Apartments", icon: "apartment", href: "/search?type=Apartment" },
    { label: "Condos", icon: "condo", href: "/search?type=Condo" },
    { label: "Houses", icon: "homeFilled", href: "/search?type=House" },
    { label: "Dormitories", icon: "room", href: "/search?type=Dormitory" },
    { label: "Pet friendly", icon: "heart", href: "/search?petFriendly=true" },
    { label: "Near University", icon: "apartment", href: "/search?nearUniversity=true" },
    { label: "Near BTS/MRT", icon: "location", href: "/search?nearTransit=true" },
];
// Only link chips that the existing title/location/type keyword search supports.
const popularSearches = [
    { label: "Chulalongkorn University" },
    { label: "Sukhumvit", href: "/search?q=Sukhumvit" },
    { label: "Near BTS", href: "/search?q=Near%20BTS" },
    { label: "Pet friendly" },
];
const steps = [
    { title: "Find a room", text: "Search by location, university, or keyword.", icon: "search" },
    { title: "Send a request", text: "A viewing is optional. The room stays open until the partner approves.", icon: "room" },
    { title: "Upload the slip", text: "After approval, pay the deposit at your bank and upload the photo.", icon: "bell" },
    { title: "Move in", text: "The partner checks the slip, confirms the booking, then starts the rental.", icon: "home" },
];
export default function HomePage() {
    return (<div className="min-h-dvh w-full bg-transparent">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-white p-3 text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <SiteHeader activePage="Home"/>

      <main id="main-content" className="pb-[calc(96px+env(safe-area-inset-bottom))]">
        <section aria-labelledby="home-heading" className={styles.hero}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>A PLACE FOR WHAT&apos;S NEXT</p>
            <h1 id="home-heading" className={styles.headline}>
              Find your next home,{" "}
              <span>simply.</span>
            </h1>
            <p className={styles.description}>
              Search condos, apartments, houses, and dormitories, then request a viewing with RoomStay.
            </p>

            <form action="/search" role="search" className={styles.searchBar}>
              <div className="flex h-[46px] min-w-0 items-center gap-2.5 rounded-xl px-3 text-ink-secondary transition-colors focus-within:ring-2 focus-within:ring-primary">
                <span aria-hidden="true" className="flex shrink-0 items-center justify-center"><Icon name="search" size={18}/></span>
                <label htmlFor="search" className="sr-only">Search by location, university, or keyword</label>
                <input id="search" type="search" name="q" placeholder="Search by location, university, or keyword" className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-secondary focus-visible:outline-none"/>
              </div>

              <div className="relative h-[46px] min-w-0 rounded-xl md:border-l md:border-line">
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-primary">
                  <Icon name="location" size={20}/>
                </span>
                <label htmlFor="location" className="sr-only">Location</label>
                <select id="location" name="location" defaultValue={homeLocation.label} className="relative h-full w-full min-w-0 appearance-none rounded-xl bg-transparent pr-7 pl-10 text-sm font-medium text-ink">
                  <option value={homeLocation.label}>{homeLocation.label}</option>
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-ink-secondary">
                  <Icon name="chevronDown" size={18}/>
                </span>
              </div>

              <button type="submit" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#f36c79] px-4 text-sm font-semibold text-white shadow-md shadow-accent/30 transition-all duration-200 hover:-translate-y-px hover:brightness-[1.05] active:translate-y-0">
                <Icon name="search" size={18}/> Search
              </button>
            </form>

            <div className={styles.popularSearches}>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Icon name="search" size={13}/> Popular searches:
              </span>
              {popularSearches.map((chip) => chip.href ? (<Link key={chip.label} href={chip.href} className={styles.chip}>{chip.label}</Link>) : (<span key={chip.label} aria-disabled="true" title="This search is not supported yet" className={styles.chip}>{chip.label}</span>))}
            </div>
          </div>

          <div className={styles.heroImage}>
            <Image src="/images/search/spacious-apartment.jpg" alt="Bright premium living room with large windows and lounge seating" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover"/>
            <div aria-hidden="true" className={styles.imageBlend}/>
            <div className={styles.imageNote}>
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name="heart" size={18}/>
              </span>
              <span className="min-w-0 text-[13px] leading-5 font-semibold text-ink">
                Find a space<br />that feels like you
              </span>
            </div>
          </div>
        </section>

        <div className={styles.content}>
          <section aria-labelledby="categories-heading">
            <h2 id="categories-heading" className="text-base font-bold tracking-tight text-[#171044]">Popular categories</h2>
            <div aria-label="Property categories" className={styles.categories}>
              {categories.map(({ label, icon, href }) => href ? (<Link key={label} href={href} className={styles.category}>
                  <Icon name={icon} size={19} className="text-primary"/>{label}
                </Link>) : (<span key={label} aria-disabled="true" title="This filter is not supported yet" className={styles.category}>
                  <Icon name={icon} size={19} className="text-primary"/>{label}
                </span>))}
            </div>
          </section>

          <section aria-labelledby="recently-added-heading" className={styles.featured}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="recently-added-heading" className="text-2xl font-bold tracking-[-0.035em] text-[#171044]">Recently added</h2>
                <p className="mt-1 text-sm text-ink-secondary">New listings available on RoomStay</p>
              </div>
              <Link href="/search" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline">
                View all listings <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HomeListings />
            </div>
          </section>

        <HomePartnerCta />

          <section aria-labelledby="how-roomstay-works-heading" className="mt-8 rounded-3xl border border-line bg-white/80 p-5 shadow-sm shadow-ink/5 md:p-7">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">How RoomStay Works</p>
              <h2 id="how-roomstay-works-heading" className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink md:text-3xl">
                From search to move-in
              </h2>
            </div>
          <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => (<article key={step.title} className="flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-sm shadow-ink/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">{index + 1}</span>
                  <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-primary-tint text-primary">
                    <Icon name={step.icon} size={19}/>
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold tracking-[-0.015em] text-ink">{step.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">{step.text}</p>
              </article>))}
          </div>
          </section>
        </div>
      </main>
    </div>);
}
