import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@98plus/shared"],

  webpack: (config) => {
    config.resolve.alias["@98plus/shared"] = path.resolve(
      __dirname,
      "../../packages/shared/src"
    );

    return config;
  },
};

export default nextConfig;