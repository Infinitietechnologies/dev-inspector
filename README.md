# next-dev-inspector

[![CI](https://img.shields.io/github/actions/workflow/status/Infinitietechnologies/dev-inspector/ci.yml?branch=master&label=CI)](https://github.com/Infinitietechnologies/dev-inspector/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/next-dev-inspector)](https://www.npmjs.com/package/next-dev-inspector)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Infinitietechnologies/dev-inspector/blob/master/LICENSE)

Dev-only floating inspector for **Next.js + React 18/19**. Hover or click any
DOM element to see **which source file (with line number) rendered it**, open
it straight in your editor, view live props and store state, reverse-lookup
i18n keys from rendered text, flash component re-renders, and copy the whole
context for your AI assistant.

Zero runtime dependencies. Never ships to production when gated correctly
(see [Production safety](#production-safety-dead-code-elimination)).

![Hover: component name, size, and file:line chip](https://raw.githubusercontent.com/Infinitietechnologies/dev-inspector/master/docs/screenshot-hover.png)

![Locked panel: source chain with file:line, i18n key match, tabs](https://raw.githubusercontent.com/Infinitietechnologies/dev-inspector/master/docs/screenshot-panel.png)

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Production safety (dead-code elimination)](#production-safety-dead-code-elimination)
- [Controls](#controls)
- [Component browser and panel layout](#component-browser-and-panel-layout)
- [Props change tracking](#props-change-tracking)
- [True re-render flashes (optional hook)](#true-re-render-flashes-optional-hook)
- [Copy for AI](#copy-for-ai)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Demo app](#demo-app)
- [Development](#development)
- [Project status](#project-status)

## Features

**Find the source**

- Hover highlight with a `<Component> · file.tsx:42` chip and element dimensions
- Click to lock the full owner-component chain, each entry with `file:line`
- Click any entry to open that file in your editor at the exact line
- Box-model overlay (margin/padding bands) like browser devtools

**Understand the state**

- **Props** tab — live props of any component in the chain (compact JSON tree)
- **Props change tracking** — before/after previews for the latest observed
  changes, including added/removed props and changed object/function references;
  pause/resume sampling or reset the comparison baseline
- **State** tab — snapshot of your store; Redux, Zustand, Jotai, anything —
  you supply the getter
- **i18n reverse lookup** — which translation key produced this rendered text
  (i18next-shaped resources)
- **History** tab — revisit the last 8 inspected elements

**See it move**

- **Re-render flasher** — with the optional [early hook](#true-re-render-flashes-optional-hook),
  outlines components as they re-render, labeled `Clock ×3`; without it, falls
  back to flashing raw DOM mutations

**Work fast**

- **Component browser** — search component names, step through matching
  instances, and navigate a collapsible owner tree to select source and props
- **Dockable, resizable panel** — float beside the launcher or dock left/right;
  drag the panel edge to resize, with position and width saved locally

- **Copy for AI** — one click copies chain + paths + props + i18n keys, ready
  to paste into Claude Code, Cursor, or any coding assistant
- Alt+hover quick inspect, arrow-key DOM walking, configurable hotkeys
- Single draggable launcher button that expands into the action menu, position persisted to `localStorage`

## Requirements

| | |
|---|---|
| React / ReactDOM | >= 18 (peer deps); best on 19 |
| Next.js | `next dev` — Turbopack and webpack (`--webpack`) both verified |
| Environment | Development builds only — relies on React's dev-only fiber internals |
| Runtime deps | None |

## Quick start

```sh
npm i -D next-dev-inspector
```

Mount it anywhere in your client tree:

```tsx
import DevInspector from "next-dev-inspector";

<DevInspector />
```

Then hold <kbd>Alt</kbd> and hover anything — or press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> and click. For real projects,
use the env-gated mount below so the package never reaches production bundles.

## Production safety (dead-code elimination)

The inspector reads React's dev-only fiber internals (`_debugStack`,
`_debugOwner`), so it only works in development — and it should be *compiled
out* of production bundles. Gate it on constants your bundler can statically
evaluate:

### App Router

```tsx
// app/dev-inspector.tsx
"use client";
import dynamic from "next/dynamic";

const Inspector = dynamic(() => import("next-dev-inspector"), { ssr: false });

export function DevInspectorMount() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_DEV_INSPECTOR !== "true"
  ) {
    return null;
  }
  return <Inspector />;
}
```

Render `<DevInspectorMount />` at the end of your root layout's `<body>`.

### Pages Router

```tsx
// pages/_app.tsx
import dynamic from "next/dynamic";

const DevInspector =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_INSPECTOR === "true"
    ? dynamic(() => import("next-dev-inspector"), { ssr: false })
    : null;

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      {DevInspector && <DevInspector />}
    </>
  );
}
```

Run with the flag:

```sh
NEXT_PUBLIC_DEV_INSPECTOR=true next dev
```

Because both conditions are build-time constants, the `import()` — and the
whole package — is eliminated from production output.

## Controls

| Action | Effect |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | Arm / disarm the inspector (configurable via `hotkey`) |
| <kbd>Alt</kbd> + hover | Quick inspect without arming (configurable via `hoverModifier`) |
| Click (while inspecting) | Lock the details panel on that element |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Walk the DOM (parent / first child / siblings) while locked |
| <kbd>Esc</kbd> | Close panel, disarm |
| Wrench button | Open / close the action menu — also the drag handle |
| Crosshair button (in menu) | Arm / disarm the inspector |
| Zap button (in menu) | Toggle the re-render / DOM-update flasher |
| Source row click | Open that file in your editor |
| `{ }` icon on a row | Jump to that entry's Props tab |

## Component browser and panel layout

Open the wrench menu and choose **Browse components**, or use the **Tree** tab
after inspecting an element. Search is case-insensitive; **Previous** and
**Next** (or Enter / Shift+Enter in the search field) step through instances.
Hover a row to highlight its rendered element. Select a row to scroll to it,
then open **Source** or **Props** to inspect that component.

Expand/collapse rows to explore owners and their children. Focus a tree row
and use Up/Down to navigate, Left/Right to collapse/expand, or Enter to select.
Use **Refresh** after navigation, conditional rendering, or code edits.

The tree represents the owner chains of components with DOM elements in the
current document, including available Server Component debug metadata. It omits
components with no rendered element, iframe contents, shadow-root contents,
and the inspector's own UI. Large pages are capped at 5,000 DOM elements and
1,000 component instances, with a visible truncation notice.

Use the **Panel** selector to float or dock left/right. Drag the outside edge
(the left edge when docked right) to resize, or focus that edge and use
Left/Right. Width stays within the viewport. Layout is stored under
`<storageKey>:panel`; docking overlays the page without changing its layout.

## Props change tracking

The Props tab samples the selected component every 250 ms while open, without
requiring the early hook. It compares up to 200 own enumerable string-keyed
props using `Object.is` and retains the latest change until another change or
reset. Switching components or closing the tab starts a fresh comparison.
Nested mutations of the same object and changes between samples may be missed.
Before/after previews are truncated; identical previews can still represent
different object or function references. These are observed prop changes,
not proof of what caused a render.

## True re-render flashes (optional hook)

By default the Zap button flashes *DOM mutations* — a memoized re-render that
changes no DOM stays invisible. For true re-render tracking, React must see a
DevTools hook **before it loads**, which a widget rendered by React cannot
provide. So the package ships one as an inline script you mount yourself:

```tsx
// App Router — top of app/layout.tsx's <body> (it's a server-safe component)
import { DevInspectorHook } from "next-dev-inspector/hook";

<body>
  <DevInspectorHook />   {/* renders nothing in production */}
  {children}
</body>
```

```tsx
// Pages Router — pages/_document.tsx, inside <Head>
import { devInspectorHookScript } from "next-dev-inspector/hook";

{process.env.NODE_ENV === "development" && (
  <script dangerouslySetInnerHTML={{ __html: devInspectorHookScript }} />
)}
```

With the hook installed, flashes carry component names (`Clock ×3`) and fire
per re-render — the widget detects it automatically. If the real React
DevTools extension is present, the script piggybacks on its hook instead of
replacing it.

![Re-render flash with component name](https://raw.githubusercontent.com/Infinitietechnologies/dev-inspector/master/docs/screenshot-flash.png)

## Copy for AI

The locked panel's footer has a **Copy for AI** button that puts a compact,
paste-ready context block on the clipboard:

```
Inspected element (via next-dev-inspector):

Component chain (innermost first):
1. button — components/ProductCard.tsx:20
2. <ProductCard> — app/page.tsx:26
3. <Page> — (library / generated)

Props of <ProductCard>:
{ name: "Espresso", price: 2.5 }

i18n matches:
- product.add_to_cart (en) = "Add to cart"
```

Paste it into your AI assistant and it knows exactly which file and component
you're talking about. (`buildAiContext` / `serializeValue` are also exported
if you want the same block programmatically.)

## Configuration

All props are optional:

```tsx
<DevInspector
  enabled={true}
  hotkey="ctrl+shift+x"
  hoverModifier="alt"
  storageKey="dev-inspector-pos"
  zIndex={2147483000}
  colors={{ accent: "#7c3aed", accentLight: "#a78bfa", flash: "#f97316" }}
  editorEndpoint="/__nextjs_launch-editor"
  stackFramesEndpoint="/__nextjs_original-stack-frames"
  getI18nData={() => ({ data: i18n.store.data, language: i18n.language })}
  getStateSnapshot={() => store.getState()}
  stateLabel="Redux store"
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Render nothing when `false` (combine with env gating for DCE) |
| `hotkey` | `string` | `"ctrl+shift+x"` | Arm/disarm combo — modifiers + key joined with `+` |
| `hoverModifier` | `"alt" \| "ctrl" \| "meta" \| "shift" \| "none"` | `"alt"` | Held key that enables hover-inspect without arming; `"none"` disables |
| `storageKey` | `string` | `"dev-inspector-pos"` | `localStorage` key for the launcher-button position |
| `zIndex` | `number` | `2147483000` | Base z-index for all overlay layers |
| `colors` | `{ accent?, accentLight?, flash? }` | violet / orange | Palette overrides, hex `#rrggbb` |
| `editorEndpoint` | `string` | `"/__nextjs_launch-editor"` | GET endpoint that opens `file`/`line1`/`column1` in the editor |
| `editor` | `"vscode" \| "vscode-insiders" \| "cursor" \| "windsurf"` | — | Force an editor via its URL scheme instead of the dev server ([see below](#forcing-a-specific-editor)) |
| `projectRoot` | `string` | — | Absolute project root; needed by `editor` to absolutize relative source paths |
| `stackFramesEndpoint` | `string \| null` | `"/__nextjs_original-stack-frames"` | POST fallback resolver for webpack-dev frames; `null` disables |
| `getI18nData` | `() => { data, language? } \| null` | — | Enables i18n reverse lookup (see below) |
| `getStateSnapshot` | `() => unknown \| Promise<unknown>` | — | Enables the State tab (see below) |
| `stateLabel` | `string` | `"Store"` | Heading shown in the State tab |

### Store snapshots (`getStateSnapshot`)

The State tab appears only when you pass a getter. Any store works — sync or
async:

```tsx
// Redux (dynamic import keeps the store out of the widget's graph)
getStateSnapshot={async () => (await import("@/lib/redux/store")).store.getState()}

// Zustand
getStateSnapshot={() => useBoundStore.getState()}

// Jotai (with a store instance)
getStateSnapshot={() => Object.fromEntries(myAtoms.map(a => [a.debugLabel, store.get(a)]))}
```

### i18n reverse lookup (`getI18nData`)

Pass i18next-shaped resources (`{ [lng]: { [namespace]: nestedTree } }`) and
the current language:

```tsx
getI18nData={() => ({ data: i18n.store.data, language: i18n.language })}
```

When you lock an element, the Source tab lists translation keys whose value
matches its rendered text — exact matches first, then `{{interpolated}}`
values matched by static prefix.

### Forcing a specific editor

By default, clicking a source row asks the Next dev server to open the file,
and Next's `launch-editor` guesses the editor from running processes. Two ways
to pin it:

1. **Env var (no code)** — set `REACT_EDITOR` when starting the dev server;
   Next's launch-editor respects it:

   ```bash
   REACT_EDITOR=code next dev
   ```

2. **`editor` prop** — bypass the dev server entirely and open the editor's
   own URL scheme (`vscode://file/…:line:col`) from the browser. Relative
   source paths (Turbopack/webpack) need an absolute `projectRoot`, which you
   can inline at build time:

   ```js
   // next.config.mjs
   const nextConfig = {
     env: { NEXT_PUBLIC_PROJECT_ROOT: process.cwd() },
   };
   ```

   ```tsx
   <DevInspector
     editor="vscode" // or "vscode-insiders" | "cursor" | "windsurf"
     projectRoot={process.env.NEXT_PUBLIC_PROJECT_ROOT}
   />
   ```

   If a path can't be made absolute, the click falls back to the dev-server
   endpoint, so this is safe to leave on.

### Other dev servers

`editorEndpoint` and `stackFramesEndpoint` exist so non-Next dev servers can
be targeted (e.g. Vite's `/__open-in-editor`, with
`stackFramesEndpoint={null}`) — but Vite serves different source-map URLs and
this is untested territory. The package is Next-first.

## API reference

### `next-dev-inspector`

| Export | Kind | Purpose |
|---|---|---|
| `DevInspector` (also default) | component | The inspector widget |
| `buildAiContext(input)` | function | The "Copy for AI" text, programmatically |
| `serializeValue(value)` | function | The compact, cycle-safe value renderer it uses |
| `DevInspectorProps`, `DevInspectorColors`, `HoverModifier`, `AiContextInput`, `InspectedEntry`, `ResolvedLocation`, `ResolverOptions`, `RawStackFrame`, `I18nMatch`, `FlashEvent`, `BoxModel`, `BoxEdges`, `SourceMapPayload`, `OriginalPosition` | types | Public types |

### `next-dev-inspector/hook`

| Export | Kind | Purpose |
|---|---|---|
| `DevInspectorHook` (also default) | component | Server-safe inline `<script>` mount; renders nothing outside development |
| `devInspectorHookScript` | string | The raw script, for `_document` or custom injection |

The main bundle is marked `"use client"`; the hook bundle is not, so it can
be imported from server components.

## How it works

- **React 18/19 source metadata:** React 18 locations come from `_debugSource`;
  React 19 client locations come from `_debugStack`. App Router Server
  Components are recovered from React 19's `_debugInfo` records and their
  server stack frames. These fields exist only in development React.
- **Turbopack (`next dev`):** the widget fetches the chunk's sibling
  `<chunk>.js.map` and decodes it client-side (index maps with `sections[]`,
  `file:///` sources). The dev server's `POST /__nextjs_original-stack-frames`
  resolver is *not* used for browser chunk frames — it hangs on `http://` file
  URLs and returns identity mappings.
- **webpack (`next dev`):** `webpack-internal:///` frames fall back to the
  server resolver endpoint.
- **SSR / React Server Components:** `about://React/Server/` frames are sent
  to the Next resolver with the server + App Router compilation flags.
- **Open in editor** uses `GET /__nextjs_launch-editor?file=&line1=&column1=`,
  which accepts `file://` URLs, absolute paths, and project-relative paths.
- **Re-render hook:** the inline script installs a minimal
  `__REACT_DEVTOOLS_GLOBAL_HOOK__` before React loads and walks each commit
  as a diff against the alternate fiber tree, pruning subtrees whose child
  pointer is unchanged (the way React DevTools does) — `PerformedWork` flags
  alone are stale on fibers React reused without re-cloning.

## Limitations

- **Development only** — production React builds carry none of the fiber
  debug data this relies on. Gate the mount so bundlers strip it entirely.
- **Fiber internals are not public API.** They have been stable across React
  18/19 dev builds, but a future React release could move them.
- **Without the hook**, the flasher shows DOM mutations, not re-renders; a
  memoized re-render that changes no DOM won't flash.
- **Library components** resolve to the caller's JSX callsite (the first
  app-owned frame) — usually what you want anyway.
- **Editor opening** goes through the Next dev server; it opens whatever
  editor the server's launch-editor detection finds (VS Code, etc.).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Every entry says `library / generated` | Source maps unreachable — make sure you're on `next dev` (not a production build) and same-origin |
| Server Component rows have no file/line | Upgrade to a version with SSR/RSC `_debugInfo` support; production `next start` cannot expose dev-only locations |
| Rows never resolve on webpack dev | The fallback POSTs to `stackFramesEndpoint`; check it isn't disabled and the dev server is current |
| Clicking a row doesn't open the editor | The dev server's launch-editor couldn't find an editor — try opening a file from a Next error overlay to verify |
| Flashes have no component names | The early hook isn't installed — see [the hook section](#true-re-render-flashes-optional-hook); it must render before React loads |
| Hotkey does nothing | Another extension/app owns the combo — change the `hotkey` prop |
| Widget visible in production | Your gating isn't statically analyzable — both conditions must be literal `process.env` checks |

## Demo app

A runnable demo lives in [`demo/`](https://github.com/Infinitietechnologies/dev-inspector/tree/master/demo):

```sh
cd demo
npm install
npm run dev
```

Open the printed URL and follow the "Things to try" list on the page: Alt+hover
anything, click to lock the source chain, open files in your editor, check the
i18n and State tabs, toggle the Zap button while the on-page clock ticks, and
try Copy for AI.

## Development

```sh
npm install
npm run test        # vitest — stack parsing, VLQ source maps, i18n lookup, hook script, AI context
npm run typecheck
npm run build       # tsup → dist/ (ESM + CJS + d.ts, two entries: index + hook)
```

CI runs all three on Node 20 and 22 for every push and PR. Releases are
tag-triggered: bump the version, update `CHANGELOG.md`, then
`git tag vX.Y.Z && git push origin vX.Y.Z` — the release workflow publishes
to npm with provenance via trusted publishing.

Layout: `src/` widget + pure modules · `tests/` vitest suites ·
`demo/` runnable Next 16 demo · `docs/` README screenshots.

## Project status

Pre-1.0. Verified against Next 16 + React 19, on both Turbopack and webpack
dev servers. Issue reports welcome.

## License

[MIT](https://github.com/Infinitietechnologies/dev-inspector/blob/master/LICENSE)
