import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The parent package has its own lockfile; pin the workspace root here.
  turbopack: { root: __dirname },
  // Keep Next's dev badge away from the inspector's bottom-left cluster.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
