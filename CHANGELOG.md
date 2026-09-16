# Changelog

## 0.6.0 — 2026-09-16

- Add a searchable component browser with an owner tree, instance navigation,
  element highlighting, and selection for source and props inspection.
- Add left/right panel docking and pointer/keyboard resizing, with saved layout.
- Keep tree/search/resize keyboard interaction separate from DOM navigation;
  update selection highlights when the page scrolls or the viewport resizes.

## 0.5.0 — 2026-09-16

- Add live Props tab change tracking with before/after previews, added/removed
  props, reference-change indicators, pause/resume, and reset controls.
- Resolve the committed React fiber branch when inspecting updated components.
- Update development and demo dependencies to address security advisories.

## 0.4.1 — 2026-08-22

- Fix source file and line lookup for SSR/App Router Server Components by
  reading React 19 `_debugInfo`, resolving `about://React/Server/` frames in
  the server compilation, and restoring React 18 `_debugSource` support.

## 0.4.0 — 2026-08-06

- **`editor` prop**: force a specific editor (`"vscode"`, `"vscode-insiders"`,
  `"cursor"`, `"windsurf"`) by opening its URL scheme
  (`vscode://file/…:line:col`) directly from the browser instead of asking
  the dev server. Relative source paths are absolutized via the new
  `projectRoot` prop; when that's not possible the dev-server endpoint is
  used as before. `buildEditorUrl` and `EditorProtocol` are exported.

## 0.3.0 — 2026-08-06

- **Single launcher button**: the two stacked floating buttons are now one
  wrench launcher. Clicking it drops the crosshair and Zap actions out with a
  staggered animation (downward, or upward when near the bottom edge) and
  clicking again tucks them back in. The launcher is the drag handle; while
  collapsed, a colored dot shows when the inspector or flasher is active.

## 0.2.2 — 2026-08-06

- **Crash shield**: the widget is wrapped in an error boundary — if anything
  inside it throws during render, the inspector collapses for that page load
  instead of crashing the host app.
- **Hover throttling**: the fiber-chain walk on mousemove is coalesced to one
  per animation frame.
- **Webpack verified**: the `next dev --webpack` fallback path
  (`webpack-internal:///` frames → server resolver) is now exercised
  end-to-end against the demo; resolution matches Turbopack.
- **Release automation**: tag-triggered npm publish via GitHub Actions with
  npm trusted publishing (OIDC provenance).

## 0.2.1 — 2026-08-06 (not published to npm)

- README images switched to absolute URLs so they render on npmjs.com;
  CI badge moved to shields.io; absolute LICENSE/demo links.
- Richer npm keywords and description; README reorganized (TOC, controls
  table, props/API reference, troubleshooting).

## 0.2.0 — 2026-08-06 (first npm release)

- `next-dev-inspector/hook`: optional early inline script that installs a
  DevTools hook before React loads — the Zap flasher then shows true
  component re-renders with names (commit diff walk with reused-subtree
  pruning), instead of raw DOM mutations.
- **Copy for AI**: panel button copying component chain + file:line + props +
  i18n matches as a paste-ready block (`buildAiContext`/`serializeValue`
  exported).
- GitHub Actions CI (typecheck, tests, build on Node 20/22).

## 0.1.0 — 2026-08-06 (not published to npm)

- Initial extraction from the hyperlocal-web app: hover/click source
  inspection with client-side Turbopack source-map decoding, open-in-editor,
  props/state/history tabs, i18n reverse lookup, box-model overlay, DOM
  walking, DOM-update flasher, draggable persisted UI. Zero runtime deps,
  ESM+CJS, 20 unit tests.
