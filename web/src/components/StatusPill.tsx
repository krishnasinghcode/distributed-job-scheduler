const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-signal-violet/15 text-signal-violet border-signal-violet/30",
  SCHEDULED: "bg-signal-violet/15 text-signal-violet border-signal-violet/30",
  CLAIMED: "bg-signal-amber/15 text-signal-amber border-signal-amber/30",
  RUNNING: "bg-signal-amber/15 text-signal-amber border-signal-amber/30 animate-pulse",
  COMPLETED: "bg-signal-teal/15 text-signal-teal border-signal-teal/30",
  FAILED: "bg-signal-red/15 text-signal-red border-signal-red/30",
  DEAD_LETTER: "bg-signal-red/25 text-signal-red border-signal-red/50",
  CANCELLED: "bg-text-faint/15 text-text-faint border-text-faint/30",
  IDLE: "bg-signal-teal/15 text-signal-teal border-signal-teal/30",
  BUSY: "bg-signal-amber/15 text-signal-amber border-signal-amber/30",
  OFFLINE: "bg-text-faint/15 text-text-faint border-text-faint/30",
};

export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || "bg-text-faint/15 text-text-faint border-text-faint/30";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] uppercase tracking-wider ${style}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace("_", " ")}
    </span>
  );
}
