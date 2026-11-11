import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth.js";
import { reviewApplicationState, suspendPartnerState, restorePartnerState } from "../domain/rules.js";
import { HttpError } from "../http.js";
import { currentCapability } from "./shared.js";

const registerSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().email("A valid email is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email("A valid email is required."),
  password: z.string().min(1, "Password is required."),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").optional(),
  phone: z.string().trim().optional(),
});

const applicationSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().email("A valid email is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  idDocumentName: z.string().trim().min(1, "An identity document is required."),
  idDocumentType: z.string().trim().min(1).default("application/octet-stream"),
  ownershipDocumentName: z.string().trim().min(1, "An ownership document is required."),
  ownershipDocumentType: z.string().trim().min(1).default("application/octet-stream"),
  note: z.string().optional().default(""),
});

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}

export async function registerUser(db, input) {
  const data = parse(registerSchema, input);
  const email = data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with this email already exists.");
  const user = await db.user.create({
    data: {
      fullName: data.fullName,
      email,
      passwordHash: await hashPassword(data.password),
      phone: data.phone || null,
      role: "USER",
    },
  });
  return { user, capability: null };
}

export async function loginUser(db, input) {
  const data = parse(loginSchema, input);
  const user = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  return { user, capability: await currentCapability(db, user.id) };
}

export async function updateProfile(db, userId, input) {
  const data = parse(profileSchema, input);
  const user = await db.user.update({
    where: { id: userId },
    data: {
      ...(data.fullName ? { fullName: data.fullName } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
    },
  });
  return { user, capability: await currentCapability(db, user.id) };
}

export async function submitPartnerApplication(db, user, input, id) {
  const data = parse(applicationSchema, input);
  const capability = await currentCapability(db, user.id);
  if (capability && capability.status !== "REJECTED") {
    throw new HttpError(409, "You already have a partner application in progress.");
  }
  const application = await db.partnerApplication.create({
    data: {
      ...(id ? { id } : {}),
      userId: user.id,
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      phone: data.phone,
      idDocumentName: data.idDocumentName,
      idDocumentType: data.idDocumentType,
      ownershipDocumentName: data.ownershipDocumentName,
      ownershipDocumentType: data.ownershipDocumentType,
      note: data.note?.trim() ?? "",
      status: "PENDING",
    },
  });
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length > 0) {
    await db.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: "PARTNER_APPLICATION_UPDATE",
        title: "New partner application",
        message: `${application.fullName} submitted a partner application for review.`,
        link: `/admin/partner-applications/${application.id}`,
      })),
    });
  }
  return application;
}

export async function reviewPartnerApplication(db, admin, id, decision) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const application = await tx.partnerApplication.findUnique({ where: { id } });
    const next = reviewApplicationState(application, decision, now);
    const updated = await tx.partnerApplication.update({ where: { id }, data: next });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action: next.status === "APPROVED" ? "PARTNER_APPLICATION_APPROVED" : "PARTNER_APPLICATION_REJECTED",
        targetType: "PARTNER_APPLICATION",
        targetId: updated.id,
        targetName: updated.fullName,
        details: `PENDING → ${updated.status}.${updated.rejectionReason ? ` Reason: ${updated.rejectionReason}` : ""}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: updated.userId,
        type: "PARTNER_APPLICATION_UPDATE",
        title: next.status === "APPROVED" ? "Partner application approved" : "Partner application rejected",
        message: next.status === "APPROVED"
          ? "Your partner application was approved. You can now manage listings."
          : `Your partner application was rejected.${updated.rejectionReason ? ` Reason: ${updated.rejectionReason}` : ""}`,
        link: "/partner-application",
      },
    });
    return updated;
  });
}

export async function changePartnerAccess(db, admin, userId, decision) {
  const now = new Date();
  const applications = await db.partnerApplication.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });
  const application = applications.find((item) => item.status === "SUSPENDED")
    ?? applications.find((item) => item.status === "APPROVED");
  const next = decision.status === "SUSPENDED"
    ? suspendPartnerState(application, decision.reason, now, admin.id)
    : restorePartnerState(application, now);
  return db.$transaction(async (tx) => {
    const updated = await tx.partnerApplication.update({ where: { id: application.id }, data: next });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorLabel: admin.fullName,
        action: next.status === "SUSPENDED" ? "PARTNER_SUSPENDED" : "PARTNER_ACCESS_RESTORED",
        targetType: "PARTNER",
        targetId: updated.userId,
        targetName: updated.fullName,
        details: `${application.status} → ${updated.status}.${updated.suspensionReason ? ` Reason: ${updated.suspensionReason}` : ""}`,
      },
    });
    await tx.notification.create({
      data: {
        userId: updated.userId,
        type: next.status === "SUSPENDED" ? "PARTNER_SUSPENDED" : "PARTNER_RESTORED",
        title: next.status === "SUSPENDED" ? "Partner access suspended" : "Partner access restored",
        message: next.status === "SUSPENDED"
          ? `Your partner access is suspended.${updated.suspensionReason ? ` Reason: ${updated.suspensionReason}` : ""} Confirmed bookings and history remain.`
          : "Your partner access has been restored.",
        link: "/partner",
      },
    });
    return updated;
  });
}
