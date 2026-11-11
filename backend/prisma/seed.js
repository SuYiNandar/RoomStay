import "dotenv/config";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";

const password = () => bcrypt.hash("password123", 10);

export async function seed(db) {
  const passwordHash = await password();
  const users = [
    { id: "user-admin", fullName: "RoomStay Admin", email: "admin@roomstay.test", role: "ADMIN", phone: "0800000001" },
    { id: "user-renter", fullName: "Mina Renter", email: "renter@roomstay.test", role: "USER", phone: "0800000002" },
    { id: "user-partner", fullName: "Arun Partner", email: "partner@roomstay.test", role: "USER", phone: "0800000003" },
    { id: "user-applicant", fullName: "Nalin Applicant", email: "applicant@roomstay.test", role: "USER", phone: "0800000004" },
  ];
  for (const user of users) {
    await db.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  await db.partnerApplication.upsert({
    where: { id: "app-partner" },
    update: {},
    create: {
      id: "app-partner",
      userId: "user-partner",
      fullName: "Arun Partner",
      email: "partner@roomstay.test",
      phone: "0800000003",
      idDocumentName: "national-id.pdf",
      idDocumentType: "application/pdf",
      ownershipDocumentName: "ownership.pdf",
      ownershipDocumentType: "application/pdf",
      note: "Approved demo partner.",
      status: "APPROVED",
      reviewedAt: new Date("2026-09-02T00:00:00.000Z"),
    },
  });

  await db.partnerApplication.upsert({
    where: { id: "app-applicant" },
    update: {},
    create: {
      id: "app-applicant",
      userId: "user-applicant",
      fullName: "Nalin Applicant",
      email: "applicant@roomstay.test",
      phone: "0800000004",
      idDocumentName: "id-card.pdf",
      idDocumentType: "application/pdf",
      ownershipDocumentName: "title-deed.pdf",
      ownershipDocumentType: "application/pdf",
      note: "Waiting for admin review.",
      status: "PENDING",
    },
  });

  const properties = [
    {
      id: "cozy-condo",
      title: "Cozy Condo Near BTS",
      location: "Ari, Bangkok",
      area: "Ari",
      province: "Bangkok",
      monthlyRent: 10000,
      propertyType: "Condo",
      bedrooms: 1,
      bathrooms: 1,
      sizeSqm: 30,
      description: "A cozy condo a short walk from BTS Ari. Suitable for students and working professionals.",
      facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Elevator"],
      roomStatus: "AVAILABLE",
      popular: true,
      photo: "/images/home/cozy-condo.jpg",
    },
    {
      id: "modern-studio",
      title: "Modern Studio",
      location: "Phahon Yothin, Bangkok",
      area: "Phahon Yothin",
      province: "Bangkok",
      monthlyRent: 8500,
      propertyType: "Apartment",
      bedrooms: 0,
      bathrooms: 1,
      sizeSqm: 25,
      description: "A bright studio apartment near Phahon Yothin.",
      facilities: ["Wi-Fi", "Air Conditioner", "Furnished"],
      roomStatus: "UNAVAILABLE",
      popular: true,
      photo: "/images/home/modern-studio.jpg",
    },
    { id: "luxury-dormitory", title: "Luxury Dormitory", location: "Asoke, Bangkok", area: "Asoke", province: "Bangkok", monthlyRent: 18000, propertyType: "Dormitory", bedrooms: 1, bathrooms: 1, sizeSqm: 28, description: "A premium dormitory-style room in Asoke with hotel-like facilities.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Parking", "Security / CCTV", "Swimming Pool", "Fitness / Gym", "Balcony"], roomStatus: "AVAILABLE", popular: true, photo: "/images/home/luxury-room.jpg" },
    { id: "garden-house", title: "Garden House", location: "Ladprao, Bangkok", area: "Ladprao", province: "Bangkok", monthlyRent: 15000, propertyType: "House", bedrooms: 2, bathrooms: 1, sizeSqm: 48, description: "A quiet two-bedroom house with a private garden in Ladprao.", facilities: ["Wi-Fi", "Air Conditioner", "Parking", "Balcony", "Pet friendly"], roomStatus: "AVAILABLE", popular: true, photo: "/images/home/garden-house.jpg" },
    { id: "spacious-townhouse", title: "Spacious Townhouse", location: "Chatuchak, Bangkok", area: "Chatuchak", province: "Bangkok", monthlyRent: 12000, propertyType: "Townhouse", bedrooms: 1, bathrooms: 1, sizeSqm: 20, description: "A compact townhouse near Chatuchak weekend market.", facilities: ["Air Conditioner", "Furnished", "Elevator", "Balcony"], roomStatus: "UNAVAILABLE", popular: false, photo: "/images/search/spacious-apartment.jpg" },
    { id: "duplex-loft-one-bedroom", title: "Duplex Loft One Bedroom", location: "Sukhumvit, Bangkok", area: "Sukhumvit", province: "Bangkok", monthlyRent: 15000, propertyType: "Duplex / Loft", bedrooms: 1, bathrooms: 1, sizeSqm: 35, description: "A stylish duplex loft in Sukhumvit with a mezzanine bedroom.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Parking", "Elevator", "Security / CCTV", "Swimming Pool", "Fitness / Gym"], roomStatus: "UNAVAILABLE", popular: false, photo: "/images/search/condo-one-bedroom.jpg" },
    { id: "sathon-sky-condo", title: "Skyline Family Condo", location: "Sathon, Bangkok", area: "Sathon", province: "Bangkok", monthlyRent: 24000, propertyType: "Condo", bedrooms: 3, bathrooms: 2, sizeSqm: 68, description: "A spacious three-bedroom family condo in Sathon.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Parking", "Elevator", "Security / CCTV", "Swimming Pool", "Fitness / Gym"], roomStatus: "AVAILABLE", popular: false, photo: "/images/search/condo-one-bedroom.jpg" },
    { id: "bangna-city-apartment", title: "City View Two Bedroom Apartment", location: "Bang Na, Bangkok", area: "Bang Na", province: "Bangkok", monthlyRent: 13500, propertyType: "Apartment", bedrooms: 2, bathrooms: 1, sizeSqm: 42, description: "A practical two-bedroom apartment in Bang Na.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Elevator", "Washing Machine"], roomStatus: "AVAILABLE", popular: false, photo: "/images/search/spacious-apartment.jpg" },
    { id: "rangsit-campus-dorm", title: "Campus Studio Dorm", location: "Rangsit, Bangkok", area: "Rangsit", province: "Bangkok", monthlyRent: 6500, propertyType: "Dormitory", bedrooms: 0, bathrooms: 1, sizeSqm: 22, description: "An affordable studio dorm near the Rangsit university area.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Security / CCTV", "Washing Machine"], roomStatus: "AVAILABLE", popular: false, photo: "/images/home/modern-studio.jpg" },
    { id: "thonburi-family-house", title: "Thonburi Family House", location: "Thonburi, Bangkok", area: "Thonburi", province: "Bangkok", monthlyRent: 32000, propertyType: "House", bedrooms: 4, bathrooms: 3, sizeSqm: 120, description: "A large four-bedroom detached house in Thonburi.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Parking", "Security / CCTV", "Balcony"], roomStatus: "UNAVAILABLE", popular: false, photo: "/images/home/garden-house.jpg" },
    { id: "ekkamai-garden-townhouse", title: "Ekkamai Garden Townhouse", location: "Ekkamai, Bangkok", area: "Ekkamai", province: "Bangkok", monthlyRent: 25000, propertyType: "Townhouse", bedrooms: 3, bathrooms: 2, sizeSqm: 85, description: "A three-story townhouse in Ekkamai with a small private garden.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Parking", "Security / CCTV", "Balcony"], roomStatus: "UNAVAILABLE", popular: false, photo: "/images/home/cozy-condo.jpg" },
    { id: "rama4-industrial-loft", title: "Industrial Loft Near Rama 4", location: "Rama 4, Bangkok", area: "Rama 4", province: "Bangkok", monthlyRent: 19500, propertyType: "Duplex / Loft", bedrooms: 2, bathrooms: 2, sizeSqm: 58, description: "An industrial-style loft near Rama 4 with high ceilings.", facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Elevator", "Security / CCTV", "Fitness / Gym"], roomStatus: "UNAVAILABLE", popular: false, photo: "/images/home/luxury-room.jpg" },
    // Fictional university-area samples; prices, amenities and photos are illustrative.
    {
      id: "rsu-area-apartment",
      title: "Rangsit University Area Apartment",
      location: "Rangsit University area, Lak Hok, Pathum Thani",
      area: "Lak Hok", province: "Pathum Thani",
      monthlyRent: 5200, propertyType: "Apartment", bedrooms: 0, bathrooms: 1, sizeSqm: 22,
      description: "Demo/sample listing, not a verified rental. A budget studio imagined in the Rangsit University area, with a study desk and shared laundry for student routines. Photos and amenities are illustrative; no distance or availability is verified.",
      facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Washing Machine"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/home/modern-studio.jpg",
    },
    {
      id: "rsu-campus-studio",
      title: "RSU Campus Studio",
      location: "Rangsit University area, Lak Hok, Pathum Thani",
      area: "Lak Hok", province: "Pathum Thani",
      monthlyRent: 6200, propertyType: "Dormitory", bedrooms: 0, bathrooms: 1, sizeSqm: 28,
      description: "Demo/sample listing, not a verified rental. A larger furnished studio imagined for a Rangsit University student, with a balcony and space for a reading corner. Photos and amenities are illustrative; this is not university-affiliated accommodation.",
      facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Balcony", "Security / CCTV"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/home/luxury-room.jpg",
    },
    {
      id: "rsu-university-dormitory",
      title: "Rangsit University Area Dormitory",
      location: "Rangsit University area, Lak Hok, Pathum Thani",
      area: "Lak Hok", province: "Pathum Thani",
      monthlyRent: 5000, propertyType: "Dormitory", bedrooms: 1, bathrooms: 1, sizeSqm: 20,
      description: "Demo/sample listing, not a verified rental. A simple fan-cooled dorm room imagined in Lak Hok for a student on a smaller budget, with a private bathroom and shared laundry. Photos and amenities are illustrative; this is not an official Rangsit University dormitory.",
      facilities: ["Wi-Fi", "Furnished", "Security / CCTV", "Washing Machine"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/home/modern-studio.jpg",
    },
    {
      id: "bu-rangsit-condo",
      title: "Bangkok University Rangsit Area Condo",
      location: "Bangkok University (Rangsit campus) area, Khlong Nueng, Pathum Thani",
      area: "Khlong Nueng", province: "Pathum Thani",
      monthlyRent: 9500, propertyType: "Condo", bedrooms: 1, bathrooms: 1, sizeSqm: 35,
      description: "Demo/sample listing, not a verified rental. A one-bedroom condo imagined in the Bangkok University Rangsit campus area, with a separate living space and shared fitness facilities. Photos and amenities are illustrative; no commute time is verified.",
      facilities: ["Air Conditioner", "Furnished", "Elevator", "Security / CCTV", "Fitness / Gym", "Swimming Pool"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/home/cozy-condo.jpg",
    },
    {
      id: "bu-campus-apartment",
      title: "BU Campus Area Apartment",
      location: "Bangkok University (Rangsit campus) area, Khlong Nueng, Pathum Thani",
      area: "Khlong Nueng", province: "Pathum Thani",
      monthlyRent: 7500, propertyType: "Apartment", bedrooms: 2, bathrooms: 1, sizeSqm: 46,
      description: "Demo/sample listing, not a verified rental. A two-bedroom apartment imagined for classmates sharing near the Bangkok University Rangsit campus area, with a shared living space and laundry. Photos and amenities are illustrative; this is not university-affiliated accommodation.",
      facilities: ["Wi-Fi", "Air Conditioner", "Furnished", "Washing Machine", "Parking"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/search/spacious-apartment.jpg",
    },
    {
      id: "bu-university-view-house",
      title: "University View House — BU Rangsit Area",
      location: "Bangkok University (Rangsit campus) area, Khlong Nueng, Pathum Thani",
      area: "Khlong Nueng", province: "Pathum Thani",
      monthlyRent: 14500, propertyType: "House", bedrooms: 3, bathrooms: 2, sizeSqm: 96,
      description: "Demo/sample listing, not a verified rental. A three-bedroom house imagined for a small household in the Bangkok University Rangsit campus area, with space for studying together and off-street parking. The name, photos and amenities are illustrative; no campus view is verified.",
      facilities: ["Air Conditioner", "Parking", "Balcony", "Washing Machine"],
      roomStatus: "AVAILABLE", popular: false, photo: "/images/home/garden-house.jpg",
    },
  ];

  for (const property of properties) {
    const existing = await db.property.findUnique({ where: { id: property.id } });
    if (existing) {
      // Backfill the demo pet policy without overwriting other listing edits.
      if (property.facilities.includes("Pet friendly") && !existing.facilities.includes("Pet friendly")) {
        await db.property.update({
          where: { id: property.id },
          data: { facilities: { push: "Pet friendly" } },
        });
      }
      continue;
    }
    await db.property.create({
      data: {
        id: property.id,
        partnerUserId: "user-partner",
        title: property.title,
        propertyType: property.propertyType,
        monthlyRent: property.monthlyRent,
        location: property.location,
        area: property.area,
        province: property.province,
        description: property.description,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        sizeSqm: property.sizeSqm,
        facilities: property.facilities,
        listingStatus: "PUBLISHED",
        roomStatus: property.roomStatus,
        popular: property.popular,
        reviewedAt: new Date("2026-09-03T00:00:00.000Z"),
        photos: {
          create: [{ name: "cover.jpg", type: "image/jpeg", src: property.photo, alt: property.title, sortOrder: 0 }],
        },
      },
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ensureDatabase } = await import("../src/ensure-database.js");
  const database = await ensureDatabase();
  const { prisma } = await import("../src/db.js");
  await seed(prisma);
  await prisma.$disconnect();
  await database.stop();
}
