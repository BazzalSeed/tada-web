import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Single-host consolidation: the app + auth live on the apex gettada.app.
      // Anything hitting the app subdomain is bounced to the apex (same path), so
      // sign-in never starts on a host that isn't the OAuth callback host — which
      // is what caused the cross-subdomain cookie pain. Temporary (307) while we
      // settle in, so it stays trivially reversible.
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.gettada.app" }],
        destination: "https://gettada.app/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
