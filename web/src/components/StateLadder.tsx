const LIFECYCLE: { key: string; label: string }[] = [
  { key: "QUEUED", label: "Queued" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "RUNNING", label: "Running" },
  { key: "COMPLETED", label: "Completed" },
];

const TERMINAL_FAILURE = new Set(["FAILED", "DEAD_LETTER", "CANCELLED"]);

/**
 * Visualizes where a job sits in Queued -> Scheduled -> Claimed -> Running ->
 * Completed. If the job ended in failure/DLQ/cancellation, the ladder breaks
 * off the rail with a red terminal node instead of reaching Completed.
 */
export function StateLadder({ status }: { status: string }) {
  const isFailure = TERMINAL_FAILURE.has(status);
  const currentIndex = LIFECYCLE.findIndex((s) => s.key === status);
  const effectiveIndex = isFailure ? LIFECYCLE.length - 2 : currentIndex;

  return (
    <div className="flex items-center w-full">
      {LIFECYCLE.map((step, i) => {
        const reached = !isFailure && i <= effectiveIndex;
        const isLast = i === LIFECYCLE.length - 1;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  reached
                    ? "bg-signal-teal border-signal-teal shadow-glow"
                    : "bg-transparent border-ink-border"
                }`}
              />
              <span className={`text-[10px] uppercase tracking-wider font-mono ${reached ? "text-text-primary" : "text-text-faint"}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={`h-px flex-1 mx-1 mb-4 ${reached ? "bg-signal-teal" : "bg-ink-border"}`} />
            )}
          </div>
        );
      })}
      {isFailure && (
        <div className="flex flex-col items-center gap-2 ml-1">
          <div className="w-3 h-3 rounded-full border-2 bg-signal-red border-signal-red shadow-glow" />
          <span className="text-[10px] uppercase tracking-wider font-mono text-signal-red">
            {status.replace("_", " ")}
          </span>
        </div>
      )}
    </div>
  );
}
