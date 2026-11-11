const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
/** @type {import("next").NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [{ protocol: apiOrigin.protocol.slice(0, -1), hostname: apiOrigin.hostname, port: apiOrigin.port, pathname: "/uploads/listings/**" }],
        dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    },
};
export default nextConfig;
