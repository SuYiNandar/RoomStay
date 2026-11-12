import { HttpError } from "../http.js";
import { assertVisibleProperty, requireApprovedPartner } from "./shared.js";

const include = {
  property: true,
  renter: true,
  partner: true,
  messages: { orderBy: { createdAt: "asc" } },
};

export async function startConversation(db, user, { propertyId, text }) {
  const property = await assertVisibleProperty(db, propertyId);
  if (property.partnerUserId === user.id) throw new HttpError(409, "You cannot message your own listing.");
  const message = text?.trim() ?? "";
  const conversation = await db.conversation.upsert({
    where: { propertyId_renterUserId: { propertyId, renterUserId: user.id } },
    create: { propertyId, renterUserId: user.id, partnerUserId: property.partnerUserId },
    update: {},
  });
  if (!message) {
    return db.conversation.findUnique({ where: { id: conversation.id }, include });
  }
  await db.message.create({
    data: { conversationId: conversation.id, senderId: user.id, senderType: "RENTER", text: message },
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await db.notification.create({
    data: {
      userId: property.partnerUserId,
      type: "NEW_MESSAGE",
      title: "New message",
      message: `${user.fullName} sent a message about ${property.title}.`,
      link: `/partner/messages/${conversation.id}`,
      relatedPropertyId: property.id,
    },
  });
  return db.conversation.findUnique({ where: { id: conversation.id }, include });
}

export async function listConversations(db, userId) {
  return db.conversation.findMany({
    where: { OR: [{ renterUserId: userId }, { partnerUserId: userId }] },
    include,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getConversation(db, userId, id) {
  const conversation = await db.conversation.findUnique({ where: { id }, include });
  if (!conversation || (conversation.renterUserId !== userId && conversation.partnerUserId !== userId)) {
    throw new HttpError(404, "Conversation not found.");
  }
  return conversation;
}

export async function sendMessage(db, user, id, text, senderType) {
  const conversation = await getConversation(db, user.id, id);
  if (senderType === "PARTNER") {
    await requireApprovedPartner(db, user.id);
    if (conversation.partnerUserId !== user.id) throw new HttpError(403, "Approved Partner access is required.");
  } else if (conversation.renterUserId !== user.id) {
    throw new HttpError(403, "You cannot send a message in this conversation.");
  }
  const message = text?.trim() ?? "";
  if (!message) throw new HttpError(400, "Message text is required.");
  const created = await db.message.create({
    data: { conversationId: id, senderId: user.id, senderType, text: message },
  });
  await db.conversation.update({ where: { id }, data: { updatedAt: created.createdAt } });
  const recipientId = senderType === "PARTNER" ? conversation.renterUserId : conversation.partnerUserId;
  await db.notification.create({
    data: {
      userId: recipientId,
      type: "NEW_MESSAGE",
      title: "New message",
      message: `${user.fullName} sent a message about ${conversation.property.title}.`,
      link: senderType === "PARTNER" ? `/messages/${id}` : `/partner/messages/${id}`,
      relatedPropertyId: conversation.propertyId,
    },
  });
  return created;
}

export async function markRead(db, userId, id) {
  const conversation = await getConversation(db, userId, id);
  await db.message.updateMany({
    where: { conversationId: conversation.id, senderId: { not: userId }, read: false },
    data: { read: true },
  });
  return getConversation(db, userId, id);
}
