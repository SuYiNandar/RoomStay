export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "RS";
}

export function publicUser(user, capability = null) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    isPartner: capability?.status === "APPROVED",
    partnerStatus: capability?.status ?? "NONE",
  };
}

export function applicationJson(application) {
  if (!application) return null;
  return {
    id: application.id,
    userId: application.userId,
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    idDocumentName: application.idDocumentName,
    idDocumentUrl: `/api/partner-applications/${application.id}/documents/id`,
    idDocumentType: application.idDocumentType,
    ownershipDocumentName: application.ownershipDocumentName,
    ownershipDocumentUrl: `/api/partner-applications/${application.id}/documents/ownership`,
    ownershipDocumentType: application.ownershipDocumentType,
    note: application.note,
    status: application.status,
    submittedAt: application.submittedAt.toISOString(),
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    rejectionReason: application.rejectionReason,
    suspendedAt: application.suspendedAt?.toISOString() ?? null,
    suspensionReason: application.suspensionReason,
    suspendedBy: application.suspendedById,
    unsuspendedAt: application.unsuspendedAt?.toISOString() ?? null,
  };
}

function photoJson(photo) {
  return { src: photo.src, alt: photo.alt, name: photo.name, type: photo.type };
}

export function listingJson(property) {
  return {
    id: property.id,
    partnerUserId: property.partnerUserId,
    title: property.title,
    propertyType: property.propertyType,
    monthlyRent: property.monthlyRent,
    location: property.location,
    buildingName: property.buildingName,
    fullAddress: property.fullAddress,
    area: property.area,
    province: property.province,
    description: property.description,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    sizeSqm: property.sizeSqm,
    facilities: property.facilities,
    photos: (property.photos ?? []).map(photoJson),
    houseRules: property.houseRules,
    listingStatus: property.listingStatus,
    roomStatus: property.roomStatus,
    popular: property.popular,
    createdAt: property.createdAt.toISOString(),
    updatedAt: property.updatedAt.toISOString(),
    submittedAt: property.submittedAt?.toISOString() ?? null,
    reviewedAt: property.reviewedAt?.toISOString() ?? null,
    rejectionReason: property.rejectionReason,
  };
}

export function publicProperty(property, extras = {}) {
  const photos = property.photos ?? [];
  const visibleReviews = extras.reviews ?? [];
  const ratingTotal = visibleReviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    id: property.id,
    title: property.title,
    location: property.location,
    buildingName: property.buildingName,
    fullAddress: property.fullAddress,
    area: property.area,
    province: property.province,
    price: property.monthlyRent,
    monthlyRent: property.monthlyRent,
    image: photos[0]?.src ?? null,
    imageAlt: photos[0]?.alt ?? property.title,
    images: photos.map((photo) => ({ src: photo.src, alt: photo.alt })),
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    size: property.sizeSqm,
    propertyType: property.propertyType,
    facilities: property.facilities,
    description: property.description,
    owner: property.partner ? { name: property.partner.fullName, initials: initials(property.partner.fullName) } : null,
    availableNow: property.roomStatus === "AVAILABLE",
    roomStatus: property.roomStatus,
    listingStatus: property.listingStatus,
    houseRules: property.houseRules,
    popular: property.popular,
    partnerUserId: property.partnerUserId,
    rating: visibleReviews.length ? Math.round((ratingTotal / visibleReviews.length) * 10) / 10 : 0,
    reviewCount: visibleReviews.length,
    reviews: visibleReviews.map(reviewJson),
  };
}

export function evidenceJson(evidence) {
  if (!evidence) return null;
  return {
    id: evidence.id,
    bookingId: evidence.bookingId,
    fileName: evidence.fileName,
    fileType: evidence.fileType,
    fileUrl: evidence.storedPath ? `/api/evidence/${evidence.id}/file` : null,
    note: evidence.note,
    uploadedAt: evidence.uploadedAt.toISOString(),
    status: evidence.status,
    verifiedAt: evidence.verifiedAt?.toISOString() ?? null,
    verifiedBy: evidence.verifiedById,
    rejectedAt: evidence.rejectedAt?.toISOString() ?? null,
    rejectionReason: evidence.rejectionReason,
  };
}

export function reviewJson(review) {
  return {
    id: review.id,
    bookingId: review.bookingId,
    renterUserId: review.renterUserId,
    renterName: review.renter?.fullName ?? "Renter",
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    createdAt: review.createdAt.toISOString(),
    moderatedAt: review.moderatedAt?.toISOString() ?? null,
    moderatedBy: review.moderatedById,
  };
}

