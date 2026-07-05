import { useMemo } from "react";

/**
 * The console's signature element. Renders the last N activity samples
 * (total active job count across the worker fleet) as an ECG-style pulse
 * line -- literal heartbeats, since the assignment's worker fleet reports
 * real heartbeats every few seconds. Flat line = idle fleet, sharp peaks =
 * bursts of concurrent execution.
 */
export function HeartbeatStrip({ samples }: { samples: number[] }) {
  const width = 1200;
  const height = 56;
  const max = Math.max(1, ...samples);

  const path = useMemo(() => {
    if (samples.length < 2) return "";
    const step = width / (samples.length - 1);
    return samples
      .map((v, i) => {
        const x = i * step;
        const y = height - 8 - (v / max) * (height - 16);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [samples, max]);

  const lastX = samples.length > 1 ? width : 0;
  const lastY = samples.length ? height - 8 - (samples[samples.length - 1] / max) * (height - 16) : height / 2;

  return (
    <div className="w-full h-14 bg-ink-surface border-b border-ink-border overflow-hidden relative">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#242B3D" strokeWidth="1" />
        {path && (
          <path
            d={path}
            fill="none"
            stroke="#F2A93B"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 4px rgba(242,169,59,0.5))" }}
          />
        )}
        {samples.length > 0 && (
          <circle cx={lastX} cy={lastY} r="4" fill="#F2A93B">
            <animate attributeName="r" values="4;7;4" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
      <span className="absolute left-3 top-1.5 text-[10px] font-mono uppercase tracking-widest text-text-faint">
        fleet pulse
      </span>
    </div>
  );
}
