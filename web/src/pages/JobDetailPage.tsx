import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusPill } from "../components/StatusPill";
import { StateLadder } from "../components/StateLadder";
import { useLiveEvents } from "../hooks/useLiveEvents";

interface Execution {
  id: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  result: unknown;
}
interface Log {
  id: string;
  ts: string;
  level: string;
  message: string;
}
interface JobDetail {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  executions: Execution[];
  logs: Log[];
  queueId: string;
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    const res = await api.get<{ data: JobDetail }>(`/api/jobs/${jobId}`);
    setJob(res.data);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents(undefined, (evt) => {
    if (evt.type === "job.updated" && evt.jobId === jobId) load();
  });

  async function retry() {
    if (!jobId) return;
    setBusy(true);
    await api.post(`/api/jobs/${jobId}/retry`).finally(() => setBusy(false));
    load();
  }

  async function cancel() {
    if (!jobId) return;
    setBusy(true);
    await api.post(`/api/jobs/${jobId}/cancel`).finally(() => setBusy(false));
    load();
  }

  if (!job) return <p className="text-text-muted text-sm">Loading…</p>;

  const canRetry = ["FAILED", "DEAD_LETTER", "CANCELLED"].includes(job.status);
  const canCancel = !["COMPLETED", "DEAD_LETTER", "CANCELLED"].includes(job.status);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-xl text-text-primary font-mono">{job.type}</h2>
          <p className="text-text-faint text-xs font-mono mt-1">{job.id}</p>
        </div>
        <StatusPill status={job.status} />
      </div>

      <div className="bg-ink-surface border border-ink-border rounded-lg p-6 mb-6">
        <StateLadder status={job.status} />
      </div>

      <div className="flex gap-2 mb-6">
        {canRetry && (
          <button onClick={retry} disabled={busy} className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm disabled:opacity-50">
            Retry job
          </button>
        )}
        {canCancel && (
          <button onClick={cancel} disabled={busy} className="border border-signal-red text-signal-red rounded-md px-4 py-2 text-sm disabled:opacity-50">
            Cancel job
          </button>
        )}
      </div>

      <Section title="Payload">
        <pre className="font-mono text-xs text-text-muted bg-ink rounded-md p-3 overflow-auto">
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </Section>

      <Section title={`Execution history (${job.executions.length} attempt${job.executions.length === 1 ? "" : "s"})`}>
        <div className="space-y-2">
          {job.executions.map((ex) => (
            <div key={ex.id} className="border border-ink-border rounded-md p-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-mono text-text-primary">Attempt {ex.attemptNo}</p>
                <p className="text-xs text-text-faint mt-1">
                  {new Date(ex.startedAt).toLocaleString()}
                  {ex.durationMs != null && ` · ${ex.durationMs}ms`}
                </p>
                {ex.error && <p className="text-xs text-signal-red mt-1">{ex.error}</p>}
              </div>
              <StatusPill status={ex.status} />
            </div>
          ))}
          {job.executions.length === 0 && <p className="text-text-muted text-sm">No executions yet.</p>}
        </div>
      </Section>

      <Section title="Logs">
        <div className="font-mono text-xs bg-ink rounded-md p-3 space-y-1 max-h-64 overflow-auto">
          {job.logs.map((log) => (
            <div key={log.id} className={log.level === "error" ? "text-signal-red" : "text-text-muted"}>
              <span className="text-text-faint">{new Date(log.ts).toLocaleTimeString()}</span> {log.message}
            </div>
          ))}
          {job.logs.length === 0 && <p className="text-text-muted">No logs yet.</p>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs uppercase tracking-wider text-text-faint mb-2">{title}</h3>
      {children}
    </div>
  );
}
