import { propertyTransaction } from "./locking.js";
import { z } from "zod";
import { displayLocation, normalizeHouseRules, reviewListingState, setAvailabilityState, suspendListingState } from "../domain/rules.js";
import { HttpError } from "../http.js";
import { requireApprovedPartner } from "./shared.js";

const photoSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().optional(),
  src: z.string().trim().optional(),
  alt: z.string().trim().optional(),
});

const listingSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  propertyType: z.string().trim().min(1, "Property type is required."),
  monthlyRent: z.coerce.number().int().positive("Monthly rent must be greater than 0."),
  location: z.string().trim().optional().default(""),
  buildingName: z.string().trim().optional(),
  fullAddress: z.string().trim().optional(),
  area: z.string().trim().optional(),
  province: z.string().trim().optional(),
  description: z.string().trim().min(1, "Description is required."),
  bedrooms: z.coerce.number().int().min(0),
  bathrooms: z.coerce.number().int().min(0),
  sizeSqm: z.coerce.number().int().positive("Size must be greater than 0."),
  facilities: z.array(z.string()).optional().default([]),
  photos: z.array(photoSchema).optional().default([]),
  houseRules: z.any().optional(),
});

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}

function listingData(input) {
  const location = displayLocation(input);
  if (!location) throw new HttpError(400, "Location is required.");
  return {
    title: input.title,
    propertyType: input.propertyType,
    monthlyRent: input.monthlyRent,
    location,
    buildingName: input.buildingName || null,
    fullAddress: input.fullAddress || null,
    area: input.area || null,
    province: input.province || null,
    description: input.description,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    sizeSqm: input.sizeSqm,
    facilities: input.facilities,
    houseRules: input.houseRules === undefined ? undefined : normalizeHouseRules(input.houseRules) ?? null,
  };
}

function photoRows(propertyId, photos) {
  return photos.map((photo, index) => ({
    propertyId,
    name: photo.name,
    type: photo.type || "image",
    src: photo.src || `/uploads/listings/${photo.name}`,
    alt: photo.alt || photo.name,
    sortOrder: index,
  }));
}

const include = { photos: { orderBy: { sortOrder: "asc" } } };

export async function createListing(db, user, input) {
  await requireApprovedPartner(db, user.id);
  const data = parse(listingSchema, normalizeBody(input));
  const property = await db.property.create({
    data: {
      ...listingData(data),
      partnerUserId: user.id,
      listingStatus: "DRAFT",
      roomStatus: "AVAILABLE",
      photos: { create: photoRows(undefined, data.photos).map(({ propertyId, ...photo }) => photo) },
    },
    include,
  });
  return property;
}

export async function updateListing(db, user, id, input) {
  await requireApprovedPartner(db, user.id);
  const existing = await db.property.findUnique({ where: { id }, include });
  if (!existing || existing.partnerUserId !== user.id) throw new HttpError(404, "Listing not found.");
  if (existing.listingStatus !== "DRAFT" && existing.listingStatus !== "REJECTED") {
    throw new HttpError(409, "Only a draft or rejected listing can be edited.");
  }
  const data = parse(listingSchema, normalizeBody(input));
  return db.property.update({
    where: { id },
    data: {
      ...listingData(data),
      photos: { deleteMany: {}, create: photoRows(id, data.photos).map(({ propertyId, ...photo }) => photo) },
    },
    include,
  });
}

export async function submitListing(db, user, id) {
  await requireApprovedPartner(db, user.id);
  const existing = await db.property.findUnique({ where: { id }, include });
  if (!existing || existing.partnerUserId !== user.id) throw new HttpError(404, "Listing not found.");
  if (existing.listingStatus !== "DRAFT" && existing.listingStatus !== "REJECTED") {
    throw new HttpError(409, "Only a draft or rejected listing can be submitted.");
  }
  if (existing.photos.length < 1) throw new HttpError(400, "At least one photo is required before submission.");
  return db.property.update({
    where: { id },
    data: { listingStatus: "PENDING_REVIEW", submittedAt: new Date(), rejectionReason: null },
    include,
  });
}

export async function setListingAvailability(db, user, id, roomStatus) {
  await requireApprovedPartner(db, user.id);
  return propertyTransaction(db, id, async tx => {
  const existing = await tx.property.findUnique({ where: { id } });
  if (!existing || existing.partnerUserId !== user.id) throw new HttpError(404, "Listing not found.");
  const next = setAvailabilityState(existing.roomStatus, roomStatus);
  return tx.property.update({ where: { id }, data: { roomStatus: next }, include });
  });
}

export async function reviewListing(db, admin, id, decision) {
  const now = new Date();
  return propertyTransaction(db, id, async (tx) => {
    const listing = await tx.property.findUnique({ where: { id }, include });
    if (!listing) throw new HttpError(404, "Listing not found.");
    const next = reviewListingState({ listing, decision, now });
    const updated = await tx.property.update({ where: { id }, data: next, include });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action: next.listingStatus === "PUBLISHED" ? "LISTING_PUBLISHED" : "LISTING_REJECTED",
        targetType: "LISTING",
        targetId: updated.id,
        targetName: updated.title,
        details: `PENDING_REVIEW → ${updated.listingStatus}. Room status remains ${updated.roomStatus}.${updated.rejectionReason ? ` Reason: ${updated.rejectionReason}` : ""}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: updated.partnerUserId,
        type: "LISTING_REVIEWED",
        title: next.listingStatus === "PUBLISHED" ? "Listing published" : "Listing rejected",
        message: next.listingStatus === "PUBLISHED"
          ? `${updated.title} is now published.`
          : `${updated.title} was rejected.${updated.rejectionReason ? ` Reason: ${updated.rejectionReason}` : ""}`,
        link: "/partner/listings",
        relatedPropertyId: updated.id,
      },
    });
    return updated;
  });
}

export async function suspendListing(db, admin, id) {
  const now = new Date();
  return propertyTransaction(db, id, async (tx) => {
    const listing = await tx.property.findUnique({ where: { id } });
    if (!listing) throw new HttpError(404, "Listing not found.");
    const next = suspendListingState(listing, now);
    const updated = await tx.property.update({ where: { id }, data: next, include });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action: "LISTING_SUSPENDED",
        targetType: "LISTING",
        targetId: updated.id,
        targetName: updated.title,
        details: `PUBLISHED → SUSPENDED. Room status remains ${updated.roomStatus}.`,
      },
    });
    return updated;
  });
}

function normalizeBody(input) {
  const body = { ...input };
  if (typeof body.facilities === "string") {
    body.facilities = body.facilities.split(",").map((item) => item.trim()).filter(Boolean);
  }
  try {
    if (typeof body.photos === "string") body.photos = JSON.parse(body.photos);
    if (typeof body.houseRules === "string" && body.houseRules) body.houseRules = JSON.parse(body.houseRules);
  } catch { throw new HttpError(400, "Invalid listing fields."); }
  return body;
}
