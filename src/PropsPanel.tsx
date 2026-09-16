import { useEffect, useRef, useState } from "react";
import { buildInspectChain } from "./fiber";
import { JsonTree } from "./JsonTree";
import { diffProps, snapshotProps, type PropChange, type PropsSnapshot } from "./propsChanges";

const buttonStyle = {
  background: "#27272a", color: "#e4e4e7", border: "1px solid #52525b",
  borderRadius: 4, padding: "3px 8px", font: "inherit", cursor: "pointer",
};

export function PropsPanel({ el, index }: { el: Element; index: number }) {
  const [paused, setPaused] = useState(false);
  const [reset, setReset] = useState(0);
  const [snapshot, setSnapshot] = useState<PropsSnapshot>(new Map());
  const [props, setProps] = useState<unknown>();
  const [changes, setChanges] = useState<PropChange[]>([]);
  const [status, setStatus] = useState("Watching for changes…");
  const observation = useRef<{ el: Element; index: number; reset: number; previous?: PropsSnapshot; identity?: object } | null>(null);

  useEffect(() => {
    if (!observation.current || observation.current.el !== el || observation.current.index !== index || observation.current.reset !== reset) {
      observation.current = { el, index, reset };
      setChanges([]);
    }
    const observed = observation.current;
    if (paused && observed.previous) {
      setStatus("Paused");
      return;
    }
    const sample = () => {
      if (!el.isConnected) {
        setStatus("Element removed. Inspect another element to continue.");
        return;
      }
      try {
        const entry = buildInspectChain(el)[index];
        if (!entry) {
          setStatus("Component unavailable. Inspect the element again.");
          return;
        }
        const next = snapshotProps(entry.props);
        if (observed.identity !== entry.identity) {
          observed.previous = undefined;
          setChanges([]);
        }
        const delta = observed.previous ? diffProps(observed.previous, next) : [];
        if (!observed.previous || delta.length) {
          setSnapshot(next);
          setProps(() => entry.props);
        }
        if (delta.length) setChanges(delta);
        observed.identity = entry.identity;
        observed.previous = next;
        setStatus(paused ? "Paused" : "Watching for changes…");
      } catch {
        setStatus("Props unavailable. Inspect the element again.");
      }
    };
    sample();
    if (paused) return;
    const timer = window.setInterval(sample, 250);
    return () => window.clearInterval(timer);
  }, [el, index, paused, reset]);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" style={buttonStyle} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
        <button type="button" style={buttonStyle} onClick={() => setReset(reset + 1)}>Reset changes</button>
      </div>
      <div style={{ color: "#a1a1aa", marginBottom: 8 }}>{status}</div>
      <div style={{ color: "#a1a1aa", marginBottom: 8, fontSize: 11 }}>
        Sampled every 250 ms while this tab is open. Shallow comparison of up to 200 props;
        nested mutations and intermediate renders may be missed. Changes do not prove why a render occurred.
      </div>
      {changes.length > 0 && (
        <section aria-label="Latest prop changes" style={{ marginBottom: 12 }}>
          <div style={{ color: "#fcd34d", marginBottom: 6 }}>Latest changes ({changes.length})</div>
          {changes.map(change => (
            <div key={change.key} style={{ borderLeft: "2px solid #fcd34d", paddingLeft: 8, marginBottom: 8, overflowWrap: "anywhere" }}>
              <strong>{change.key}</strong> <span style={{ color: "#fcd34d" }}>{change.kind}</span>
              <div>Before: {change.before ?? "(absent)"}</div>
              <div>After: {change.after ?? "(absent)"}</div>
              {change.referenceOnly && <div style={{ color: "#a1a1aa" }}>Reference changed; previews look the same.</div>}
            </div>
          ))}
        </section>
      )}
      <div style={{ color: "#a1a1aa", marginBottom: 4 }}>Current props</div>
      {snapshot.size === 0 && <div>No props.</div>}
      {snapshot.size > 0 && <JsonTree value={props} />}
    </>
  );
}
