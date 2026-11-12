"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PropertyImage } from "@/components/property-image";
import { ApiError, publicImageUrl } from "@/lib/api";
import { liveSaveListing, liveSubmitListing } from "@/lib/live-actions";
import { liveEnabled } from "@/lib/live-store";
import { useMockAuth } from "@/lib/mock-auth";
import { formatPropertyLocation } from "@/lib/property-location";
import { createMockListingId, findMockListingById, isMockListingEditable, saveMockListing, updateMockListing, } from "@/lib/mock-listings";
import { facilities, propertyTypes, suitableForOptions } from "@/types/property";
const allowedPhotoExtensions = [".jpg", ".jpeg", ".png"];
const maxPhotos = 8;
const maxPhotoBytes = 8 * 1024 * 1024;
const validationFieldOrder = [
    "title",
    "propertyType",
    "monthlyRent",
    "buildingName",
    "fullAddress",
    "area",
    "province",
    "description",
    "bedrooms",
    "bathrooms",
    "size",
    "quietHours",
    "additionalRules",
    "photos",
];
const validationFieldIds = {
    title: "listing-title",
    propertyType: "listing-property-type",
    monthlyRent: "listing-rent",
    buildingName: "listing-building-name",
    fullAddress: "listing-full-address",
    area: "listing-area",
    province: "listing-province",
    description: "listing-description",
    bedrooms: "listing-bedrooms",
    bathrooms: "listing-bathrooms",
    size: "listing-size",
    quietHours: "listing-quiet-start",
    additionalRules: "listing-additional-rules",
    photos: "listing-photos",
};
const suitableForLabels = {
    STUDENTS: "Students",
    PROFESSIONALS: "Professionals",
    FAMILIES: "Families",
};
function isAllowedPhotoFile(file) {
    return allowedPhotoExtensions.some((extension) => file.name.toLowerCase().endsWith(extension));
}
export function PartnerListingForm({ listingId }) {
    const router = useRouter();
    const { user, isReady } = useMockAuth();
    const [existing, setExisting] = useState(undefined);
    const [title, setTitle] = useState("");
    const [propertyType, setPropertyType] = useState("");
    const [monthlyRent, setMonthlyRent] = useState("");
    const [buildingName, setBuildingName] = useState("");
    const [fullAddress, setFullAddress] = useState("");
    const [area, setArea] = useState("");
    const [province, setProvince] = useState("");
    const [description, setDescription] = useState("");
    const [bedrooms, setBedrooms] = useState("");
    const [bathrooms, setBathrooms] = useState("");
    const [size, setSize] = useState("");
    const [selectedFacilities, setSelectedFacilities] = useState([]);
    const [smokingAllowed, setSmokingAllowed] = useState(false);
    const [petsAllowed, setPetsAllowed] = useState(false);
    const [guestsPolicy, setGuestsPolicy] = useState("ALLOWED");
    const [quietHoursStart, setQuietHoursStart] = useState("");
    const [quietHoursEnd, setQuietHoursEnd] = useState("");
    const [suitableFor, setSuitableFor] = useState([]);
    const [additionalRules, setAdditionalRules] = useState("");
    const [keptPhotos, setKeptPhotos] = useState([]);
    const [newPhotos, setNewPhotos] = useState([]);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [pendingAction, setPendingAction] = useState(null);
    const [draftId, setDraftId] = useState(null);
    const pending = useRef(false);
    const isEditMode = Boolean(listingId);
    const buildingNameRequired = ["Condo", "Apartment", "Dormitory"].includes(propertyType);
    useEffect(() => {
        if (!isReady)
            return undefined;
        if (!user) {
            const returnTo = listingId
                ? `/partner/listings/new?edit=${encodeURIComponent(listingId)}`
                : "/partner/listings/new";
            router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
            return undefined;
        }
        const currentUser = user;
        const editId = listingId;
        function loadListing() {
            if (!editId) {
                setExisting(null);
                return;
            }
            const found = findMockListingById(editId);
            if (!found || found.partnerUserId !== currentUser.id || !isMockListingEditable(found)) {
                setExisting(null);
                return;
            }
            setExisting(found);
            setTitle(found.title);
            setPropertyType(found.propertyType);
            setMonthlyRent(String(found.monthlyRent));
            setBuildingName(found.buildingName ?? "");
            setFullAddress(found.fullAddress ?? found.location);
            setArea(found.area ?? "");
            setProvince(found.province ?? "");
            setDescription(found.description);
            setBedrooms(String(found.bedrooms));
            setBathrooms(String(found.bathrooms));
            setSize(String(found.sizeSqm));
            setSelectedFacilities(found.facilities);
            setSmokingAllowed(found.houseRules?.smokingAllowed ?? false);
            setPetsAllowed(found.houseRules?.petsAllowed ?? false);
            setGuestsPolicy(found.houseRules?.guestsPolicy ?? "ALLOWED");
            setQuietHoursStart(found.houseRules?.quietHoursStart ?? "");
            setQuietHoursEnd(found.houseRules?.quietHoursEnd ?? "");
            setSuitableFor(found.houseRules?.suitableFor ?? []);
            setAdditionalRules(found.houseRules?.additionalRules ?? "");
            setKeptPhotos(found.photos);
        }
        const timeout = window.setTimeout(loadListing, 0);
        return () => window.clearTimeout(timeout);
    }, [isReady, listingId, router, user]);
    if (!isReady || (isEditMode && existing === undefined)) {
        return (<div className="rounded-xl border border-line bg-white p-5 text-sm text-ink-secondary">
        Loading listing form...
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
          Only users with approved Partner capability can create property listings.
        </p>
        <Link href="/become-a-partner" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Become a Partner
        </Link>
      </section>);
    }
    if (isEditMode && !existing) {
        return (<section className="rounded-xl border border-line bg-white px-5 py-14 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Listing cannot be edited</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          Only draft, rejected, or published listings belonging to your account can be edited. Pending and suspended listings cannot be edited.
        </p>
        <Link href="/partner/listings" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary">
          Back to My Listings
        </Link>
      </section>);
    }
    function toggleFacility(facility, checked) {
        setSelectedFacilities((current) => checked ? [...current, facility] : current.filter((item) => item !== facility));
    }
    function handlePhotoChange(event) {
        setNewPhotos(event.target.files ? Array.from(event.target.files) : []);
    }
    function toggleSuitableFor(value, checked) {
        setSuitableFor((current) => checked ? [...current, value] : current.filter((item) => item !== value));
    }
    function buildHouseRules() {
        return {
            smokingAllowed,
            petsAllowed,
            guestsPolicy,
            quietHoursStart: quietHoursStart || undefined,
            quietHoursEnd: quietHoursEnd || undefined,
            suitableFor: suitableFor.length > 0 ? suitableFor : undefined,
            additionalRules: additionalRules.trim() || undefined,
        };
    }
    function focusFirstError(nextErrors) {
        const key = validationFieldOrder.find((field) => nextErrors[field]);
        if (!key || typeof document === "undefined")
            return;
        const element = document.getElementById(validationFieldIds[key]);
        if (!element)
            return;
        const reveal = () => {
            element.scrollIntoView?.({ behavior: "smooth", block: "center" });
            element.focus?.();
        };
        if (typeof window === "undefined")
            reveal();
        else
            window.setTimeout(reveal, 0);
    }
    function validate(requireComplete) {
        const nextErrors = {};
        if (requireComplete && !title.trim())
            nextErrors.title = "Property title is required.";
        if (propertyType && !propertyTypes.includes(propertyType))
            nextErrors.propertyType = "Select a valid property type.";
        else if (requireComplete && !propertyType)
            nextErrors.propertyType = "Property type is required.";
        const rentText = monthlyRent.trim();
        if (rentText) {
            const rent = Number(rentText);
            if (!Number.isFinite(rent))
                nextErrors.monthlyRent = "Enter a valid monthly rent.";
            else if (!Number.isInteger(rent))
                nextErrors.monthlyRent = "Enter the monthly rent in whole baht.";
            else if (rent < 4000)
                nextErrors.monthlyRent = "Monthly rent must be at least ฿4,000.";
        }
        else if (requireComplete) {
            nextErrors.monthlyRent = "Monthly rent is required.";
        }
        if (requireComplete && buildingNameRequired && !buildingName.trim())
            nextErrors.buildingName = "Property / Building Name is required for condos, apartments, and dormitories.";
        if (requireComplete && !fullAddress.trim())
            nextErrors.fullAddress = "Full address is required.";
        if (requireComplete && !area.trim())
            nextErrors.area = "Area / Neighborhood is required.";
        if (requireComplete && !province.trim())
            nextErrors.province = "Province / City is required.";
        if (requireComplete && !description.trim())
            nextErrors.description = "Description is required.";
        const bedroomText = bedrooms.trim();
        if (bedroomText) {
            const bedroomCount = Number(bedroomText);
            if (!Number.isInteger(bedroomCount) || bedroomCount < 0)
                nextErrors.bedrooms = "Bedrooms must be 0 or more.";
        }
        else if (requireComplete) {
            nextErrors.bedrooms = "Bedrooms is required.";
        }
        const bathroomText = bathrooms.trim();
        if (bathroomText) {
            const bathroomCount = Number(bathroomText);
            if (!Number.isInteger(bathroomCount) || bathroomCount <= 0)
                nextErrors.bathrooms = "Bathrooms must be greater than 0.";
        }
        else if (requireComplete) {
            nextErrors.bathrooms = "Bathrooms is required.";
        }
        const sizeText = size.trim();
        if (sizeText) {
            const sizeValue = Number(sizeText);
            if (!Number.isInteger(sizeValue) || sizeValue <= 0)
                nextErrors.size = "Size must be a whole number greater than 0.";
        }
        else if (requireComplete) {
            nextErrors.size = "Size is required.";
        }
        if ((quietHoursStart && !quietHoursEnd) || (!quietHoursStart && quietHoursEnd))
            nextErrors.quietHours = "Provide both quiet hours start and end, or leave both empty.";
        if (additionalRules.length > 500)
            nextErrors.additionalRules = "Additional rules must be 500 characters or less.";
        const invalidPhoto = newPhotos.find((file) => !isAllowedPhotoFile(file));
        const oversizedPhoto = newPhotos.find((file) => Number.isFinite(file.size) && file.size > maxPhotoBytes);
        if (invalidPhoto)
            nextErrors.photos = "Photos must be JPG, JPEG, or PNG images.";
        else if (oversizedPhoto)
            nextErrors.photos = "Each photo must be 8 MB or smaller.";
        else if (keptPhotos.length + newPhotos.length > maxPhotos)
            nextErrors.photos = "Upload at most 8 photos.";
        else if (requireComplete && keptPhotos.length + newPhotos.length === 0)
            nextErrors.photos = "At least one photo is required.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0)
            focusFirstError(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }
    async function persist(listingStatus) {
        if (!user || pending.current)
            return;
        setFormError("");
        const requiresReview = listingStatus === "PENDING_REVIEW";
        if (!validate(requiresReview))
            return;
        pending.current = true;
        setPendingAction(requiresReview ? "review" : "draft");
        const now = new Date().toISOString();
        const photos = [
            ...keptPhotos,
            ...newPhotos.map((file) => ({ name: file.name, type: file.type || "image" })),
        ];
        const houseRules = buildHouseRules();
        const identity = {
            buildingName: buildingName.trim() || undefined,
            fullAddress: fullAddress.trim(),
            area: area.trim(),
            province: province.trim(),
            location: formatPropertyLocation({ area, province, location: fullAddress.trim() }),
        };
        const savedId = draftId ?? existing?.id;
        try {
            if (liveEnabled()) {
                const saved = await liveSaveListing({
                    ...(savedId ? { id: savedId } : {}),
                    title: title.trim(),
                    propertyType,
                    monthlyRent: Number(monthlyRent),
                    ...identity,
                    description: description.trim(),
                    bedrooms: Number(bedrooms),
                    bathrooms: Number(bathrooms),
                    sizeSqm: Number(size),
                    facilities: selectedFacilities,
                    keptPhotos,
                    files: newPhotos,
                    houseRules,
                });
                if (!saved?.id)
                    throw new Error("The listing was not saved.");
                setDraftId(saved.id);
                setKeptPhotos(saved.photos);
                setNewPhotos([]);
                if (requiresReview)
                    await liveSubmitListing(saved.id);
            }
            else if (existing) {
                updateMockListing({
                    ...existing,
                    title: title.trim(),
                    propertyType,
                    monthlyRent: Number(monthlyRent),
                    ...identity,
                    description: description.trim(),
                    bedrooms: Number(bedrooms),
                    bathrooms: Number(bathrooms),
                    sizeSqm: Number(size),
                    facilities: selectedFacilities,
                    photos,
                    houseRules,
                    listingStatus,
                    updatedAt: now,
                    submittedAt: listingStatus === "PENDING_REVIEW" ? now : undefined,
                    reviewedAt: undefined,
                    // The previous rejection reason described older content.
                    rejectionReason: undefined,
                });
            }
            else {
                saveMockListing({
                    id: createMockListingId(),
                    partnerUserId: user.id,
                    title: title.trim(),
                    propertyType,
                    monthlyRent: Number(monthlyRent),
                    ...identity,
                    description: description.trim(),
                    bedrooms: Number(bedrooms),
                    bathrooms: Number(bathrooms),
                    sizeSqm: Number(size),
                    facilities: selectedFacilities,
                    photos,
                    houseRules,
                    listingStatus,
                    roomStatus: "AVAILABLE",
                    createdAt: now,
                    updatedAt: now,
                    submittedAt: listingStatus === "PENDING_REVIEW" ? now : undefined,
                });
            }
            router.push("/partner/listings");
        }
        catch (error) {
            setFormError(error instanceof ApiError
                ? error.message
                : requiresReview
                    ? "The listing could not be submitted for review."
                    : "The listing could not be saved as a draft.");
        }
        finally {
            pending.current = false;
            setPendingAction(null);
        }
    }
    function submitDraft(event) {
        event.preventDefault();
        return persist("DRAFT");
    }
    function submitForReview() {
        return persist("PENDING_REVIEW");
    }
    const inputClass = "mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-secondary focus:border-primary focus:ring-2 focus:ring-primary/15";
    return (<section className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">{existing ? "Edit Listing" : "Create Listing"}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          {existing
            ? "Save changes as a non-public draft, or submit them for Admin review. Editing a published listing takes it offline until approved again."
            : "Add your property details below. Save as a draft or submit it for Admin review."}
        </p>
      </div>

      <form onSubmit={submitDraft} noValidate aria-busy={Boolean(pendingAction)} className="rounded-xl border border-line bg-white p-5 md:p-7">
        <div className="grid gap-5">
          <label className="block text-sm font-medium text-ink">
            Property title
            <input id="listing-title" type="text" value={title} onChange={(event) => setTitle(event.target.value)} required aria-invalid={Boolean(errors.title)} placeholder="Cozy Condo Near BTS" className={inputClass}/>
            {errors.title && <span className="mt-1.5 block text-xs text-alert">{errors.title}</span>}
          </label>

          <label className="block text-sm font-medium text-ink">
            Property type
            <select id="listing-property-type" value={propertyType} onChange={(event) => setPropertyType(event.target.value)} required aria-invalid={Boolean(errors.propertyType)} className={inputClass}>
              <option value="">Select a type</option>
              {propertyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {errors.propertyType && <span className="mt-1.5 block text-xs text-alert">{errors.propertyType}</span>}
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Monthly rent (฿)
              <input id="listing-rent" type="text" inputMode="decimal" value={monthlyRent} onChange={(event) => {
            const value = event.target.value.replace(/,/g, "");
            if (/^\d*\.?\d*$/.test(value))
                setMonthlyRent(value);
        }} required placeholder="Enter monthly rent, e.g. 8,500" aria-invalid={Boolean(errors.monthlyRent)} aria-describedby={errors.monthlyRent ? "monthly-rent-error" : undefined} className={inputClass}/>
              {errors.monthlyRent && <span id="monthly-rent-error" className="mt-1.5 block text-xs text-alert">{errors.monthlyRent}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Property / Building Name
              <input id="listing-building-name" type="text" value={buildingName} onChange={(event) => setBuildingName(event.target.value)} required={buildingNameRequired} placeholder="e.g. Atmoz Kanaal Rangsit" aria-invalid={Boolean(errors.buildingName)} aria-describedby={`building-name-help${errors.buildingName ? " building-name-error" : ""}`} className={inputClass}/>
              <span id="building-name-help" className="mt-1.5 block text-xs text-ink-secondary">
                {buildingNameRequired ? "Required for condos, apartments, and dormitories." : "Optional if the property has no building name."}
              </span>
              {errors.buildingName && <span id="building-name-error" className="mt-1.5 block text-xs text-alert">{errors.buildingName}</span>}
            </label>
          </div>

          <label className="block text-sm font-medium text-ink">
            Full Address
            <textarea id="listing-full-address" value={fullAddress} onChange={(event) => setFullAddress(event.target.value)} required rows={3} autoComplete="street-address" placeholder="117 Rangsit-Pathum Thani Rd, Prachathipat, Mueang Pathum Thani, Pathum Thani 12000" aria-invalid={Boolean(errors.fullAddress)} aria-describedby={errors.fullAddress ? "full-address-error" : undefined} className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
            {errors.fullAddress && <span id="full-address-error" className="mt-1.5 block text-xs text-alert">{errors.fullAddress}</span>}
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">
              Area / Neighborhood
              <input id="listing-area" type="text" value={area} onChange={(event) => setArea(event.target.value)} required placeholder="e.g. Rangsit, Ari, Asoke" aria-invalid={Boolean(errors.area)} aria-describedby={errors.area ? "area-error" : undefined} className={inputClass}/>
              {errors.area && <span id="area-error" className="mt-1.5 block text-xs text-alert">{errors.area}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Province / City
              <input id="listing-province" type="text" value={province} onChange={(event) => setProvince(event.target.value)} required autoComplete="address-level1" placeholder="e.g. Bangkok, Pathum Thani" aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? "province-error" : undefined} className={inputClass}/>
              {errors.province && <span id="province-error" className="mt-1.5 block text-xs text-alert">{errors.province}</span>}
            </label>
          </div>

          <label className="block text-sm font-medium text-ink">
            Description
            <textarea id="listing-description" value={description} onChange={(event) => setDescription(event.target.value)} required aria-invalid={Boolean(errors.description)} rows={5} maxLength={2000} placeholder="Describe the property, nearby transport, and who it suits." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
            {errors.description && <span className="mt-1.5 block text-xs text-alert">{errors.description}</span>}
          </label>

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="block text-sm font-medium text-ink">
              Bedrooms
              <input id="listing-bedrooms" type="number" min="0" step="1" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} required aria-invalid={Boolean(errors.bedrooms)} placeholder="1" className={inputClass}/>
              {errors.bedrooms && <span className="mt-1.5 block text-xs text-alert">{errors.bedrooms}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Bathrooms
              <input id="listing-bathrooms" type="number" min="1" step="1" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} required aria-invalid={Boolean(errors.bathrooms)} placeholder="1" className={inputClass}/>
              {errors.bathrooms && <span className="mt-1.5 block text-xs text-alert">{errors.bathrooms}</span>}
            </label>
            <label className="block text-sm font-medium text-ink">
              Size (m²)
              <input id="listing-size" type="number" min="1" step="1" value={size} onChange={(event) => setSize(event.target.value)} required aria-invalid={Boolean(errors.size)} placeholder="30" className={inputClass}/>
              {errors.size && <span className="mt-1.5 block text-xs text-alert">{errors.size}</span>}
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Facilities</legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {facilities.map((facility) => (<label key={facility} className="flex min-h-9 items-center gap-2 text-sm text-ink-secondary">
                  <input type="checkbox" checked={selectedFacilities.includes(facility)} onChange={(event) => toggleFacility(facility, event.target.checked)} className="size-4 shrink-0 accent-primary"/>
                  {facility}
                </label>))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-line bg-canvas/40 p-4">
            <legend className="px-1 text-sm font-semibold text-ink">House Rules</legend>
            <div className="mt-3 grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Smoking</legend>
                  <div className="mt-2 grid gap-2">
                    <label className="flex items-center gap-2 text-sm text-ink-secondary">
                      <input type="radio" name="smoking" checked={smokingAllowed} onChange={() => setSmokingAllowed(true)} className="size-4 accent-primary"/>
                      Allowed
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-secondary">
                      <input type="radio" name="smoking" checked={!smokingAllowed} onChange={() => setSmokingAllowed(false)} className="size-4 accent-primary"/>
                      Not allowed
                    </label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-medium text-ink">Pets</legend>
                  <div className="mt-2 grid gap-2">
                    <label className="flex items-center gap-2 text-sm text-ink-secondary">
                      <input type="radio" name="pets" checked={petsAllowed} onChange={() => setPetsAllowed(true)} className="size-4 accent-primary"/>
                      Allowed
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-secondary">
                      <input type="radio" name="pets" checked={!petsAllowed} onChange={() => setPetsAllowed(false)} className="size-4 accent-primary"/>
                      Not allowed
                    </label>
                  </div>
                </fieldset>
              </div>

              <label className="block text-sm font-medium text-ink">
                Guests
                <select value={guestsPolicy} onChange={(event) => setGuestsPolicy(event.target.value)} className={inputClass}>
                  <option value="ALLOWED">Allowed</option>
                  <option value="LIMITED">Limited</option>
                  <option value="NOT_ALLOWED">Not allowed</option>
                </select>
              </label>

              <fieldset>
                <legend className="text-sm font-medium text-ink">Quiet hours</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-ink-secondary">
                    Start
                    <input id="listing-quiet-start" type="time" value={quietHoursStart} onChange={(event) => setQuietHoursStart(event.target.value)} aria-invalid={Boolean(errors.quietHours)} className={inputClass}/>
                  </label>
                  <label className="block text-sm text-ink-secondary">
                    End
                    <input type="time" value={quietHoursEnd} onChange={(event) => setQuietHoursEnd(event.target.value)} className={inputClass}/>
                  </label>
                </div>
                {errors.quietHours && <p className="mt-2 text-sm text-alert">{errors.quietHours}</p>}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Suitable for</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {suitableForOptions.map((option) => (<label key={option} className="flex min-h-9 items-center gap-2 text-sm text-ink-secondary">
                      <input type="checkbox" checked={suitableFor.includes(option)} onChange={(event) => toggleSuitableFor(option, event.target.checked)} className="size-4 shrink-0 accent-primary"/>
                      {suitableForLabels[option]}
                    </label>))}
                </div>
              </fieldset>

              <label className="block text-sm font-medium text-ink">
                Additional rules
                <textarea id="listing-additional-rules" value={additionalRules} onChange={(event) => setAdditionalRules(event.target.value)} rows={4} maxLength={500} aria-invalid={Boolean(errors.additionalRules)} placeholder="Add any other simple house rules, if needed." className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-secondary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"/>
                <span className="mt-1 block text-xs text-ink-secondary">{additionalRules.length}/500 characters</span>
                {errors.additionalRules && <span className="mt-1.5 block text-xs text-alert">{errors.additionalRules}</span>}
              </label>
            </div>
          </fieldset>

          <div>
            <label htmlFor="listing-photos" className="block text-sm font-medium text-ink">
              Photos
            </label>
            <input id="listing-photos" type="file" accept=".jpg,.jpeg,.png" multiple onChange={handlePhotoChange} aria-invalid={Boolean(errors.photos)} aria-describedby={errors.photos ? "listing-photos-error" : undefined} className="mt-2 block w-full text-sm text-ink-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"/>
            <p className="mt-2 text-xs text-ink-secondary">JPG, JPEG, or PNG. Up to 8 photos, 8 MB per photo. At least one photo is required to submit for review.</p>
            {keptPhotos.length > 0 && (<ul className="mt-3 grid gap-1.5">
                {keptPhotos.map((photo, index) => (<li key={photo.src || index} className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-sm text-ink-secondary">
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-photo"><PropertyImage src={publicImageUrl(photo.src)} alt={photo.name} fill sizes="112px" className="object-cover"/></div>
                    <span className="min-w-0 flex-1 truncate">{photo.name}</span>
                    <button type="button" onClick={() => setKeptPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} className="shrink-0 rounded px-1 text-xs font-semibold text-alert" aria-label={`Remove ${photo.name}`}>
                      Remove
                    </button>
                  </li>))}
              </ul>)}
            {newPhotos.length > 0 && (<p className="mt-2 text-sm font-medium text-ink">
                {newPhotos.length} new file{newPhotos.length === 1 ? "" : "s"} selected: {newPhotos.map((file) => file.name).join(", ")}
              </p>)}
            {errors.photos && <p id="listing-photos-error" className="mt-2 text-sm text-alert">{errors.photos}</p>}
          </div>

          {formError && (<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">
              {formError}
            </p>)}

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" disabled={Boolean(pendingAction)} aria-busy={pendingAction === "draft"} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {pendingAction === "draft" ? "Saving..." : isEditMode ? "Save Changes" : "Save as Draft"}
            </button>
            <button type="button" onClick={submitForReview} disabled={Boolean(pendingAction)} aria-busy={pendingAction === "review"} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              {pendingAction === "review" ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        </div>
      </form>
    </section>);
}
