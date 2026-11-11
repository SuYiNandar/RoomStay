-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'RESCHEDULE_REQUESTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'DEPOSIT_PENDING', 'VERIFICATION_PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DepositVerificationStatus" AS ENUM ('AWAITING_EVIDENCE', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NOT_APPLICABLE', 'REFUND_PENDING', 'REFUNDED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'REPORTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('PROPERTY', 'USER', 'PARTNER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('RENTER', 'PARTNER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_APPROVED', 'BOOKING_DECLINED', 'BOOKING_EXPIRED', 'BOOKING_CANCELLED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'EVIDENCE_UPLOADED', 'VIEWING_UPDATE', 'NEW_MESSAGE', 'REPORT_UPDATE', 'PARTNER_SUSPENDED', 'PARTNER_RESTORED', 'PARTNER_APPLICATION_UPDATE', 'LISTING_REVIEWED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PARTNER_APPLICATION_APPROVED', 'PARTNER_APPLICATION_REJECTED', 'PARTNER_SUSPENDED', 'PARTNER_ACCESS_RESTORED', 'LISTING_PUBLISHED', 'LISTING_REJECTED', 'LISTING_SUSPENDED', 'REPORT_UNDER_REVIEW', 'REPORT_RESOLVED', 'REPORT_DISMISSED', 'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'BOOKING_APPROVED', 'BOOKING_DECLINED', 'BOOKING_EXPIRED', 'EVIDENCE_VERIFIED', 'EVIDENCE_REJECTED', 'RENTAL_STARTED', 'RENTAL_COMPLETED', 'BOOKING_CANCELLED', 'REFUND_RECORDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "idDocumentName" TEXT NOT NULL,
    "idDocumentType" TEXT NOT NULL,
    "ownershipDocumentName" TEXT NOT NULL,
    "ownershipDocumentType" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "PartnerApplicationStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "suspendedById" TEXT,
    "unsuspendedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "monthlyRent" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "buildingName" TEXT,
    "fullAddress" TEXT,
    "area" TEXT,
    "province" TEXT,
    "description" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "sizeSqm" INTEGER NOT NULL,
    "facilities" TEXT[],
    "houseRules" JSONB,
    "listingStatus" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "roomStatus" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPhoto" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertyPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "renterUserId" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "viewingDate" TEXT NOT NULL,
    "viewingTime" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "ViewingStatus" NOT NULL DEFAULT 'REQUESTED',
    "partnerSuggestedDate" TEXT,
    "partnerSuggestedTime" TEXT,
    "partnerMessage" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "renterUserId" TEXT NOT NULL,
    "requestedMoveInDate" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "monthlyRent" INTEGER NOT NULL,
    "depositAmount" INTEGER,
    "paymentDeadline" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "rentalStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationDeposit" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "verificationStatus" "DepositVerificationStatus" NOT NULL DEFAULT 'AWAITING_EVIDENCE',
    "paymentInstructions" TEXT NOT NULL,

    CONSTRAINT "ReservationDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvidence" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storedPath" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "PaymentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "method" TEXT,
    "amount" INTEGER,
    "refundedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "renterUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),
    "moderatedById" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "reviewedById" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "relatedBookingId" TEXT,
    "relatedViewingId" TEXT,
    "relatedPropertyId" TEXT,
    "relatedEvidenceId" TEXT,
    "relatedReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "details" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "PartnerApplication_userId_submittedAt_idx" ON "PartnerApplication"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_propertyId_key" ON "Favorite"("userId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_propertyId_renterUserId_key" ON "Conversation"("propertyId", "renterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationDeposit_bookingId_key" ON "ReservationDeposit"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_bookingId_key" ON "Refund"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_renterUserId_fkey" FOREIGN KEY ("renterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_renterUserId_fkey" FOREIGN KEY ("renterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationDeposit" ADD CONSTRAINT "ReservationDeposit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvidence" ADD CONSTRAINT "PaymentEvidence_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_renterUserId_fkey" FOREIGN KEY ("renterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentInquiry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "renterUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentMessage" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PaymentMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentInquiry_bookingId_key" ON "PaymentInquiry"("bookingId");

ALTER TABLE "PaymentInquiry" ADD CONSTRAINT "PaymentInquiry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentInquiry" ADD CONSTRAINT "PaymentInquiry_renterUserId_fkey" FOREIGN KEY ("renterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMessage" ADD CONSTRAINT "PaymentMessage_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "PaymentInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentMessage" ADD CONSTRAINT "PaymentMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
