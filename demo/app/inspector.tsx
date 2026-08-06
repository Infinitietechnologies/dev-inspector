"use client";

import dynamic from "next/dynamic";
import { resources } from "../lib/i18n";
import { demoStore } from "../lib/store";

const DevInspector = dynamic(() => import("next-dev-inspector"), {
  ssr: false,
});

export function DevInspectorMount() {
  // In a real app add your own env flag (NEXT_PUBLIC_DEV_INSPECTOR) so the
  // widget is dead-code-eliminated from production builds — see the README.
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <DevInspector
      editor="vscode"
      projectRoot={process.env.NEXT_PUBLIC_PROJECT_ROOT}
      getI18nData={() => ({ data: resources, language: "en" })}
      getStateSnapshot={() => demoStore.getState()}
      stateLabel="Demo store"
    />
  );
}
