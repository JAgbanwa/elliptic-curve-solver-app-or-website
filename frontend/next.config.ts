import type { NextConfig } from "next";

const FLASK = process.env.FLASK_INTERNAL_URL ?? "http://127.0.0.1:5001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy the full Flask app page
      {
        source: "/proxy-app",
        destination: `${FLASK}/app`,
      },
      // Proxy all API calls
      {
        source: "/api/:path*",
        destination: `${FLASK}/api/:path*`,
      },
      // Proxy Flask static assets (css/js already versioned)
      {
        source: "/static/:path*",
        destination: `${FLASK}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
