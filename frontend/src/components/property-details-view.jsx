import { FavoriteButton } from "@/components/favorite-button";
import { Icon } from "@/components/icon";
import { PropertyActions } from "@/components/property-actions";
import { PropertyAvailabilityBadge } from "@/components/property-availability-badge";
import { PropertyGallery } from "@/components/property-gallery";
import { PropertyReviews } from "@/components/property-reviews";
import { PropertySectionNav } from "@/components/property-section-nav";
import { SimilarProperties } from "@/components/similar-properties";
import { bedroomLabel } from "@/lib/property-format";
const rentFormatter = new Intl.NumberFormat("en-US");
const sectionLinks = [
    { id: "overview", label: "Overview" },
    { id: "description", label: "Description" },
    { id: "facilities", label: "Facilities" },
    { id: "house-rules", label: "House Rules" },
    { id: "partner", label: "Partner" },
    { id: "reviews", label: "Reviews" },
    { id: "how-to-book", label: "How to Book" },
];
const suitableForLabels = {
    STUDENTS: "students",
    PROFESSIONALS: "professionals",
    FAMILIES: "families",
};
function guestsPolicyLabel(policy) {
    if (policy === "ALLOWED")
        return "Guests allowed";
    if (policy === "LIMITED")
        return "Guests limited";
    return "Guests not allowed";
}
function formatTime(value) {
    const [hourValue, minuteValue] = value.split(":").map(Number);
    if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue))
        return value;
    const date = new Date();
    date.setHours(hourValue, minuteValue, 0, 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}
function buildHouseRuleLabels(rules) {
    const labels = [
        rules.smokingAllowed ? "Smoking allowed" : "No smoking",
        rules.petsAllowed ? "Pets allowed" : "No pets",
        guestsPolicyLabel(rules.guestsPolicy),
    ];
    if (rules.quietHoursStart && rules.quietHoursEnd) {
        labels.push(`Quiet hours: ${formatTime(rules.quietHoursStart)} – ${formatTime(rules.quietHoursEnd)}`);
    }
    for (const option of rules.suitableFor ?? []) {
        labels.push(`Suitable for ${suitableForLabels[option]}`);
    }
    return labels;
}
function SectionBlock({ id, title, children }) {
    return (<section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28 rounded-2xl border border-[#e6e1f2] bg-white p-5 shadow-sm shadow-[#20104a08] md:p-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-[-0.025em] text-ink">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>);
}
function InfoCard({ icon, label, value }) {
    return (<div className="rounded-xl border border-[#e6e1f2] bg-[#fbfaff] px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-ink-secondary">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>);
}
function HouseRulesContent({ rules }) {
    if (!rules) {
        return (<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-5 text-center">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary"><Icon name="home" size={22}/></span>
        <div>
          <p className="text-sm font-semibold text-ink">No house rules yet</p>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">The partner has not added house rules for this property.</p>
        </div>
      </div>);
    }
    const labels = buildHouseRuleLabels(rules);
    return (<>
      <ul className="flex flex-wrap gap-2">
        {labels.map((label) => (<li key={label} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-secondary">
            {label}
          </li>))}
      </ul>
      {rules.additionalRules && (<p className="mt-3 rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm leading-6 text-ink-secondary">
          {rules.additionalRules}
        </p>)}
    </>);
}
function PartnerSummary({ property }) {
    return (<div className="flex items-center gap-4 rounded-xl border border-line bg-canvas/40 p-4">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
        {property.owner.initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{property.owner.name}</p>
        <p className="mt-1 text-sm text-ink-secondary">
          Member since {property.owner.memberSince} · <span aria-hidden="true" className="text-primary">★</span> {property.owner.rating.toFixed(1)} ({property.owner.reviews} reviews)
        </p>
      </div>
    </div>);
}
function HowToBook() {
    const steps = [
        "Request Viewing if you want to visit first, or submit a Booking Request directly.",
        "The Partner reviews your booking request.",
        "If approved, the room becomes Reserved and deposit instructions are shown.",
        "Pay externally and upload payment evidence in RoomStay.",
        "The Partner verifies the payment evidence.",
        "The booking becomes Confirmed.",
        "The rental starts later when the Partner marks move-in as started.",
    ];
    return (<ol className="grid gap-3">
      {steps.map((step, index) => (<li key={step} className="flex gap-3 rounded-xl border border-line bg-canvas/40 p-4 text-sm leading-6 text-ink-secondary">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span>{step}</span>
        </li>))}
    </ol>);
}
// Shared renter-facing property details content, used for both static
// properties and published Partner listings.
export function PropertyDetailsView({ property }) {
    const monthlyRent = `฿${rentFormatter.format(property.price)}`;
    return (<>
      <div className="mt-3">
        <PropertyGallery images={property.images} title={property.title}/>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm shadow-ink/5 md:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">RoomStay property</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] md:text-3xl">{property.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-secondary">
            <Icon name="location" size={16}/> {property.location}
          </p>
          {property.buildingName && <p className="mt-3 break-words text-sm font-medium text-ink">{property.buildingName}</p>}
          {property.fullAddress && <p className="mt-1 break-words text-sm leading-6 text-ink-secondary">{property.fullAddress}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <FavoriteButton propertyId={property.id} propertyTitle={property.title} returnTo={`/properties/${property.id}`} variant="inline"/>
          <PropertyAvailabilityBadge propertyId={property.id} availableNow={property.availableNow}/>
        </div>
      </div>

      <PropertySectionNav sections={sectionLinks}/>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid min-w-0 gap-6">
          <SectionBlock id="overview" title="Overview">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard label="Monthly rent" value={`${monthlyRent} / month`}/>
              <InfoCard label="Property type" value={property.propertyType}/>
              <InfoCard icon={<Icon name="bed" size={15}/>} label="Bedrooms" value={bedroomLabel(property.bedrooms)}/>
              <InfoCard icon={<Icon name="bath" size={15}/>} label="Bathrooms" value={`${property.bathrooms} Bath${property.bathrooms === 1 ? "" : "s"}`}/>
              <InfoCard icon={<Icon name="area" size={15}/>} label="Size" value={`${property.size} m²`}/>
            </div>
          </SectionBlock>

          <SectionBlock id="description" title="Description">
            <p className="text-sm leading-7 text-ink-secondary">{property.description}</p>
          </SectionBlock>

          <SectionBlock id="facilities" title="Facilities">
            <ul className="flex flex-wrap gap-2">
              {property.facilities.map((facility) => (<li key={facility} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-200 hover:border-primary/40 hover:text-primary">
                  {facility}
                </li>))}
            </ul>
          </SectionBlock>

          <SectionBlock id="house-rules" title="House Rules">
            <HouseRulesContent rules={property.houseRules}/>
          </SectionBlock>

          <SectionBlock id="partner" title="Partner">
            <PartnerSummary property={property}/>
          </SectionBlock>

          <SectionBlock id="reviews" title="Reviews">
            <PropertyReviews propertyId={property.id} showEmptyState/>
          </SectionBlock>

          <SectionBlock id="how-to-book" title="How to Book">
            <HowToBook />
          </SectionBlock>
        </div>

        <PropertyActions propertyId={property.id} propertyTitle={property.title} monthlyRent={monthlyRent} availableNow={property.availableNow} partnerUserId={property.partnerUserId}/>
      </div>

      <SimilarProperties currentProperty={property}/>
    </>);
}
