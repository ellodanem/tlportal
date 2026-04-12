import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev HMR when opening the app via LAN IP (see terminal warning).
  allowedDevOrigins: ["192.168.0.199"],
  // Logo upload uses a Server Action with multipart body; default limit (~1MB) rejects before `uploadBrandingLogo` runs.
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
