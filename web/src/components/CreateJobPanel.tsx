import { useState } from "react";
import { api } from "../api/client";

type Kind = "IMMEDIATE" | "DELAYED" | "SCHEDULED" | "RECURRING" | "BATCH";

export function CreateJobPanel({ queueId, onClose, onCreated }: { queueId: string; onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<Kind>("IMMEDIATE");
  const [type, setType] = useState("send_notification");
  const [payload, setPayload] = useState('{\n  "example": "value"\n}');
  const [runAt, setRunAt] = useState("");
  const [cronExpr, setCronExpr] = useState("*/5 * * * *");
  const [batchItems, setBatchItems] = useState('[\n  { "id": 1 },\n  { "id": 2 }\n]');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { queueId, type, kind };
      if (kind === "BATCH") {
        body.batchItems = JSON.parse(batchItems);
      } else {
        body.payload = JSON.parse(payload);
      }
      if (kind === "DELAYED" || kind === "SCHEDULED") {
        if (!runAt) throw new Error("runAt is required for this job kind");
        body.runAt = new Date(runAt).toISOString();
      }
      if (kind === "RECURRING") {
        body.cronExpr = cronExpr;
      }
      await api.post("/api/jobs", body);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON or request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-ink-surface border border-ink-border rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <h3 className="font-display font-semibold text-lg mb-4">Submit job</h3>

        <label className="text-xs uppercase tracking-wider text-text-muted">Kind</label>
        <div className="flex gap-2 flex-wrap mt-1 mb-3">
          {(["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-2.5 py-1 text-xs font-mono rounded-full border ${
                kind === k ? "border-signal-amber text-signal-amber" : "border-ink-border text-text-muted"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <label className="text-xs uppercase tracking-wider text-text-muted">Job type</label>
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm font-mono focus:border-signal-amber outline-none"
          placeholder="e.g. send_notification"
        />

        {(kind === "DELAYED" || kind === "SCHEDULED") && (
          <>
            <label className="text-xs uppercase tracking-wider text-text-muted">Run at</label>
            <input
              type="datetime-local"
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
            />
          </>
        )}

        {kind === "RECURRING" && (
          <>
            <label className="text-xs uppercase tracking-wider text-text-muted">Cron expression</label>
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm font-mono focus:border-signal-amber outline-none"
              placeholder="*/5 * * * *"
            />
          </>
        )}

        {kind === "BATCH" ? (
          <>
            <label className="text-xs uppercase tracking-wider text-text-muted">Batch items (JSON array, one job per item)</label>
            <textarea
              value={batchItems}
              onChange={(e) => setBatchItems(e.target.value)}
              rows={6}
              className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm font-mono focus:border-signal-amber outline-none"
            />
          </>
        ) : (
          <>
            <label className="text-xs uppercase tracking-wider text-text-muted">Payload (JSON)</label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={5}
              className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm font-mono focus:border-signal-amber outline-none"
            />
          </>
        )}

        {error && <p className="text-signal-red text-sm mb-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
