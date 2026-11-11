import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { multipart, storeUpload, removeUploads, privateFileRoutes, uploadRoot } from "./uploads.js";
import { clearAuthCookie, requireAdmin, requireUser, setAuthCookie, signToken } from "./auth.js";
import { prisma } from "./db.js";
import { HttpError, sendError } from "./http.js";
import { asyncRoute } from "./http.js";
import {
  changePartnerAccess,
  loginUser,
  registerUser,
  reviewPartnerApplication,
  submitPartnerApplication,
  updateProfile,
} from "./services/accounts.js";
import {
  approveBooking,
  cancelBooking,
  completeRental,
  declineBooking,
  getBookingForPartner,
  getBookingForRenter,
  leaveReview,
  listBookingsForPartner,
  listBookingsForRenter,
  recordRefund,
  rejectEvidence,
  requestBooking,
  startRental,
  uploadEvidence,
  verifyEvidence,
} from "./services/bookings.js";
import { searchProperties, toggleFavorite } from "./services/catalog.js";
import {
  createListing,
  reviewListing,
  setListingAvailability,
  submitListing,
  suspendListing,
  updateListing,
} from "./services/listings.js";
import { getConversation, listConversations, markRead, sendMessage, startConversation } from "./services/messages.js";
import {
  getAdminPaymentChat,
  getPartnerPaymentChat,
  getRenterPaymentChat,
  listAdminPaymentChats,
  listPartnerPaymentChats,
  sendAdminPaymentMessage,
  sendPartnerPaymentMessage,
  sendRenterPaymentMessage,
} from "./services/payment-chat.js";
import { getUser, listUsers, moderateReview, reviewReport, submitReport } from "./services/moderation.js";
import { cancelViewing, getViewingForUser, listViewingsForPartner, listViewingsForUser, requestViewing, reviewViewing } from "./services/viewings.js";
import { assertVisibleProperty, currentCapability, requireApprovedPartner, sweepExpiredDeposits, bookingInclude } from "./services/shared.js";
import {
  applicationJson,
  auditJson,
  bookingJson,
  conversationJson,
  listingJson,
  messageJson,
  notificationJson,
  paymentInquiryJson,
  publicProperty,
  publicUser,
  reportJson,
  reviewJson,
  viewingJson,
} from "./serialize.js";

function tokenResponse(res, result) {
  const token = signToken(result.user);
  setAuthCookie(res, token);
  return { token, user: publicUser(result.user, result.capability) };
}