export function bookingJson(booking) {
  const latestEvidence = [...(booking.evidence ?? [])].sort((a, b) => b.uploadedAt - a.uploadedAt)[0] ?? null;
  return {
    id: booking.id,
    propertyId: booking.propertyId,
    partnerUserId: booking.property?.partnerUserId ?? null,
    propertyTitle: booking.property?.title ?? "",
    propertyLocation: booking.property?.location ?? "",
    monthlyRent: booking.monthlyRent,
    renterUserId: booking.renterUserId,
    renterName: booking.renter?.fullName ?? "",
    requestedMoveInDate: booking.requestedMoveInDate,
    message: booking.message,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
    depositAmount: booking.depositAmount,
    paymentDeadline: booking.paymentDeadline?.toISOString() ?? null,
    approvedAt: booking.approvedAt?.toISOString() ?? null,
    declinedAt: booking.declinedAt?.toISOString() ?? null,
    declineReason: booking.declineReason,
    rentalStartedAt: booking.rentalStartedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    roomStatus: booking.property?.roomStatus ?? null,
    deposit: booking.deposit ? {
      amount: booking.deposit.amount,
      deadline: booking.deposit.deadline.toISOString(),
      verificationStatus: booking.deposit.verificationStatus,
      paymentInstructions: booking.deposit.paymentInstructions,
    } : null,
    evidence: evidenceJson(latestEvidence),
    refund: booking.refund ? {
      status: booking.refund.status,
      method: booking.refund.method,
      amount: booking.refund.amount,
      refundedAt: booking.refund.refundedAt?.toISOString() ?? null,
      recordedAt: booking.refund.recordedAt.toISOString(),
      note: booking.refund.note,
    } : null,
    review: booking.review ? reviewJson(booking.review) : null,
  };
}

export function viewingJson(viewing) {
  return {
    id: viewing.id,
    propertyId: viewing.propertyId,
    partnerUserId: viewing.property?.partnerUserId ?? null,
    propertyTitle: viewing.property?.title ?? "",
    propertyLocation: viewing.property?.location ?? "",
    renterId: viewing.renterId,
    renterName: viewing.renter?.fullName ?? "",
    viewingDate: viewing.viewingDate,
    viewingTime: viewing.viewingTime,
    message: viewing.message,
    status: viewing.status,
    createdAt: viewing.createdAt.toISOString(),
    updatedAt: viewing.updatedAt.toISOString(),
    partnerSuggestedDate: viewing.partnerSuggestedDate,
    partnerSuggestedTime: viewing.partnerSuggestedTime,
    partnerMessage: viewing.partnerMessage,
    declineReason: viewing.declineReason,
  };
}

export function conversationJson(conversation, viewerId) {
  const messages = conversation.messages ?? [];
  const last = messages[messages.length - 1] ?? null;
  const unread = messages.filter((message) => !message.read && message.senderId !== viewerId).length;
  return {
    id: conversation.id,
    propertyId: conversation.propertyId,
    propertyTitle: conversation.property?.title ?? "",
    renterUserId: conversation.renterUserId,
    renterName: conversation.renter?.fullName ?? "",
    partnerUserId: conversation.partnerUserId,
    partnerName: conversation.partner?.fullName ?? "",
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessage: last ? messageJson(last) : null,
    unread,
  };
}

export function paymentMessageJson(message) {
  return {
    id: message.id,
    inquiryId: message.inquiryId,
    senderId: message.senderId,
    senderName: message.sender?.fullName ?? "",
    senderRole: message.senderRole,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    read: message.read,
  };
}

export function paymentInquiryJson(inquiry) {
  if (!inquiry) return null;
  return {
    id: inquiry.id,
    bookingId: inquiry.bookingId,
    propertyTitle: inquiry.booking?.property?.title ?? "",
    renterUserId: inquiry.renterUserId,
    renterName: inquiry.renter?.fullName ?? "",
    partnerUserId: inquiry.booking?.property?.partnerUserId ?? "",
    partnerName: inquiry.booking?.property?.partner?.fullName ?? "",
    bookingStatus: inquiry.booking?.status ?? null,
    evidence: evidenceJson(inquiry.booking?.evidence?.[0] ?? null),
    updatedAt: inquiry.updatedAt.toISOString(),
    messages: (inquiry.messages ?? []).map(paymentMessageJson),
  };
}

export function messageJson(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderType: message.senderType,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    read: message.read,
  };
}

export function reportJson(report) {
  return {
    id: report.id,
    reporterUserId: report.reporterUserId,
    reporterName: report.reporter?.fullName ?? "",
    targetType: report.targetType,
    targetId: report.targetId,
    targetLabel: report.targetLabel,
    reason: report.reason,
    description: report.description,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    resolutionNote: report.resolutionNote,
  };
}

export function notificationJson(notification) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    relatedBookingId: notification.relatedBookingId,
    relatedViewingId: notification.relatedViewingId,
    relatedPropertyId: notification.relatedPropertyId,
    relatedEvidenceId: notification.relatedEvidenceId,
    relatedReportId: notification.relatedReportId,
    createdAt: notification.createdAt.toISOString(),
    read: notification.read,
  };
}

export function auditJson(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    actorId: entry.actorId,
    actorLabel: entry.actorLabel,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetName: entry.targetName,
    details: entry.details,
  };
}
