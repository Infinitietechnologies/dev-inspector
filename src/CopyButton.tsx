/** Copy-to-clipboard icon button with visual feedback (check for ~1s). */

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

const baseStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#71717a",
  cursor: "pointer",
  padding: 2,
  display: "flex",
  flexShrink: 0,
};

export function CopyButton({
  text,
  label,
  size = 12,
}: {
  text: string;
  label: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={copied ? { ...baseStyle, color: "#4ade80" } : baseStyle}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}
