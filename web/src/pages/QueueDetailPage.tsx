import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api/client";
import { StatusPill } from "../components/StatusPill";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { CreateJobPanel } from "../components/CreateJobPanel";

interface Job {
  id: string;
  type: string;
  status: string;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
}

const STATUS_FILTERS = ["ALL", "QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "DEAD_LETTER"];

export function QueueDetailPage() {
  const { queueId } = useParams();
  const [tab, setTab] = useState<"jobs" | "dlq">("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stats, setStats] = useState<{ statusCounts: Record<string, number>; throughputPerHour: number; avgDurationMs: number | null } | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!queueId) return;
    const params = new URLSearchParams({ queueId, page: String(page), pageSize: "15" });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    const res = await api.get<{ data: Job[]; total: number }>(`/api/jobs?${params.toString()}`);
    setJobs(res.data);
    setTotal(res.total);
  }, [queueId, page, statusFilter]);

  const loadStats = useCallback(async () => {
    if (!queueId) return;
    const res = await api.get<{ data: typeof stats }>(`/api/queues/${queueId}/stats`);
    setStats(res.data);
  }, [queueId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  useLiveEvents(undefined, (evt) => {
    if (evt.type === "job.updated" && evt.queueId === queueId) {
      loadJobs();
      loadStats();
    }
  });

  const chartData = stats
    ? Object.entries(stats.statusCounts).map(([status, count]) => ({ status, count }))
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-semibold text-xl text-text-primary">Queue explorer</h2>
        <button
          onClick={() => setShowCreateJob(true)}
          className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm hover:brightness-110"
        >
          + Submit job
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Throughput (last hour)" value={stats ? String(stats.throughputPerHour) : "—"} suffix="jobs" />
        <StatCard
          label="Avg execution time"
          value={stats?.avgDurationMs ? (stats.avgDurationMs / 1000).toFixed(2) : "—"}
          suffix="sec"
        />
        <StatCard label="Total jobs tracked" value={String(Object.values(stats?.statusCounts ?? {}).reduce((a, b) => a + b, 0))} suffix="jobs" />
      </div>

      {chartData.length > 0 && (
        <div className="bg-ink-surface border border-ink-border rounded-lg p-4 mb-6 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#242B3D" />
              <XAxis dataKey="status" stroke="#8A93A6" fontSize={11} />
              <YAxis stroke="#8A93A6" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1B2130", border: "1px solid #242B3D", fontSize: 12 }} />
              <Bar dataKey="count" fill="#F2A93B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setTab("jobs")} className={`px-3 py-1.5 text-sm rounded-md ${tab === "jobs" ? "bg-ink-raised text-signal-amber" : "text-text-muted"}`}>
          Jobs
        </button>
        <button onClick={() => setTab("dlq")} className={`px-3 py-1.5 text-sm rounded-md ${tab === "dlq" ? "bg-ink-raised text-signal-amber" : "text-text-muted"}`}>
          Dead letter queue
        </button>
      </div>

      {tab === "jobs" ? (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-mono rounded-full border ${
                  statusFilter === s ? "border-signal-amber text-signal-amber" : "border-ink-border text-text-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="bg-ink-surface border border-ink-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-border text-left text-text-faint uppercase text-[11px] tracking-wider">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-ink-border last:border-0 hover:bg-ink-raised/40">
                    <td className="px-4 py-3 font-mono text-text-primary">{j.type}</td>
                    <td className="px-4 py-3"><StatusPill status={j.status} /></td>
                    <td className="px-4 py-3 font-mono text-text-muted">{j.attemptCount}/{j.maxAttempts}</td>
                    <td className="px-4 py-3 text-text-muted">{new Date(j.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/jobs/${j.id}`} className="text-xs text-signal-amber hover:underline">
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      No jobs match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={total} pageSize={15} onChange={setPage} />
        </>
      ) : (
        <DeadLetterTab queueId={queueId!} />
      )}

      {showCreateJob && queueId && (
        <CreateJobPanel queueId={queueId} onClose={() => setShowCreateJob(false)} onCreated={loadJobs} />
      )}
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="bg-ink-surface border border-ink-border rounded-lg p-4">
      <p className="text-[11px] uppercase tracking-wider text-text-faint">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-text-primary">
        {value} <span className="text-sm text-text-muted font-body">{suffix}</span>
      </p>
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-text-muted">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-3 py-1 border border-ink-border rounded-md disabled:opacity-30">
          Prev
        </button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="px-3 py-1 border border-ink-border rounded-md disabled:opacity-30">
          Next
        </button>
      </div>
    </div>
  );
}

function DeadLetterTab({ queueId }: { queueId: string }) {
  const [items, setItems] = useState<Array<{ id: string; originalJobId: string; error: string; attemptCount: number; failedAt: string; originalJob: { type: string } }>>([]);

  const load = useCallback(async () => {
    const res = await api.get<{ data: typeof items }>(`/api/jobs/dead-letter/${queueId}`);
    setItems(res.data);
  }, [queueId]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(jobId: string) {
    await api.post(`/api/jobs/${jobId}/retry`);
    load();
  }

  return (
    <div className="bg-ink-surface border border-ink-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-border text-left text-text-faint uppercase text-[11px] tracking-wider">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Error</th>
            <th className="px-4 py-3">Attempts</th>
            <th className="px-4 py-3">Failed at</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-ink-border last:border-0">
              <td className="px-4 py-3 font-mono">{item.originalJob.type}</td>
              <td className="px-4 py-3 text-signal-red truncate max-w-xs">{item.error}</td>
              <td className="px-4 py-3 font-mono text-text-muted">{item.attemptCount}</td>
              <td className="px-4 py-3 text-text-muted">{new Date(item.failedAt).toLocaleString()}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => retry(item.originalJobId)} className="text-xs text-signal-amber hover:underline">
                  Retry
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                No dead-lettered jobs. 🎉
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