async function listingBody(req) {
  await requireApprovedPartner(prisma, req.user.id);
  let kept;
  try { kept = JSON.parse(req.body.keptPhotos || "[]"); } catch { throw new HttpError(400, "Existing photos are invalid."); }
  if (!Array.isArray(kept) || kept.some(src => typeof src !== "string")) throw new HttpError(400, "Existing photos are invalid.");
  const existing = req.params.id ? await prisma.property.findUnique({ where: { id: req.params.id }, include: { photos: true } }) : null;
  if (req.params.id && (!existing || existing.partnerUserId !== req.user.id)) throw new HttpError(404, "Listing not found.");
  if (existing && !["DRAFT", "REJECTED"].includes(existing.listingStatus)) throw new HttpError(409, "Only a draft or rejected listing can be edited.");
  const photos = kept.map(src => {
    const photo = existing?.photos.find(item => item.src === src);
    if (!photo) throw new HttpError(400, "Only this listing's existing photos may be retained.");
    return photo;
  });
  if (photos.length + (req.files?.length || 0) > 8) throw new HttpError(400, "Upload at most 8 photos.");
  const stored = [];
  try {
    for (const file of req.files || []) {
      const item = await storeUpload(file, "listings"); stored.push(item);
      photos.push({ name: item.name, type: item.type, src: `/uploads/${item.relative}`, alt: item.name });
    }
    return { input: { ...req.body, photos }, stored };
  } catch (error) { await removeUploads(stored); throw error; }
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000", credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads/listings", express.static(path.join(uploadRoot, "listings"), { dotfiles: "deny", setHeaders: res => res.set("X-Content-Type-Options", "nosniff") }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Authorization");
    res.vary("Cookie");
    next();
  });
  privateFileRoutes(app, prisma);

  app.get("/api/health", asyncRoute(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "roomstay-api" });
  }));

  app.post("/api/auth/register", asyncRoute(async (req, res) => {
    res.status(201).json(tokenResponse(res, await registerUser(prisma, req.body)));
  }));

  app.post("/api/auth/login", asyncRoute(async (req, res) => {
    res.json(tokenResponse(res, await loginUser(prisma, req.body)));
  }));

  app.post("/api/auth/logout", (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/me", requireUser, asyncRoute(async (req, res) => {
    const capability = await currentCapability(prisma, req.user.id);
    res.json({ user: publicUser(req.user, capability), partnerApplication: applicationJson(capability) });
  }));

  app.patch("/api/me", requireUser, asyncRoute(async (req, res) => {
    const result = await updateProfile(prisma, req.user.id, req.body);
    res.json({ user: publicUser(result.user, result.capability) });
  }));

  app.post("/api/partner-applications", requireUser, multipart("documents"), asyncRoute(async (req, res) => {
    const id = randomUUID();
    const stored = [];
    try {
      const identity = await storeUpload(req.files?.idDocument?.[0], `private/applications/${id}`, { documents: true, name: "id" }); stored.push(identity);
      const ownership = await storeUpload(req.files?.ownershipDocument?.[0], `private/applications/${id}`, { documents: true, name: "ownership" }); stored.push(ownership);
      const application = await prisma.$transaction(tx => submitPartnerApplication(tx, req.user, {
        ...req.body, idDocumentName: identity.name, idDocumentType: identity.type,
        ownershipDocumentName: ownership.name, ownershipDocumentType: ownership.type,
      }, id));
      res.status(201).json({ application: applicationJson(application) });
    } catch (error) { await removeUploads(stored); throw error; }
  }));

  app.get("/api/partner-applications/me", requireUser, asyncRoute(async (req, res) => {
    const applications = await prisma.partnerApplication.findMany({
      where: { userId: req.user.id },
      orderBy: { submittedAt: "desc" },
    });
    res.json({ applications: applications.map(applicationJson) });
  }));

  app.get("/api/properties", asyncRoute(async (req, res) => {
    const properties = await searchProperties(prisma, req.query);
    res.json({ properties: properties.map((property) => publicProperty(property, { reviews: property.reviews })) });
  }));

  app.get("/api/properties/:id", asyncRoute(async (req, res) => {
    await sweepExpiredDeposits(prisma);
    const property = await assertVisibleProperty(prisma, req.params.id);
    const reviews = await prisma.review.findMany({
      where: { status: { not: "HIDDEN" }, booking: { propertyId: property.id } },
      include: { renter: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ property: publicProperty(property, { reviews }) });
  }));

  app.get("/api/favorites", requireUser, asyncRoute(async (req, res) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: { property: { include: { photos: { orderBy: { sortOrder: "asc" } }, partner: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ favorites: favorites.map((favorite) => ({ id: favorite.id, property: publicProperty(favorite.property) })) });
  }));

  app.post("/api/favorites/:propertyId", requireUser, asyncRoute(async (req, res) => {
    res.json(await toggleFavorite(prisma, req.user.id, req.params.propertyId));
  }));

  app.post("/api/conversations", requireUser, asyncRoute(async (req, res) => {
    const conversation = await startConversation(prisma, req.user, req.body);
    res.status(201).json({
      conversation: conversationJson(conversation, req.user.id),
      messages: conversation.messages.map(messageJson),
    });
  }));

  app.get("/api/conversations", requireUser, asyncRoute(async (req, res) => {
    const conversations = await listConversations(prisma, req.user.id);
    res.json({ conversations: conversations.map((conversation) => conversationJson(conversation, req.user.id)) });
  }));

  app.get("/api/conversations/:id", requireUser, asyncRoute(async (req, res) => {
    const conversation = await getConversation(prisma, req.user.id, req.params.id);
    res.json({
      conversation: conversationJson(conversation, req.user.id),
      messages: conversation.messages.map(messageJson),
    });
  }));

  app.post("/api/conversations/:id/messages", requireUser, asyncRoute(async (req, res) => {
    const conversation = await getConversation(prisma, req.user.id, req.params.id);
    const senderType = conversation.partnerUserId === req.user.id ? "PARTNER" : "RENTER";
    const message = await sendMessage(prisma, req.user, req.params.id, req.body.text, senderType);
    res.status(201).json({ message: messageJson(message) });
  }));

  app.post("/api/conversations/:id/read", requireUser, asyncRoute(async (req, res) => {
    const conversation = await markRead(prisma, req.user.id, req.params.id);
    res.json({ conversation: conversationJson(conversation, req.user.id) });
  }));

  app.post("/api/viewings", requireUser, asyncRoute(async (req, res) => {
    const viewing = await requestViewing(prisma, req.user, req.body);
    res.status(201).json({ viewing: viewingJson(viewing) });
  }));

  app.get("/api/viewings", requireUser, asyncRoute(async (req, res) => {
    const viewings = await listViewingsForUser(prisma, req.user.id);
    res.json({ viewings: viewings.map(viewingJson) });
  }));

  app.get("/api/viewings/:id", requireUser, asyncRoute(async (req, res) => {
    res.json({ viewing: viewingJson(await getViewingForUser(prisma, req.user.id, req.params.id)) });
  }));

  app.post("/api/viewings/:id/cancel", requireUser, asyncRoute(async (req, res) => {
    res.json({ viewing: viewingJson(await cancelViewing(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/bookings", requireUser, asyncRoute(async (req, res) => {
    const booking = await requestBooking(prisma, req.user, req.body);
    res.status(201).json({ booking: bookingJson(booking) });
  }));

  app.get("/api/bookings", requireUser, asyncRoute(async (req, res) => {
    const bookings = await listBookingsForRenter(prisma, req.user.id);
    res.json({ bookings: bookings.map(bookingJson) });
  }));

  app.get("/api/bookings/:id", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await getBookingForRenter(prisma, req.user.id, req.params.id)) });
  }));

  app.post("/api/bookings/:id/evidence", requireUser, multipart("evidence"), asyncRoute(async (req, res) => {
    const stored = await storeUpload(req.file, "private/evidence");
    try {
      const booking = await uploadEvidence(prisma, req.user, req.params.id, { fileName: stored.name, fileType: stored.type, storedPath: stored.relative, note: req.body.note });
      res.json({ booking: bookingJson(booking) });
    } catch (error) { await removeUploads([stored]); throw error; }
  }));

  app.post("/api/bookings/:id/cancel", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await cancelBooking(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/bookings/:id/review", requireUser, asyncRoute(async (req, res) => {
    res.status(201).json({ booking: bookingJson(await leaveReview(prisma, req.user, req.params.id, req.body)) });
  }));

  app.post("/api/reports", requireUser, asyncRoute(async (req, res) => {
    res.status(201).json({ report: reportJson(await submitReport(prisma, req.user, req.body)) });
  }));

  app.get("/api/notifications", requireUser, asyncRoute(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      notifications: notifications.map(notificationJson),
      unread: notifications.filter((notification) => !notification.read).length,
    });
  }));

  app.post("/api/notifications/:id/read", requireUser, asyncRoute(async (req, res) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: "Notification not found." });
    const notification = await prisma.notification.update({ where: { id: existing.id }, data: { read: true } });
    res.json({ notification: notificationJson(notification) });
  }));

  app.get("/api/partner/listings", requireUser, asyncRoute(async (req, res) => {
    const listings = await prisma.property.findMany({
      where: { partnerUserId: req.user.id },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ listings: listings.map(listingJson) });
  }));

  app.post("/api/partner/listings", requireUser, multipart("photos"), asyncRoute(async (req, res) => {
    const { input, stored } = await listingBody(req);
    try { res.status(201).json({ listing: listingJson(await createListing(prisma, req.user, input)) }); }
    catch (error) { await removeUploads(stored); throw error; }
  }));

  app.patch("/api/partner/listings/:id", requireUser, multipart("photos"), asyncRoute(async (req, res) => {
    const { input, stored } = await listingBody(req);
    try { res.json({ listing: listingJson(await updateListing(prisma, req.user, req.params.id, input)) }); }
    catch (error) { await removeUploads(stored); throw error; }
  }));

  app.post("/api/partner/listings/:id/submit", requireUser, asyncRoute(async (req, res) => {
    res.json({ listing: listingJson(await submitListing(prisma, req.user, req.params.id)) });
  }));

  app.patch("/api/partner/listings/:id/availability", requireUser, asyncRoute(async (req, res) => {
    res.json({ listing: listingJson(await setListingAvailability(prisma, req.user, req.params.id, req.body.roomStatus)) });
  }));

  app.get("/api/partner/viewings", requireUser, asyncRoute(async (req, res) => {
    const viewings = await listViewingsForPartner(prisma, req.user.id);
    res.json({ viewings: viewings.map(viewingJson) });
  }));

  app.post("/api/partner/viewings/:id/decision", requireUser, asyncRoute(async (req, res) => {
    res.json({ viewing: viewingJson(await reviewViewing(prisma, req.user, req.params.id, req.body)) });
  }));

  app.get("/api/partner/bookings", requireUser, asyncRoute(async (req, res) => {
    const bookings = await listBookingsForPartner(prisma, req.user.id);
    res.json({ bookings: bookings.map(bookingJson) });
  }));

  app.get("/api/partner/bookings/:id", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await getBookingForPartner(prisma, req.user.id, req.params.id)) });
  }));

  app.post("/api/partner/bookings/:id/approve", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await approveBooking(prisma, req.user, req.params.id, req.body)) });
  }));

  app.post("/api/partner/bookings/:id/decline", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await declineBooking(prisma, req.user, req.params.id, req.body)) });
  }));

  app.post("/api/partner/bookings/:id/verify-evidence", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await verifyEvidence(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/partner/bookings/:id/reject-evidence", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await rejectEvidence(prisma, req.user, req.params.id, req.body)) });
  }));

  app.post("/api/partner/bookings/:id/start", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await startRental(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/partner/bookings/:id/complete", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await completeRental(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/partner/bookings/:id/cancel", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await cancelBooking(prisma, req.user, req.params.id)) });
  }));

  app.post("/api/partner/bookings/:id/refund", requireUser, asyncRoute(async (req, res) => {
    res.json({ booking: bookingJson(await recordRefund(prisma, req.user, req.params.id, req.body)) });
  }));

  app.get("/api/admin/partner-applications", requireAdmin, asyncRoute(async (_req, res) => {
    const applications = await prisma.partnerApplication.findMany({ orderBy: { submittedAt: "desc" } });
    res.json({ applications: applications.map(applicationJson) });
  }));

  app.get("/api/admin/partner-applications/:id", requireAdmin, asyncRoute(async (req, res) => {
    const application = await prisma.partnerApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: "Application not found." });
    res.json({ application: applicationJson(application) });
  }));

  app.post("/api/admin/partner-applications/:id/review", requireAdmin, asyncRoute(async (req, res) => {
    const application = await reviewPartnerApplication(prisma, req.user, req.params.id, req.body);
    res.json({ application: applicationJson(application) });
  }));

  app.post("/api/admin/partners/:userId/suspend", requireAdmin, asyncRoute(async (req, res) => {
    const application = await changePartnerAccess(prisma, req.user, req.params.userId, { status: "SUSPENDED", reason: req.body.reason });
    res.json({ application: applicationJson(application) });
  }));

  app.post("/api/admin/partners/:userId/restore", requireAdmin, asyncRoute(async (req, res) => {
    const application = await changePartnerAccess(prisma, req.user, req.params.userId, { status: "APPROVED" });
    res.json({ application: applicationJson(application) });
  }));

  app.get("/api/admin/listings", requireAdmin, asyncRoute(async (_req, res) => {
    const listings = await prisma.property.findMany({ include: { photos: { orderBy: { sortOrder: "asc" } } }, orderBy: { updatedAt: "desc" } });
    res.json({ listings: listings.map(listingJson) });
  }));

  app.post("/api/admin/listings/:id/review", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ listing: listingJson(await reviewListing(prisma, req.user, req.params.id, req.body)) });
  }));

  app.post("/api/admin/listings/:id/suspend", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ listing: listingJson(await suspendListing(prisma, req.user, req.params.id)) });
  }));

  app.get("/api/admin/users", requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ users: await listUsers(prisma) });
  }));

  app.get("/api/admin/users/:id", requireAdmin, asyncRoute(async (req, res) => {
    const user = await getUser(prisma, req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user });
  }));

  app.get("/api/admin/bookings", requireAdmin, asyncRoute(async (_req, res) => {
    await sweepExpiredDeposits(prisma);
    const bookings = await prisma.booking.findMany({ include: bookingInclude, orderBy: { createdAt: "desc" } });
    res.json({ bookings: bookings.map(bookingJson) });
  }));

  app.get("/api/admin/reviews", requireAdmin, asyncRoute(async (_req, res) => {
    const reviews = await prisma.review.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ reviews: reviews.map(reviewJson) });
  }));

  app.post("/api/admin/reviews/:id/moderate", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ review: reviewJson(await moderateReview(prisma, req.user, req.params.id, req.body.status)) });
  }));

  app.get("/api/admin/reports", requireAdmin, asyncRoute(async (_req, res) => {
    const reports = await prisma.report.findMany({ include: { reporter: true }, orderBy: { createdAt: "desc" } });
    res.json({ reports: reports.map(reportJson) });
  }));

  app.post("/api/admin/reports/:id/review", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ report: reportJson(await reviewReport(prisma, req.user, req.params.id, req.body)) });
  }));

  app.get("/api/partner/payment-chats", requireUser, asyncRoute(async (req, res) => {
    const inquiries = await listPartnerPaymentChats(prisma, req.user);
    res.json({ inquiries: inquiries.map(paymentInquiryJson) });
  }));

  app.get("/api/partner/bookings/:id/payment-chat", requireUser, asyncRoute(async (req, res) => {
    const inquiry = await getPartnerPaymentChat(prisma, req.user, req.params.id);
    res.json({ inquiry: paymentInquiryJson(inquiry) });
  }));

  app.post("/api/partner/bookings/:id/payment-chat", requireUser, asyncRoute(async (req, res) => {
    const inquiry = await sendPartnerPaymentMessage(prisma, req.user, req.params.id, req.body.text);
    res.status(201).json({ inquiry: paymentInquiryJson(inquiry) });
  }));

  app.get("/api/bookings/:id/payment-chat", requireUser, asyncRoute(async (req, res) => {
    const inquiry = await getRenterPaymentChat(prisma, req.user, req.params.id);
    res.json({ inquiry: paymentInquiryJson(inquiry) });
  }));

  app.post("/api/bookings/:id/payment-chat", requireUser, asyncRoute(async (req, res) => {
    const inquiry = await sendRenterPaymentMessage(prisma, req.user, req.params.id, req.body.text);
    res.status(201).json({ inquiry: paymentInquiryJson(inquiry) });
  }));

  app.get("/api/admin/payment-chats", requireAdmin, asyncRoute(async (_req, res) => {
    const inquiries = await listAdminPaymentChats(prisma);
    res.json({ inquiries: inquiries.map(paymentInquiryJson) });
  }));

  app.get("/api/admin/payment-chats/:id", requireAdmin, asyncRoute(async (req, res) => {
    res.json({ inquiry: paymentInquiryJson(await getAdminPaymentChat(prisma, req.params.id)) });
  }));

  app.post("/api/admin/payment-chats/:id/messages", requireAdmin, asyncRoute(async (req, res) => {
    res.status(201).json({ inquiry: paymentInquiryJson(await sendAdminPaymentMessage(prisma, req.user, req.params.id, req.body.text)) });
  }));

  app.get("/api/admin/audit-logs", requireAdmin, asyncRoute(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({ orderBy: { timestamp: "desc" } });
    res.json({ auditLogs: logs.map(auditJson) });
  }));

  app.use((error, _req, res, _next) => {
    sendError(error, res);
  });

  return app;
}
