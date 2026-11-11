import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

function secret() {
  return process.env.JWT_SECRET || "roomstay-dev-secret";
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: "7d" });
}

export function setAuthCookie(res, token) {
  res.cookie("roomstay_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("roomstay_token");
}

export async function requireUser(req, res, next) {
  try {
    const header = req.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.roomstay_token;
    if (!token) throw new HttpError(401, "Login is required.");
    const payload = jwt.verify(token, secret());
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new HttpError(401, "Login is required.");
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Login is required."));
  }
}

export async function requireAdmin(req, res, next) {
  await requireUser(req, res, (error) => {
    if (error) return next(error);
    if (req.user.role !== "ADMIN") return next(new HttpError(403, "Admin access is required."));
    next();
  });
}
