import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  dts: true,
  sourcemap: true,
  target: "es2020" as const,
  external: ["react", "react-dom"],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.tsx" },
    clean: true,
    // Next.js App Router consumers can import the component directly from a
    // server layout file; the directive marks the whole bundle as client-only.
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    // No "use client" — the hook component renders an inline <script> and
    // must stay usable from server components (root layout, _document).
    entry: { hook: "src/hook.tsx" },
    clean: false,
  },
]);
