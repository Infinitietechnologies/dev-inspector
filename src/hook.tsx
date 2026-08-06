/**
 * Optional early re-render hook, importable as "next-dev-inspector/hook".
 *
 * Render <DevInspectorHook /> as early as possible in the document — top of
 * the root layout (App Router) or inside <Head> in _document (Pages Router,
 * use the raw string there). Inline scripts execute during HTML parsing,
 * before Next's deferred React chunks, which is what makes installing the
 * DevTools hook possible at all.
 *
 * With the hook installed, the widget's Zap button flashes true component
 * re-renders (with component names) instead of raw DOM mutations.
 */

import { devInspectorHookScript } from "./hookScript";

export { devInspectorHookScript };

export function DevInspectorHook() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <script
      data-dev-inspector-hook=""
      dangerouslySetInnerHTML={{ __html: devInspectorHookScript }}
    />
  );
}

export default DevInspectorHook;
