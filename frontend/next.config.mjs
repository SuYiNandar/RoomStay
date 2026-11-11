const apiOrigin = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://roomstay-rcxc.onrender.com";
const apiUrl = new URL(apiOrigin);

/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "localhost", "127.0.0.1"],
  images: {
    remotePatterns: [{ protocol: apiUrl.protocol.replace(":", ""), hostname: apiUrl.hostname, port: apiUrl.port, pathname: "/uploads/listings/**" }],
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
