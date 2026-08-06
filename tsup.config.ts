import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.tsx" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom"],
  // Next.js App Router consumers can import the component directly from a
  // server layout file; the directive marks the whole bundle as client-only.
  banner: { js: '"use client";' },
});
