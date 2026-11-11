import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { HttpError, asyncRoute } from "./http.js";
import { requireUser } from "./auth.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(backendRoot, "uploads"));
const staging = path.join(uploadRoot, ".staging");
await fs.mkdir(staging, { recursive: true, mode: 0o700 });
const extensions = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" };
export function displayFilename(name) {
  return path.basename(String(name).replaceAll("\\", "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "upload";
}
const upload = multer({
  storage: multer.diskStorage({ destination: staging, filename: (_req, _file, done) => done(null, randomUUID()) }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8, fields: 30, fieldSize: 64 * 1024, parts: 40 },
  fileFilter: (_req, file, done) => done(extensions[file.mimetype] ? null : new HttpError(400, "Upload a JPG, PNG, or PDF file."), Boolean(extensions[file.mimetype])),
});
function files(req) { return req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat(); }
export function multipart(kind) {
  const parser = kind === "evidence" ? upload.single("file") : kind === "photos" ? upload.array("photos", 8) : upload.fields([{ name: "idDocument", maxCount: 1 }, { name: "ownershipDocument", maxCount: 1 }]);
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) return next(new HttpError(400, "Submit files using multipart/form-data."));
    parser(req, res, (error) => {
      if (error) return next(error);
      // Staged files are always removed, including business-validation failures.
      res.on("close", () => { for (const file of files(req)) void fs.rm(file.path, { force: true }).catch(() => {}); });
      next();
    });
  };
}
export async function storeUpload(file, folder, { documents = false, name = randomUUID() } = {}) {
  if (!file) throw new HttpError(400, "A file is required.");
  const handle = await fs.open(file.path, "r");
  const header = Buffer.alloc(12);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  const detected = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
    : header[0] === 255 && header[1] === 216 && header[2] === 255 ? "image/jpeg"
    : header.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : null;
  if (!detected || detected !== file.mimetype || (!documents && detected === "application/pdf")) throw new HttpError(400, documents ? "Upload a valid JPG, PNG, or PDF file." : "Upload a valid JPG or PNG image.");
  const relative = `${folder}/${name}.${extensions[detected]}`;
  const destination = path.join(uploadRoot, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.rename(file.path, destination);
  await fs.chmod(destination, 0o600);
  return { relative, path: destination, name: displayFilename(file.originalname), type: detected };
}
export async function removeUploads(items) { await Promise.all(items.map(item => fs.rm(item.path, { force: true }))); }
export function applicationDocumentPath(application, kind) {
  if (!["id", "ownership"].includes(kind) || !/^[a-zA-Z0-9_-]+$/.test(application.id)) throw new HttpError(404, "Document not found.");
  const type = kind === "id" ? application.idDocumentType : application.ownershipDocumentType;
  const ext = extensions[type];
  if (!ext) throw new HttpError(404, "Document not found.");
  return { relative: `private/applications/${application.id}/${kind}.${ext}`, type };
}
async function sendPrivate(res, relative, type, downloadName) {
  // Old evidence uses uploads/<generated-name>; keep it readable only through this authorized endpoint.
  const key = relative?.replaceAll("\\", "/").replace(/^uploads\//, "");
  if (!key || path.isAbsolute(key)) throw new HttpError(404, "File not found.");
  const resolved = path.resolve(uploadRoot, key);
  if (!resolved.startsWith(uploadRoot + path.sep)) throw new HttpError(404, "File not found.");
  let actual;
  try { actual = await fs.realpath(resolved); } catch { throw new HttpError(404, "File not found. It may predate actual uploads."); }
  if (!actual.startsWith(await fs.realpath(uploadRoot) + path.sep)) throw new HttpError(404, "File not found.");
  res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.type(type);
  if (downloadName) res.attachment(displayFilename(downloadName));
  await new Promise((resolve, reject) => res.sendFile(actual, error => error ? reject(error) : resolve()));
}
export function privateFileRoutes(app, db) {
  app.get("/api/evidence/:id/file", requireUser, asyncRoute(async (req, res) => {
    const evidence = await db.paymentEvidence.findUnique({ where: { id: req.params.id }, include: { booking: { include: { property: true } } } });
    if (!evidence || (req.user.role !== "ADMIN" && evidence.booking.renterUserId !== req.user.id && evidence.booking.property.partnerUserId !== req.user.id)) throw new HttpError(404, "Evidence not found.");
    await sendPrivate(res, evidence.storedPath, evidence.fileType);
  }));
  app.get("/api/partner-applications/:id/documents/:kind", requireUser, asyncRoute(async (req, res) => {
    const application = await db.partnerApplication.findUnique({ where: { id: req.params.id } });
    if (!application || (req.user.role !== "ADMIN" && application.userId !== req.user.id)) throw new HttpError(404, "Application not found.");
    const file = applicationDocumentPath(application, req.params.kind);
    await sendPrivate(res, file.relative, file.type, req.params.kind === "id" ? application.idDocumentName : application.ownershipDocumentName);
  }));
}
