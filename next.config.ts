import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev HMR when opening the app via LAN IP (see terminal warning).
  allowedDevOrigins: ["192.168.0.199"],
};

export default nextConfig;
