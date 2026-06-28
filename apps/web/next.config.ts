import path from "path";
import type { NextConfig } from "next";

const phase12DiagEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_PHASE12_DIAG === "1";

const phase12TelegramFrameAncestorsCsp =
  "frame-ancestors 'self' https://web.telegram.org https://telegram.org https://*.telegram.org http://localhost:* http://127.0.0.1:* https://*.trycloudflare.com";

const nextConfig: NextConfig = {
  output: "standalone",

  transpilePackages: ["@98plus/shared"],

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  async headers() {
    if (!phase12DiagEnabled) {
      return [];
    }
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: phase12TelegramFrameAncestorsCsp,
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.resolve.alias["@98plus/shared"] = path.resolve(
      __dirname,
      "../../packages/shared/src"
    );

    return config;
  },
};

export default nextConfig;
