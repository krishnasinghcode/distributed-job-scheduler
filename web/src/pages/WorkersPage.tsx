import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusPill } from "../components/StatusPill";

interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: string;
  concurrency: number;
  currentJobCount: number;
  lastHeartbeatAt: string;
  startedAt: string;
}

export function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    async function load() {
      const res = await api.get<{ data: Worker[] }>("/api/workers");
      setWorkers(res.data);
    }
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 className="font-display font-semibold text-xl text-text-primary mb-1">Worker fleet</h2>
      <p className="text-text-muted text-sm mb-6">
        Live status derived from heartbeats. A worker is marked offline if no heartbeat arrives within 15s.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map((w) => (
          <div key={w.id} className="bg-ink-surface border border-ink-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-sm text-text-primary">{w.hostname}</p>
              <StatusPill status={w.status} />
            </div>
            <p className="text-xs text-text-faint font-mono mb-3">pid {w.pid} · {w.id.slice(0, 8)}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Load</span>
              <span className="font-mono text-text-primary">
                {w.currentJobCount}/{w.concurrency}
              </span>
            </div>
            <div className="w-full h-1.5 bg-ink rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-signal-amber transition-all"
                style={{ width: `${Math.min(100, (w.currentJobCount / Math.max(1, w.concurrency)) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-text-faint mt-3">
              Last heartbeat: {new Date(w.lastHeartbeatAt).toLocaleTimeString()}
            </p>
          </div>
        ))}
        {workers.length === 0 && (
          <div className="col-span-full border border-dashed border-ink-border rounded-lg p-10 text-center">
            <p className="text-text-muted">No workers registered. Start a worker process to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
