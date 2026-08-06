import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The parent package has its own lockfile; pin the workspace root here.
  turbopack: { root: __dirname },
  // Keep Next's dev badge away from the inspector's bottom-left launcher.
  devIndicators: { position: "bottom-right" },
  // Lets the inspector build vscode://file/… deep links (editor prop).
  env: { NEXT_PUBLIC_PROJECT_ROOT: __dirname },
};

export default nextConfig;
