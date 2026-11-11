import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertIsoDate, DEPOSIT_AMOUNT_ERROR, DEPOSIT_INCREMENT_ERROR, PAYMENT_DEADLINE_ERROR } from "../src/domain/rules.js";
import { validateProductionConfig } from "../src/config.js";

const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const deadline = new Date(Date.now() + 14 * 86400000).toISOString();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=", "base64");

test("calendar validation rejects normalized impossible dates", () => {
  for (const value of ["2027-02-29", "2028-02-30", "2026-04-31", "bad", 123]) {
    assert.throws(() => assertIsoDate(value, "Date"), { status: 400 });
  }
  assertIsoDate("2028-02-29", "Date");
});

test("production refuses missing database, default secret, and missing frontend origin", () => {
  const env = { NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/test", JWT_SECRET: "x".repeat(32), FRONTEND_ORIGIN: "https://roomstay.example", UPLOAD_DIR: "/tmp/roomstay-uploads" };
  validateProductionConfig(env);
  for (const key of ["DATABASE_URL", "JWT_SECRET", "FRONTEND_ORIGIN", "UPLOAD_DIR"]) assert.throws(() => validateProductionConfig({ ...env, [key]: "" }));
  assert.throws(() => validateProductionConfig({ ...env, JWT_SECRET: "change-me-in-production" }));
  assert.throws(() => validateProductionConfig({ ...env, FRONTEND_ORIGIN: "https://roomstay.example/" }));
});

test("extended local API audit", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "roomstay-audit-"));
  process.env.UPLOAD_DIR = path.join(dataDir, "uploads");
  const { ensureDatabase } = await import("../src/ensure-database.js");
  const database = await ensureDatabase({ forceEmbedded: true, dataDir, port: 0 });
  const { prisma } = await import("../src/db.js");
  const { seed } = await import("../prisma/seed.js");
  const { createApp } = await import("../src/app.js");
  await seed(prisma);
  const server = await new Promise((resolve) => { const s = createApp().listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const uploaded = [];
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    await database.stop();
    await rm(dataDir, { recursive: true, force: true });
    for (const file of uploaded) await rm(file, { force: true });
  });
  async function api(method, url, token, body, expected = 200) {
    const res = await fetch(base + url, { method, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
    }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    assert.equal(res.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
    return data;
  }
  const renter = await api("POST", "/api/auth/login", null, { email: "renter@roomstay.test", password: "password123" });
  const partner = await api("POST", "/api/auth/login", null, { email: "partner@roomstay.test", password: "password123" });
  const admin = await api("POST", "/api/auth/login", null, { email: "admin@roomstay.test", password: "password123" });
  const other = await api("POST", "/api/auth/register", null, { fullName: "Audit Renter", email: "audit@roomstay.test", password: "password123", role: "ADMIN", isPartner: true }, 201);
  const r = renter.token, p = partner.token, a = admin.token, o = other.token;
  const booking = async (propertyId, token = r) => (await api("POST", "/api/bookings", token, { propertyId, requestedMoveInDate: futureDate }, 201)).booking;
  const approve = (id) => api("POST", `/api/partner/bookings/${id}/approve`, p, { depositAmount: 1000, paymentDeadline: deadline });
  async function upload(id) {
    const form = new FormData(); form.append("file", new Blob([png], { type: "image/png" }), "audit.png");
    const result = await api("POST", `/api/bookings/${id}/evidence`, r, form);

    return result.booking;
  }
  await t.test("seed repeats without duplicate accounts, photos or overwriting property edits", async () => {
    await prisma.property.update({ where: { id: "garden-house" }, data: { description: "Audit edit" } });
    await seed(prisma); await seed(prisma);
    assert.equal(await prisma.property.count(), 18);
    assert.equal(await prisma.propertyPhoto.count(), 18);
    assert.equal(await prisma.user.count(), 5);
    assert.equal((await prisma.property.findUnique({ where: { id: "garden-house" } })).description, "Audit edit");
  });
  await t.test("all seven categories, keyword/location/price/bedroom/facilities/availability and sorting", async () => {
    for (const [flag, id] of [["petFriendly", "garden-house"], ["nearUniversity", "rangsit-campus-dorm"], ["nearTransit", "cozy-condo"]]) {
      const rows = (await api("GET", `/api/properties?${flag}=true`)).properties;
      if (flag === "nearUniversity") {
        assert.equal(rows.length, 7);
        assert.ok(rows.some(x => x.id === id));
        assert.equal(rows.filter(x => x.location.includes("Rangsit University")).length, 3);
        assert.equal(rows.filter(x => x.location.includes("Bangkok University")).length, 3);
      } else assert.deepEqual(rows.map(x => x.id), [id]);
    }
    for (const type of ["Apartment", "Condo", "House", "Dormitory"]) {
      const rows = (await api("GET", `/api/properties?type=${type}`)).properties;
      assert.ok(rows.length); assert.ok(rows.every(x => x.propertyType === type));
    }
    const filtered = await api("GET", "/api/properties?q=Condo&location=Ari%2C%20Bangkok&type=Condo&min=9000&max=11000&bedrooms=1&facilities=Wi-Fi&availableOnly=true&nearTransit=true");
    assert.deepEqual(filtered.properties.map(x => x.id), ["cozy-condo"]);
    for (const sort of ["price-asc", "price-desc"]) {
      const prices = (await api("GET", `/api/properties?sort=${sort}`)).properties.map(x => x.price);
      assert.deepEqual(prices, [...prices].sort((a,b) => sort === "price-asc" ? a-b : b-a));
    }
  });
  await t.test("registration cannot assign roles; admin routes reject guest and renter", async () => {
    assert.equal(other.user.role, "USER"); assert.equal(other.user.isPartner, false);
    for (const route of ["users", "listings", "partner-applications", "reports", "reviews", "audit-logs", "payment-chats", "bookings"]) {
      await api("GET", `/api/admin/${route}`, null, null, 401);
      await api("GET", `/api/admin/${route}`, r, null, 403);
    }
    await api("POST", "/api/auth/login", null, { email: "admin@roomstay.test", password: "wrong" }, 401);
    await api("PATCH", "/api/me", o, { fullName: "Updated Audit Renter", phone: "0812345678", role: "ADMIN" });
    assert.equal((await api("GET", "/api/me", o)).user.role, "USER");
  });
  let hold;
  await t.test("booking ownership, invalid transitions, competing approvals and cancellation", async () => {
    hold = await booking("cozy-condo"); const second = await booking("cozy-condo", o);
    await api("GET", `/api/bookings/${hold.id}`, o, null, 404);
    await api("POST", `/api/partner/bookings/${hold.id}/approve`, r, {}, 403);
    await api("POST", `/api/partner/bookings/${hold.id}/start`, p, null, 409);
    await api("POST", `/api/bookings/${hold.id}/review`, r, { rating: 5, comment: "too early" }, 409);
    const results = await Promise.allSettled([approve(hold.id), approve(second.id)]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(results.find(x => x.status === "rejected").reason.actual, 409);
    const holds = await prisma.booking.findMany({ where: { propertyId: "cozy-condo", status: "DEPOSIT_PENDING" } });
    assert.equal(holds.length, 1);
    const held = holds[0];
    await api("POST", `/api/bookings/${held.id}/cancel`, held.renterUserId === renter.user.id ? r : o);
    assert.equal((await api("GET", "/api/properties/cozy-condo")).property.roomStatus, "AVAILABLE");
    hold = await booking("cozy-condo"); await approve(hold.id);
  });
  await t.test("real evidence upload, rejection, resubmission and confirmation", async () => {
    await api("POST", `/api/bookings/${hold.id}/evidence`, r, { fileName: "fake.png", fileType: "image/png" }, 400);
    await api("POST", `/api/partner/bookings/${hold.id}/verify-evidence`, p, null, 409);
    const submitted = await upload(hold.id);
    assert.equal(submitted.status, "VERIFICATION_PENDING");
    assert.equal((await fetch(base + submitted.evidence.fileUrl)).status, 401);
    for (const token of [r,p,a]) {
      const imageResponse = await fetch(base + submitted.evidence.fileUrl, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResponse.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);
    }
    assert.equal((await fetch(base + submitted.evidence.fileUrl, { headers: { authorization: `Bearer ${o}` } })).status, 404);
    assert.equal(submitted.evidence.storedPath, undefined);
    const stored = await prisma.paymentEvidence.findUnique({ where: { id: submitted.evidence.id } });
    assert.equal((await fetch(base + "/uploads/" + stored.storedPath)).status, 404);
    const rejected = await api("POST", `/api/partner/bookings/${hold.id}/reject-evidence`, p, { rejectionReason: "Please provide a clearer image" });
    assert.equal(rejected.booking.status, "DEPOSIT_PENDING");
    await upload(hold.id);
    const verified = await api("POST", `/api/partner/bookings/${hold.id}/verify-evidence`, p);
    assert.equal(verified.booking.status, "CONFIRMED");
    assert.equal(verified.booking.roomStatus, "RESERVED");
  });
  await t.test("renter, partner and admin payment chat with outsider rejection", async () => {
    const chat = await api("POST", `/api/bookings/${hold.id}/payment-chat`, r, { text: "Check this slip" }, 201);
    await api("GET", `/api/bookings/${hold.id}/payment-chat`, o, null, 404);
    await api("POST", `/api/partner/bookings/${hold.id}/payment-chat`, p, { text: "I verified it" }, 201);
    const reply = await api("POST", `/api/admin/payment-chats/${chat.inquiry.id}/messages`, a, { text: "Verification recorded" }, 201);
    assert.deepEqual(reply.inquiry.messages.map(x => x.senderRole), ["RENTER", "PARTNER", "ADMIN"]);
    assert.ok((await api("GET", "/api/notifications", r)).notifications.some(x => x.link?.endsWith("/payment-chat")));
  });
  await t.test("external refund records and cancellation release room", async () => {
    await api("POST", `/api/partner/bookings/${hold.id}/refund`, p, { status: "REFUNDED", amount: 1000 }, 409);
    await api("POST", `/api/bookings/${hold.id}/cancel`, r);
    const refunded = await api("POST", `/api/partner/bookings/${hold.id}/refund`, p, { status: "REFUNDED", amount: 1000, method: "External bank transfer", refundedAt: new Date().toISOString() });
    assert.equal(refunded.booking.refund.amount, 1000);
    assert.equal(refunded.booking.roomStatus, "AVAILABLE");
  });
  await t.test("viewing reschedule/decline, messages and notifications enforce ownership", async () => {
    const view = await api("POST", "/api/viewings", r, { propertyId: "cozy-condo", viewingDate: futureDate, viewingTime: "10:00" }, 201);
    await api("GET", `/api/viewings/${view.viewing.id}`, o, null, 404);
    await api("POST", `/api/partner/viewings/${view.viewing.id}/decision`, p, { status: "RESCHEDULE_REQUESTED", partnerSuggestedDate: futureDate, partnerSuggestedTime: "11:00" });
    await api("POST", `/api/partner/viewings/${view.viewing.id}/decision`, p, { status: "APPROVED" }, 409);
    const decline = await api("POST", "/api/viewings", r, { propertyId: "cozy-condo", viewingDate: futureDate, viewingTime: "12:00" }, 201);
    await api("POST", `/api/partner/viewings/${decline.viewing.id}/decision`, p, { status: "DECLINED", declineReason: "Unavailable at that time" });
    const convo = await api("POST", "/api/conversations", r, { propertyId: "cozy-condo", text: "Hello" }, 201);
    await api("GET", `/api/conversations/${convo.conversation.id}`, o, null, 404);
    await api("POST", `/api/conversations/${convo.conversation.id}/messages`, p, { text: "Welcome" }, 201);
    await api("POST", `/api/conversations/${convo.conversation.id}/read`, r);
    const notice = (await api("GET", "/api/notifications", r)).notifications[0];
    await api("POST", `/api/notifications/${notice.id}/read`, o, null, 404);
    await api("POST", `/api/notifications/${notice.id}/read`, r);
  });
  function applicationForm() {
    const form = new FormData();
    for (const [key,value] of Object.entries({ fullName: "Audit Renter", email: "audit@roomstay.test", phone: "0812345678" })) form.append(key,value);
    for (const key of ["idDocument", "ownershipDocument"]) form.append(key,new Blob(["%PDF-1.4\nfixture"],{type:"application/pdf"}),key+".pdf");
    return form;
  }
  await t.test("application submission, duplicate blocking, approval and restore", async () => {
    const application = await api("POST", "/api/partner-applications", o, applicationForm(), 201);
    for (const url of [application.application.idDocumentUrl, application.application.ownershipDocumentUrl]) {
      assert.ok(url.startsWith("/api/partner-applications/"));
      assert.equal((await fetch(base + url)).status, 401);
      assert.equal((await fetch(base + url, { headers: { authorization: `Bearer ${r}` } })).status, 404);
      for (const token of [o,a]) {
        const result = await fetch(base + url, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(result.status, 200);
        assert.match(result.headers.get("content-disposition"), /^attachment/);
        assert.equal(await result.text(), "%PDF-1.4\nfixture");
      }
    }
    await api("POST", `/api/admin/partner-applications/${application.application.id}/review`, a, { status: "APPROVED" });
    assert.equal((await api("GET", "/api/me", o)).user.isPartner, true);
    await api("POST", "/api/partner-applications", o, applicationForm(), 409);
    await api("POST", `/api/admin/partners/${other.user.id}/suspend`, a, { reason: "Check documents" });
    assert.equal((await api("GET", "/api/me", o)).user.isPartner, false);
    await api("POST", `/api/admin/partners/${other.user.id}/restore`, a);
    assert.equal((await api("GET", "/api/me", o)).user.isPartner, true);
  });
  await t.test("review hide/restore updates public API, reports and audit logs", async () => {
    const b = await booking("cozy-condo"); await approve(b.id); await upload(b.id);
    await api("POST", `/api/partner/bookings/${b.id}/verify-evidence`, p);
    await api("POST", `/api/partner/bookings/${b.id}/start`, p);
    await api("POST", `/api/partner/bookings/${b.id}/complete`, p);
    const review = await api("POST", `/api/bookings/${b.id}/review`, r, { rating: 4, comment: "Audit review" }, 201);
    assert.equal((await api("GET", "/api/properties/cozy-condo")).property.reviews.length, 1);
    await api("POST", `/api/admin/reviews/${review.booking.review.id}/moderate`, a, { status: "HIDDEN" });
    assert.equal((await api("GET", "/api/properties/cozy-condo")).property.reviews.length, 0);
    await api("POST", `/api/admin/reviews/${review.booking.review.id}/moderate`, a, { status: "VISIBLE" });
    const report = await api("POST", "/api/reports", r, { targetType: "PROPERTY", targetId: "cozy-condo", targetLabel: "Cozy Condo", reason: "Incorrect details" }, 201);
    await api("POST", `/api/admin/reports/${report.report.id}/review`, a, { status: "UNDER_REVIEW" });
    await api("POST", `/api/admin/reports/${report.report.id}/review`, a, { status: "DISMISSED", resolutionNote: "Checked" });
    assert.ok((await api("GET", "/api/admin/audit-logs", a)).auditLogs.some(x => x.action === "REVIEW_HIDDEN"));
  });
  await t.test("multipart rejects missing, spoofed, oversized and unsafe file references", async () => {
    await api("POST", "/api/partner-applications", r, {}, 400);
    const incomplete = applicationForm(); incomplete.delete("ownershipDocument");
    await api("POST", "/api/partner-applications", r, incomplete, 400);
    const b = await booking("cozy-condo"); await approve(b.id);
    for (const [content,type,status] of [["not an image","image/png",400], [png,"text/html",400], ["%PDF-1.4","application/pdf",400], [Buffer.alloc(8*1024*1024+1),"image/png",413]]) {
      const form = new FormData(); form.append("file",new Blob([content],{type}),"../../unsafe.png");
      await api("POST", `/api/bookings/${b.id}/evidence`, r, form, status);
    }
    await api("POST", `/api/bookings/${b.id}/evidence`, r, new FormData(), 400);
    assert.equal((await api("GET", `/api/bookings/${b.id}`,r)).booking.status,"DEPOSIT_PENDING");
    const form = new FormData(); form.append("keptPhotos",JSON.stringify(["../../private/evidence/secret.png"]));
    await api("POST", "/api/partner/listings",p,form,400);
    await api("POST", `/api/bookings/${b.id}/cancel`,r);
  });
  await t.test("duplicate booking transitions commit once with no duplicate side effects", async () => {
    async function once(action) {
      const results = await Promise.allSettled([action(), action()]);
      assert.equal(results.filter(item => item.status === "fulfilled").length,1);
      assert.equal(results.find(item => item.status === "rejected").reason.actual,409);
    }
    const b = await booking("cozy-condo");
    await once(() => approve(b.id));
    assert.equal(await prisma.reservationDeposit.count({where:{bookingId:b.id}}),1);
    await upload(b.id);
    await once(() => api("POST",`/api/partner/bookings/${b.id}/verify-evidence`,p));
    await once(() => api("POST",`/api/partner/bookings/${b.id}/start`,p));
    const all = (await api("GET","/api/admin/bookings",a)).bookings;
    assert.ok(all.some(item => item.id === b.id && item.status === "ACTIVE"));
    await once(() => api("POST",`/api/partner/bookings/${b.id}/complete`,p));
    assert.equal((await api("GET","/api/properties/cozy-condo")).property.roomStatus,"AVAILABLE");
    for (const action of ["BOOKING_APPROVED","EVIDENCE_VERIFIED","RENTAL_STARTED","RENTAL_COMPLETED"]) {
      assert.equal(await prisma.auditLog.count({where:{targetId:b.id,action}}),1,action);
    }
    const cancelled = await booking("cozy-condo"); await approve(cancelled.id);
    await once(() => api("POST",`/api/bookings/${cancelled.id}/cancel`,r));
    assert.equal(await prisma.auditLog.count({where:{targetId:cancelled.id,action:"BOOKING_CANCELLED"}}),1);
    assert.equal((await api("GET","/api/properties/cozy-condo")).property.roomStatus,"AVAILABLE");
  });
  await t.test("CORS allows configured frontend and does not reflect arbitrary origins", async () => {
    const res = await fetch(base + "/api/health", { headers: { origin: "https://untrusted.example" } });
    assert.notEqual(res.headers.get("access-control-allow-origin"), "https://untrusted.example");
  });
  await t.test("missing property IDs cannot select an arbitrary listing", async () => {
    await api("POST", "/api/bookings", r, { requestedMoveInDate: futureDate }, 400);
    await api("POST", "/api/viewings", r, { viewingDate: futureDate, viewingTime: "10:00" }, 400);
    await api("POST", "/api/conversations", r, { text: "Missing property" }, 400);
  });
  await t.test("viewing duplicate protection", async (t) => {
    const slot = { propertyId: "bu-campus-apartment", viewingDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10), viewingTime: "10:00" };
    const conflict = "You already have a viewing request for this property at this date and time.";
    const create = (body = slot, token = r, expected = 201) => api("POST", "/api/viewings", token, body, expected);
    let first;
    await t.test("first request succeeds", async () => {
      first = (await create()).viewing;
      assert.equal(first.status, "REQUESTED");
    });
    for (const status of ["REQUESTED", "APPROVED", "RESCHEDULE_REQUESTED"]) {
      await t.test(`identical ${status} request is rejected without extra rows or notifications`, async () => {
        await prisma.viewing.update({ where: { id: first.id }, data: { status } });
        const before = [await prisma.viewing.count(), await prisma.notification.count()];
        assert.equal((await create(slot, r, 409)).error, conflict);
        assert.deepEqual([await prisma.viewing.count(), await prisma.notification.count()], before);
      });
    }
    await t.test("different date succeeds", async () => {
      await create({ ...slot, viewingDate: new Date(Date.now() + 46 * 86400000).toISOString().slice(0, 10) });
    });
    await t.test("different time succeeds", async () => { await create({ ...slot, viewingTime: "11:00" }); });
    await t.test("different property succeeds", async () => { await create({ ...slot, propertyId: "rsu-area-apartment" }); });
    await t.test("different renter succeeds", async () => { await create(slot, o); });
    await t.test("declined old request allows a new request", async () => {
      await prisma.viewing.update({ where: { id: first.id }, data: { status: "DECLINED" } });
      const next = (await create()).viewing;
      assert.notEqual(next.id, first.id);
      assert.equal(next.status, "REQUESTED");
    });
    await t.test("simultaneous identical requests create one viewing and one notification", async () => {
      const body = { ...slot, viewingTime: "12:00" };
      const responses = await Promise.all([1, 2].map(() => fetch(base + "/api/viewings", {
        method: "POST", headers: { authorization: `Bearer ${r}`, "content-type": "application/json" }, body: JSON.stringify(body),
      })));
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
      const rows = await prisma.viewing.findMany({ where: { renterId: renter.user.id, ...body } });
      assert.equal(rows.length, 1);
      assert.equal(await prisma.notification.count({ where: { relatedViewingId: rows[0].id } }), 1);
    });
  });
  await t.test("approval validates deposit minimum and future deadline", async () => {
    const b = await booking("garden-house");
    for (const depositAmount of [999, 0, -1, "", "not-a-number"]) {
      const rejected = await api("POST", `/api/partner/bookings/${b.id}/approve`, p, { depositAmount, paymentDeadline: deadline }, 400);
      assert.equal(rejected.error, DEPOSIT_AMOUNT_ERROR);
    }
    for (const depositAmount of [1500, 2500, 1000.5]) {
      const rejected = await api("POST", `/api/partner/bookings/${b.id}/approve`, p, { depositAmount, paymentDeadline: deadline }, 400);
      assert.equal(rejected.error, DEPOSIT_INCREMENT_ERROR);
    }
    for (const paymentDeadline of [new Date(Date.now() - 86400000).toISOString(), new Date().toISOString(), "not-a-date", ""]) {
      const rejected = await api("POST", `/api/partner/bookings/${b.id}/approve`, p, { depositAmount: 1000, paymentDeadline }, 400);
      assert.equal(rejected.error, PAYMENT_DEADLINE_ERROR);
    }
    const stillPending = (await api("GET", `/api/bookings/${b.id}`, r)).booking;
    assert.equal(stillPending.status, "PENDING");
    const approved = await api("POST", `/api/partner/bookings/${b.id}/approve`, p, { depositAmount: 1000, paymentDeadline: deadline });
    assert.equal(approved.booking.status, "DEPOSIT_PENDING");
    assert.equal(approved.booking.depositAmount, 1000);
    await api("POST", `/api/bookings/${b.id}/cancel`, r);
  });
  const d1 = await booking("garden-house");
  await api("POST", "/api/bookings", r, { propertyId: "garden-house", requestedMoveInDate: futureDate }, 409);
  const catalog = await api("GET", "/api/properties");
  assert.equal(catalog.properties.find(x => x.id === "cozy-condo").reviewCount, 1);
  await approve(d1.id);
  await prisma.booking.update({ where: { id: d1.id }, data: { paymentDeadline: new Date(0) } });
  assert.equal((await api("GET", "/api/properties")).properties.find(x => x.id === "garden-house").roomStatus, "AVAILABLE");
  assert.equal((await api("GET", `/api/bookings/${d1.id}`, r)).booking.status, "EXPIRED");
});
