import { assertViewingSlot, canRequestViewing, cancelViewingState, decideViewing } from "../domain/rules.js";
import { HttpError } from "../http.js";
import { assertVisibleProperty, requireApprovedPartner } from "./shared.js";

const include = { property: true, renter: true };

export async function requestViewing(db, user, input) {
  const property = await assertVisibleProperty(db, input.propertyId);
  if (property.partnerUserId === user.id) throw new HttpError(409, "You cannot request a viewing of your own listing.");
  if (!canRequestViewing(property.roomStatus)) throw new HttpError(409, "Viewing requests are unavailable for this property.");
  assertViewingSlot(input.viewingDate, input.viewingTime);
  const viewing = await db.viewing.create({
    data: {
      propertyId: property.id,
      renterId: user.id,
      viewingDate: input.viewingDate,
      viewingTime: input.viewingTime,
      message: input.message?.trim() ?? "",
      status: "REQUESTED",
    },
    include,
  });
  await db.notification.create({
    data: {
      userId: property.partnerUserId,
      type: "VIEWING_UPDATE",
      title: "New viewing request",
      message: `${user.fullName} requested a viewing for ${property.title}.`,
      link: `/partner/viewings/${viewing.id}`,
      relatedViewingId: viewing.id,
      relatedPropertyId: property.id,
    },
  });
  return viewing;
}

export async function listViewingsForUser(db, userId) {
  return db.viewing.findMany({ where: { renterId: userId }, include, orderBy: { createdAt: "desc" } });
}

export async function listViewingsForPartner(db, userId) {
  await requireApprovedPartner(db, userId);
  return db.viewing.findMany({
    where: { property: { partnerUserId: userId } },
    include,
    orderBy: { createdAt: "desc" },
  });
}

export async function getViewingForUser(db, userId, id) {
  const viewing = await db.viewing.findUnique({ where: { id }, include });
  if (!viewing || viewing.renterId !== userId) throw new HttpError(404, "Viewing not found.");
  return viewing;
}

export async function reviewViewing(db, user, id, decision) {
  await requireApprovedPartner(db, user.id);
  const viewing = await db.viewing.findUnique({ where: { id }, include });
  if (!viewing || viewing.property.partnerUserId !== user.id) throw new HttpError(404, "Viewing not found.");
  const roomBefore = viewing.property.roomStatus;
  const next = decideViewing(viewing, decision);
  const updated = await db.viewing.update({ where: { id }, data: next, include });
  if (updated.property.roomStatus !== roomBefore) {
    throw new HttpError(500, "A viewing decision must not change room status.");
  }
  await db.notification.create({
    data: {
      userId: updated.renterId,
      type: "VIEWING_UPDATE",
      title: "Viewing update",
      message: viewingMessage(updated),
      link: `/viewings/${updated.id}`,
      relatedViewingId: updated.id,
      relatedPropertyId: updated.propertyId,
    },
  });
  return updated;
}

export async function cancelViewing(db, user, id) {
  const viewing = await db.viewing.findUnique({ where: { id }, include });
  if (!viewing || viewing.renterId !== user.id) throw new HttpError(404, "Viewing not found.");
  const roomBefore = viewing.property.roomStatus;
  const next = cancelViewingState(viewing);
  const updated = await db.viewing.update({ where: { id }, data: next, include });
  if (updated.property.roomStatus !== roomBefore) {
    throw new HttpError(500, "Cancelling a viewing must not change room status.");
  }
  await db.notification.create({
    data: {
      userId: updated.property.partnerUserId,
      type: "VIEWING_UPDATE",
      title: "Viewing cancelled",
      message: `${user.fullName} cancelled the viewing for ${updated.property.title}.`,
      link: `/partner/viewings/${updated.id}`,
      relatedViewingId: updated.id,
      relatedPropertyId: updated.propertyId,
    },
  });
  return updated;
}

function viewingMessage(viewing) {
  if (viewing.status === "APPROVED") return `Your viewing for ${viewing.property.title} was approved.`;
  if (viewing.status === "DECLINED") return `Your viewing for ${viewing.property.title} was declined. ${viewing.declineReason}`;
  return `The Partner suggested another time for your ${viewing.property.title} viewing.`;
}
