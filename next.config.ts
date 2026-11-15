import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  // Keep the team's curated AGENTS.md intact when running the dev server.
  agentRules: false,
  turbopack: { root: process.cwd() },
};
export default config;
