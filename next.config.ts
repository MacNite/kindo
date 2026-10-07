import type { NextConfig } from "next";

const config: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
