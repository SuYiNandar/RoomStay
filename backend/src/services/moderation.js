import { moderateReviewState, reviewReportState } from "../domain/rules.js";
import { HttpError } from "../http.js";
import { applicationJson } from "../serialize.js";
import { currentCapability } from "./shared.js";

export async function submitReport(db, user, input) {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!["PROPERTY", "USER", "PARTNER"].includes(input.targetType)) throw new HttpError(400, "Report target is invalid.");
  if (!reason || !targetId || reason.length > 200 || description.length > 2000) throw new HttpError(400, "A target and reason (up to 200 characters) are required; details must be at most 2000 characters.");
  const target = input.targetType === "PROPERTY"
    ? await db.property.findUnique({ where: { id: targetId }, select: { title: true } })
    : await db.user.findUnique({ where: { id: targetId }, select: { fullName: true } });
  if (!target) throw new HttpError(404, "Report target not found.");
  const targetLabel = target.title || target.fullName;
  return db.report.create({
    data: {
      reporterUserId: user.id,
      targetType: input.targetType,
      targetId,
      targetLabel,
      reason,
      description,
      status: "OPEN",
    },
    include: { reporter: true },
  });
}

export async function reviewReport(db, admin, id, decision) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id }, include: { reporter: true } });
    const next = reviewReportState(report, decision, now);
    const updated = await tx.report.update({
      where: { id },
      data: { ...next, reviewedById: admin.id },
      include: { reporter: true },
    });
    const action = next.status === "UNDER_REVIEW" ? "REPORT_UNDER_REVIEW" : next.status === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED";
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action,
        targetType: "REPORT",
        targetId: updated.id,
        targetName: updated.targetLabel,
        details: `${report.status} → ${updated.status}.${updated.resolutionNote ? ` Note: ${updated.resolutionNote}` : ""}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: updated.reporterUserId,
        type: "REPORT_UPDATE",
        title: "Report updated",
        message: `Your report about ${updated.targetLabel} is now ${updated.status.replaceAll("_", " ").toLowerCase()}.`,
        link: "/notifications",
        relatedReportId: updated.id,
      },
    });
    return updated;
  });
}

export async function moderateReview(db, admin, id, status) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id }, include: { booking: { include: { property: true } } } });
    const next = moderateReviewState(review, status, now, admin.id);
    const updated = await tx.review.update({ where: { id }, data: next });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action: status === "HIDDEN" ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
        targetType: "REVIEW",
        targetId: updated.id,
        targetName: review.booking?.property?.title ?? updated.id,
        details: `${review.status} → ${status}. The original review and booking are retained.`,
      },
    });
    return updated;
  });
}

export async function listUsers(db) {
  const users = await db.user.findMany({
    where: { role: "USER" },
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { bookings: true, reviews: true, properties: true } },
      partnerApplications: { orderBy: { submittedAt: "desc" } },
    },
  });
  return users.map((user) => {
    const capability = user.partnerApplications.find((application) => application.status === "SUSPENDED")
      ?? user.partnerApplications.find((application) => application.status !== "REJECTED")
      ?? user.partnerApplications[0]
      ?? null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      partnerState: capability?.status ?? "NONE",
      application: applicationJson(capability),
      bookingCount: user._count.bookings,
      reviewCount: user._count.reviews,
      listingCount: user._count.properties,
      firstSeenAt: user.createdAt.toISOString(),
    };
  });
}

export async function getUser(db, id) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== "USER") throw new HttpError(404, "User not found.");
  const directory = await listUsers(db);
  return directory.find((item) => item.id === id) ?? null;
}

export { currentCapability };
