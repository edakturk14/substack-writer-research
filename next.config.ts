import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next 16.4 can reload forever after restoring a dev cache with a tab open.
  // Upstream: vercel/next.js#100267. Keep production build caching enabled.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
