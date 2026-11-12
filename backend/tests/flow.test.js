import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const deadline = new Date(Date.now() + 14 * 86400000).toISOString();

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function api(server, method, pathname, { token, body } = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return { status: response.status, json: text ? JSON.parse(text) : null };
  } catch (error) {
    const wrapped = new Error(`Non-JSON ${response.status} ${pathname}: ${text.slice(0, 500)}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function listingForm({ withPhoto = true } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({title:"River Apartment",propertyType:"Apartment",monthlyRent:12000,area:"Bang Rak",province:"Bangkok",description:"A bright apartment near the river.",bedrooms:1,bathrooms:1,sizeSqm:34,facilities:"Wi-Fi"})) form.append(key,String(value));
  if (withPhoto) form.append("photos",new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=", "base64")],{type:"image/png"}),"river.png");
  return form;
}

test("RoomStay API covers accounts, listings, viewings, bookings, deposits, reviews, and records", async (t) => {
  let server;
  let dataDir;
  let failed = false;
  try {
  dataDir = await mkdtemp(path.join(tmpdir(), "roomstay-"));
  const { ensureDatabase } = await import("../src/ensure-database.js");
  const database = await ensureDatabase({ forceEmbedded: true, dataDir, port: 0 });
  const { prisma } = await import("../src/db.js");
  const { seed } = await import("../prisma/seed.js");
  process.env.UPLOAD_DIR = path.join(dataDir, "uploads");
  const { createApp } = await import("../src/app.js");
  await seed(prisma);
  server = await listen(createApp());

  t.after(() => {
    server?.closeAllConnections();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    // The embedded database keeps the event loop open after the API checks finish.
    setTimeout(() => process.exit(failed ? 1 : 0), 200);
  });
  const health = await api(server, "GET", "/api/health");
  assert.equal(health.status, 200);

  const catalog = await api(server, "GET", "/api/properties?q=Ari");
  assert.equal(catalog.status, 200);
  assert.ok(catalog.json.properties.some((property) => property.id === "cozy-condo" && property.roomStatus === "AVAILABLE"));
  assert.equal((await api(server, "POST", "/api/favorites/cozy-condo")).status, 401);

  const renter = await api(server, "POST", "/api/auth/login", { body: { email: "renter@roomstay.test", password: "password123" } });
  const partner = await api(server, "POST", "/api/auth/login", { body: { email: "partner@roomstay.test", password: "password123" } });
  const admin = await api(server, "POST", "/api/auth/login", { body: { email: "admin@roomstay.test", password: "password123" } });
  assert.equal(renter.json.user.isPartner, false);
  assert.equal(partner.json.user.isPartner, true);
  assert.equal(admin.json.user.role, "ADMIN");

  const unavailableViewing = await api(server, "POST", "/api/viewings", {
    token: renter.json.token,
    body: { propertyId: "modern-studio", viewingDate: futureDate, viewingTime: "10:00" },
  });
  assert.equal(unavailableViewing.status, 409);

  const viewing = await api(server, "POST", "/api/viewings", {
    token: renter.json.token,
    body: { propertyId: "cozy-condo", viewingDate: futureDate, viewingTime: "10:00", message: "Morning works" },
  });
  assert.equal(viewing.status, 201);
  const decided = await api(server, "POST", `/api/partner/viewings/${viewing.json.viewing.id}/decision`, {
    token: partner.json.token,
    body: { status: "APPROVED" },
  });
  assert.equal(decided.json.viewing.status, "APPROVED");
  const stillAvailable = await api(server, "GET", "/api/properties/cozy-condo");
  assert.equal(stillAvailable.json.property.roomStatus, "AVAILABLE");

  const saved = await api(server, "POST", "/api/favorites/cozy-condo", { token: renter.json.token });
  assert.equal(saved.json.saved, true);
  const message = await api(server, "POST", "/api/conversations", {
    token: renter.json.token,
    body: { propertyId: "cozy-condo", text: "Is the condo still open?" },
  });
  assert.equal(message.status, 201);

  const other = await api(server, "POST", "/api/auth/register", {
    body: { fullName: "Second Renter", email: "second@roomstay.test", password: "password123" },
  });
  const firstBooking = await api(server, "POST", "/api/bookings", {
    token: renter.json.token,
    body: { propertyId: "cozy-condo", requestedMoveInDate: futureDate, message: "Need it in November" },
  });
  const secondBooking = await api(server, "POST", "/api/bookings", {
    token: other.json.token,
    body: { propertyId: "cozy-condo", requestedMoveInDate: futureDate },
  });
  assert.equal(firstBooking.json.booking.status, "PENDING");
  assert.equal(secondBooking.json.booking.status, "PENDING");

  const approved = await api(server, "POST", `/api/partner/bookings/${firstBooking.json.booking.id}/approve`, {
    token: partner.json.token,
    body: { depositAmount: 10000, paymentDeadline: deadline },
  });
  assert.equal(approved.json.booking.status, "DEPOSIT_PENDING");
  assert.equal(approved.json.booking.roomStatus, "RESERVED");
  assert.match(approved.json.booking.deposit.paymentInstructions, /does not process the bank transfer/);
  const blocked = await api(server, "GET", `/api/bookings/${secondBooking.json.booking.id}`, { token: other.json.token });
  assert.equal(blocked.json.booking.status, "DECLINED");
  const third = await api(server, "POST", "/api/bookings", {
    token: other.json.token,
    body: { propertyId: "cozy-condo", requestedMoveInDate: futureDate },
  });
  assert.equal(third.status, 409);

  const missingFile = await api(server, "POST", `/api/bookings/${firstBooking.json.booking.id}/evidence`, {
    token: renter.json.token, body: { fileName: "slip.png", fileType: "image/png" },
  });
  assert.equal(missingFile.status, 400);
  const slip = new FormData();
  slip.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "slip.png");
  slip.append("note", "Paid at the bank");
  const evidence = await api(server, "POST", `/api/bookings/${firstBooking.json.booking.id}/evidence`, {
    token: renter.json.token,
    body: slip,
  });
  assert.equal(evidence.json.booking.status, "VERIFICATION_PENDING");
  const evidencePath = evidence.json.booking.evidence.fileUrl;
  assert.ok(evidencePath);

  const verified = await api(server, "POST", `/api/partner/bookings/${firstBooking.json.booking.id}/verify-evidence`, {
    token: partner.json.token,
  });
  assert.equal(verified.json.booking.status, "CONFIRMED");
  assert.equal(verified.json.booking.roomStatus, "RESERVED");
  const started = await api(server, "POST", `/api/partner/bookings/${firstBooking.json.booking.id}/start`, { token: partner.json.token });
  assert.equal(started.json.booking.status, "ACTIVE");
  assert.equal(started.json.booking.roomStatus, "RENTED");
  const completed = await api(server, "POST", `/api/partner/bookings/${firstBooking.json.booking.id}/complete`, { token: partner.json.token });
  assert.equal(completed.json.booking.status, "COMPLETED");
  assert.equal(completed.json.booking.roomStatus, "AVAILABLE");
  const preReviewReport = await api(server, "POST", "/api/reports", {
    token: renter.json.token,
    body: { targetType: "PROPERTY", targetId: "cozy-condo", reason: "Deposit question", description: "Submitted before leaving a review." },
  });
  assert.equal(preReviewReport.status, 201);
  assert.equal(preReviewReport.json.report.status, "OPEN");
  assert.equal(preReviewReport.json.report.targetLabel, "Cozy Condo Near BTS");
  const pendingReports = await api(server, "GET", "/api/admin/reports", { token: admin.json.token });
  assert.ok(pendingReports.json.reports.some((entry) => entry.id === preReviewReport.json.report.id));

  const review = await api(server, "POST", `/api/bookings/${firstBooking.json.booking.id}/review`, {
    token: renter.json.token,
    body: { rating: 5, comment: "Quiet and clean." },
  });
  assert.equal(review.status, 201);
  assert.equal((await api(server, "POST", `/api/bookings/${firstBooking.json.booking.id}/review`, {
    token: renter.json.token,
    body: { rating: 4, comment: "Again" },
  })).status, 409);

  const report = await api(server, "POST", "/api/reports", {
    token: renter.json.token,
    body: { targetType: "PROPERTY", targetId: "cozy-condo", targetLabel: "Cozy Condo Near BTS", reason: "Incorrect photo", description: "The cover is outdated." },
  });
  const resolved = await api(server, "POST", `/api/admin/reports/${report.json.report.id}/review`, {
    token: admin.json.token,
    body: { status: "RESOLVED", resolutionNote: "Asked the partner to replace the photo." },
  });
  assert.equal(resolved.json.report.status, "RESOLVED");
  const reviewedReports = await api(server, "GET", "/api/admin/reports", { token: admin.json.token });
  const reviewedEntry = reviewedReports.json.reports.find((entry) => entry.id === report.json.report.id);
  assert.equal(reviewedEntry.status, "RESOLVED");
  assert.equal(reviewedEntry.resolutionNote, "Asked the partner to replace the photo.");
  const logs = await api(server, "GET", "/api/admin/audit-logs", { token: admin.json.token });
  assert.ok(logs.json.auditLogs.some((entry) => entry.action === "RENTAL_COMPLETED"));

  const applicant = await api(server, "POST", "/api/auth/login", { body: { email: "applicant@roomstay.test", password: "password123" } });
  const granted = await api(server, "POST", "/api/admin/partner-applications/app-applicant/review", {
    token: admin.json.token,
    body: { status: "APPROVED" },
  });
  assert.equal(granted.json.application.status, "APPROVED");
  const freshApplicant = await api(server, "POST", "/api/auth/login", { body: { email: "applicant@roomstay.test", password: "password123" } });

  const emptyDraft = await api(server, "POST", "/api/partner/listings", {
    token: freshApplicant.json.token,
    body: new FormData(),
  });
  assert.equal(emptyDraft.status, 201);
  assert.equal(emptyDraft.json.listing.listingStatus, "DRAFT");
  assert.equal(emptyDraft.json.listing.title, "");
  assert.equal(emptyDraft.json.listing.monthlyRent, 0);
  assert.deepEqual(emptyDraft.json.listing.photos, []);
  const incompleteSubmit = await api(server, "POST", `/api/partner/listings/${emptyDraft.json.listing.id}/submit`, {
    token: freshApplicant.json.token,
  });
  assert.equal(incompleteSubmit.status, 400);
  assert.match(incompleteSubmit.json.error, /title is required/i);

  const partialDraftForm = new FormData();
  partialDraftForm.append("title", "Early riverside draft");
  partialDraftForm.append("monthlyRent", "9000");
  const partialDraft = await api(server, "PATCH", `/api/partner/listings/${emptyDraft.json.listing.id}`, {
    token: freshApplicant.json.token,
    body: partialDraftForm,
  });
  assert.equal(partialDraft.json.listing.listingStatus, "DRAFT");
  assert.equal(partialDraft.json.listing.title, "Early riverside draft");
  assert.equal(partialDraft.json.listing.monthlyRent, 9000);
  assert.equal(partialDraft.json.listing.description, "");

  const photoRequired = await api(server, "POST", "/api/partner/listings", {
    token: freshApplicant.json.token,
    body: listingForm({ withPhoto: false }),
  });
  assert.equal(photoRequired.status, 201);
  const noPhotoSubmit = await api(server, "POST", `/api/partner/listings/${photoRequired.json.listing.id}/submit`, {
    token: freshApplicant.json.token,
  });
  assert.equal(noPhotoSubmit.status, 400);
  assert.match(noPhotoSubmit.json.error, /photo is required/i);
  const readyDraft = await api(server, "PATCH", `/api/partner/listings/${photoRequired.json.listing.id}`, {
    token: freshApplicant.json.token,
    body: listingForm(),
  });
  assert.equal(readyDraft.json.listing.photos.length, 1);
  const readySubmit = await api(server, "POST", `/api/partner/listings/${photoRequired.json.listing.id}/submit`, {
    token: freshApplicant.json.token,
  });
  assert.equal(readySubmit.json.listing.listingStatus, "PENDING_REVIEW");

  const listing = await api(server, "POST", "/api/partner/listings", {
    token: freshApplicant.json.token,
    body: listingForm(),
  });
  assert.equal(listing.json.listing.listingStatus, "DRAFT");
  const photoUrl = listing.json.listing.photos[0].src;
  assert.match(photoUrl, /^\/uploads\/listings\/[a-f0-9-]+\.png$/);
  const image = await fetch(`http://127.0.0.1:${server.address().port}${photoUrl}`);
  assert.equal(image.status, 200);
  assert.equal((await image.arrayBuffer()).byteLength, 68);

  assert.equal(listing.json.listing.location, "Bang Rak, Bangkok");
  await api(server, "POST", `/api/partner/listings/${listing.json.listing.id}/submit`, { token: freshApplicant.json.token });
  const published = await api(server, "POST", `/api/admin/listings/${listing.json.listing.id}/review`, {
    token: admin.json.token,
    body: { status: "PUBLISHED" },
  });
  assert.equal(published.json.listing.roomStatus, "AVAILABLE");
  const visible = await api(server, "GET", `/api/properties/${listing.json.listing.id}`);
  assert.equal(visible.status, 200);

  const editId = listing.json.listing.id;
  const editUrl = `/api/partner/listings/${editId}`;
  const reviewUrl = `/api/admin/listings/${editId}/review`;
  const ownerToken = freshApplicant.json.token;
  const reviewEditedListing = decision => api(server, "POST", reviewUrl, { token: admin.json.token, body: decision });
  async function assertHidden() {
    assert.equal((await api(server, "GET", `/api/properties/${editId}`)).status, 404);
    assert.ok(!(await api(server, "GET", "/api/properties")).json.properties.some(item => item.id === editId));
  }
  await t.test("edit and review endpoints enforce ownership and roles", async () => {
    for (const [token, expected] of [[undefined, 401], [renter.json.token, 403], [partner.json.token, 404]]) {
      assert.equal((await api(server, "PATCH", editUrl, { token, body: listingForm() })).status, expected);
    }
    for (const token of [ownerToken, renter.json.token]) {
      assert.equal((await api(server, "POST", reviewUrl, { token, body: { status: "PUBLISHED" } })).status, 403);
    }
    assert.equal((await api(server, "POST", reviewUrl, { body: { status: "PUBLISHED" } })).status, 401);
  });
  for (const roomStatus of ["AVAILABLE", "RESERVED", "RENTED", "UNAVAILABLE"]) {
    await t.test(`published edit replaces missing photo, requires review, and preserves ${roomStatus}`, async () => {
      await prisma.property.update({ where: { id: editId }, data: { roomStatus } });
      const old = await prisma.propertyPhoto.findFirst({ where: { propertyId: editId } });
      rmSync(path.join(process.env.UPLOAD_DIR, old.src.replace("/uploads/", "")), { force: true });
      const body = listingForm(); body.set("title", `Updated ${roomStatus}`);
      // Attempts to bypass review or reset availability are ignored by validation.
      body.set("listingStatus", "PUBLISHED"); body.set("roomStatus", "AVAILABLE");
      const edited = await api(server, "PATCH", editUrl, { token: ownerToken, body });
      assert.equal(edited.status, 200);
      assert.equal(edited.json.listing.listingStatus, "DRAFT");
      assert.equal(edited.json.listing.roomStatus, roomStatus);
      assert.notEqual(edited.json.listing.photos[0].src, old.src);
      assert.equal(await prisma.propertyPhoto.count({ where: { id: old.id } }), 0);
      await assertHidden();
      const submits = await Promise.all([1, 2].map(() => api(server, "POST", `${editUrl}/submit`, { token: ownerToken })));
      assert.deepEqual(submits.map(result => result.status).sort(), [200, 409]);
      await assertHidden();
      assert.equal((await api(server, "PATCH", editUrl, { token: ownerToken, body: listingForm() })).status, 409);
      const pending = (await api(server, "GET", "/api/admin/listings", { token: admin.json.token })).json.listings.find(item => item.id === editId);
      assert.equal(pending.title, `Updated ${roomStatus}`);
      assert.equal(pending.listingStatus, "PENDING_REVIEW");
      assert.equal((await reviewEditedListing({ status: "PUBLISHED" })).status, 200);
      const publicListing = (await api(server, "GET", `/api/properties/${editId}`)).json.property;
      assert.equal(publicListing.title, `Updated ${roomStatus}`);
      assert.equal(publicListing.roomStatus, roomStatus);
      assert.equal(publicListing.image, edited.json.listing.photos[0].src);
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${publicListing.image}`)).status, 200);
    });
  }
  await t.test("rejection reason is visible to owner and rejected content can be edited and resubmitted", async () => {
    await api(server, "PATCH", editUrl, { token: ownerToken, body: listingForm() });
    await api(server, "POST", `${editUrl}/submit`, { token: ownerToken });
    const rejected = await reviewEditedListing({ status: "REJECTED", rejectionReason: "Please clarify the address." });
    assert.equal(rejected.json.listing.rejectionReason, "Please clarify the address.");
    await assertHidden();
    const owned = (await api(server, "GET", "/api/partner/listings", { token: ownerToken })).json.listings.find(item => item.id === editId);
    assert.equal(owned.rejectionReason, "Please clarify the address.");
    assert.equal((await api(server, "PATCH", editUrl, { token: ownerToken, body: listingForm() })).status, 200);
    assert.equal((await api(server, "POST", `${editUrl}/submit`, { token: ownerToken })).status, 200);
    assert.equal((await reviewEditedListing({ status: "PUBLISHED" })).status, 200);
  });
  await t.test("suspended listings cannot be edited, submitted, or exposed publicly", async () => {
    await api(server, "POST", `/api/admin/listings/${editId}/suspend`, { token: admin.json.token });
    assert.equal((await api(server, "PATCH", editUrl, { token: ownerToken, body: listingForm() })).status, 409);
    assert.equal((await api(server, "POST", `${editUrl}/submit`, { token: ownerToken })).status, 409);
    await assertHidden();
  });

  await api(server, "POST", `/api/admin/partners/${applicant.json.user.id}/suspend`, {
    token: admin.json.token,
    body: { reason: "Ownership document needs another look." },
  });
  assert.equal((await api(server, "GET", `/api/properties/${listing.json.listing.id}`)).status, 404);
  const hiddenAction = await api(server, "POST", "/api/partner/listings", {
    token: freshApplicant.json.token,
    body: listingForm(),
  });
  assert.equal(hiddenAction.status, 403);

  const expiring = await api(server, "POST", "/api/bookings", {
    token: renter.json.token,
    body: { propertyId: "cozy-condo", requestedMoveInDate: futureDate },
  });
  await api(server, "POST", `/api/partner/bookings/${expiring.json.booking.id}/approve`, {
    token: partner.json.token,
    body: { depositAmount: 2000, paymentDeadline: deadline },
  });
  await prisma.booking.update({
    where: { id: expiring.json.booking.id },
    data: { paymentDeadline: new Date("2026-10-01T00:00:00.000Z") },
  });
  const expired = await api(server, "GET", `/api/bookings/${expiring.json.booking.id}`, { token: renter.json.token });
  assert.equal(expired.json.booking.status, "EXPIRED");
  assert.equal(expired.json.booking.roomStatus, "AVAILABLE");
  } catch (error) {
    failed = true;
    console.error(error);
    throw error;
  }
});
