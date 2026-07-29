import { execSync } from "child_process";
import path from "path";
import type { NextConfig } from "next";

const phase12DiagRaw = process.env.NEXT_PUBLIC_PHASE12_DIAG ?? "";
const phase12BuildTimestamp =
  process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? new Date().toISOString();

/** Resolve the commit SHA from CI env, else from git HEAD (never hardcoded). */
function resolveBuildCommit(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BUILD_COMMIT ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    "";
  if (fromEnv.trim()) return fromEnv.trim();
  try {
    return execSync("git rev-parse HEAD", {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const phase12BuildCommit = resolveBuildCommit();
const phase12BuildEnv =
  process.env.NEXT_PUBLIC_BUILD_ENV ??
  process.env.RAILWAY_ENVIRONMENT_NAME ??
  process.env.NODE_ENV ??
  "unknown";

const phase12DiagEnabled =
  process.env.NODE_ENV !== "production" || phase12DiagRaw === "1";

console.log("[phase12-build-config]", {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_PHASE12_DIAG: phase12DiagRaw || null,
  phase12DiagEnabled,
  NEXT_PUBLIC_BUILD_TIMESTAMP: phase12BuildTimestamp,
  NEXT_PUBLIC_BUILD_COMMIT: phase12BuildCommit || null,
  NEXT_PUBLIC_BUILD_ENV: phase12BuildEnv,
});

const phase12TelegramFrameAncestorsCsp =
  "frame-ancestors 'self' https://web.telegram.org https://telegram.org https://*.telegram.org http://localhost:* http://127.0.0.1:* https://*.trycloudflare.com";

const nextConfig: NextConfig = {
  output: "standalone",

  env: {
    NEXT_PUBLIC_PHASE12_DIAG: phase12DiagRaw,
    NEXT_PUBLIC_BUILD_TIMESTAMP: phase12BuildTimestamp,
    NEXT_PUBLIC_BUILD_COMMIT: phase12BuildCommit,
    NEXT_PUBLIC_BUILD_ENV: phase12BuildEnv,
    NEXT_PUBLIC_WHAT_TRANSITION_DIAG:
      process.env.NEXT_PUBLIC_WHAT_TRANSITION_DIAG ?? "",
    NEXT_PUBLIC_DEV_AUTH_ENABLED:
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED ?? "",
  },

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
