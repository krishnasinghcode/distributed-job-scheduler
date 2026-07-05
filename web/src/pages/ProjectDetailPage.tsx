import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusPill } from "../components/StatusPill";

interface Queue {
  id: string;
  name: string;
  priority: number;
  concurrencyLimit: number;
  isPaused: boolean;
  rateLimitPerSec: number | null;
}

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const res = await api.get<{ data: Queue[] }>(`/api/queues/project/${projectId}`);
    setQueues(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function togglePause(q: Queue) {
    await api.post(`/api/queues/${q.id}/${q.isPaused ? "resume" : "pause"}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-xl text-text-primary">Queues</h2>
          <p className="text-text-muted text-sm mt-1">Configure priority, concurrency, and retry behavior.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm hover:brightness-110"
        >
          + New queue
        </button>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Loading…</p>
      ) : (
        <div className="bg-ink-surface border border-ink-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border text-left text-text-faint uppercase text-[11px] tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Concurrency</th>
                <th className="px-4 py-3">Rate limit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id} className="border-b border-ink-border last:border-0 hover:bg-ink-raised/40">
                  <td className="px-4 py-3">
                    <Link to={`/queues/${q.id}`} className="text-text-primary hover:text-signal-amber font-medium">
                      {q.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-muted">{q.priority}</td>
                  <td className="px-4 py-3 font-mono text-text-muted">{q.concurrencyLimit}</td>
                  <td className="px-4 py-3 font-mono text-text-muted">
                    {q.rateLimitPerSec ? `${q.rateLimitPerSec}/s` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={q.isPaused ? "OFFLINE" : "IDLE"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => togglePause(q)}
                      className="text-xs text-signal-amber hover:underline"
                    >
                      {q.isPaused ? "Resume" : "Pause"}
                    </button>
                  </td>
                </tr>
              ))}
              {queues.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    No queues yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && projectId && (
        <CreateQueueModal projectId={projectId} onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}

function CreateQueueModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [concurrencyLimit, setConcurrencyLimit] = useState(5);
  const [strategy, setStrategy] = useState("EXPONENTIAL");
  const [maxRetries, setMaxRetries] = useState(5);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      await api.post("/api/queues", {
        projectId,
        name,
        priority: Number(priority),
        concurrencyLimit: Number(concurrencyLimit),
        retryPolicy: { strategy, baseDelayMs: 1000, maxDelayMs: 60000, maxRetries: Number(maxRetries) },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create queue");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-ink-surface border border-ink-border rounded-lg p-6 w-full max-w-md">
        <h3 className="font-display font-semibold text-lg mb-4">New queue</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-text-muted">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-text-muted">Concurrency</label>
              <input
                type="number"
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(Number(e.target.value))}
                className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-text-muted">Retry strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              >
                <option value="FIXED">Fixed</option>
                <option value="LINEAR">Linear</option>
                <option value="EXPONENTIAL">Exponential</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-text-muted">Max retries</label>
              <input
                type="number"
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              />
            </div>
          </div>
        </div>
        {error && <p className="text-signal-red text-sm mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button onClick={submit} className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
