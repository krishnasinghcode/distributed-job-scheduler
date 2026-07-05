import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface Project {
  id: string;
  name: string;
  apiKey: string;
  orgId: string;
  _count?: { queues: number };
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Project[] }>("/api/projects");
    setProjects(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-xl text-text-primary">Projects</h2>
          <p className="text-text-muted text-sm mt-1">Each project owns its own queues and jobs.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-signal-amber text-ink font-semibold rounded-md px-4 py-2 text-sm hover:brightness-110"
        >
          + New project
        </button>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-ink-border rounded-lg p-10 text-center">
          <p className="text-text-muted">No projects yet. Create one to start scheduling jobs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-ink-surface border border-ink-border rounded-lg p-5 hover:border-signal-amber/50 transition-colors"
            >
              <h3 className="font-display font-semibold text-text-primary">{p.name}</h3>
              <p className="text-xs text-text-faint font-mono mt-2">{p.apiKey}</p>
              <p className="text-sm text-text-muted mt-3">{p._count?.queues ?? 0} queue(s)</p>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A user always has at least one org (created at registration). We fetch
    // it by inspecting an existing project, or fall back to prompting for id.
    // For simplicity in this dashboard we ask the user to paste their orgId
    // if none is inferable -- shown in the API docs / register response.
    const stored = localStorage.getItem("orgId");
    if (stored) setOrgId(stored);
  }, []);

  async function submit() {
    try {
      await api.post("/api/projects", { name, orgId });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-ink-surface border border-ink-border rounded-lg p-6 w-full max-w-md">
        <h3 className="font-display font-semibold text-lg mb-4">New project</h3>
        <label className="text-xs uppercase tracking-wider text-text-muted">Project name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
        />
        <label className="text-xs uppercase tracking-wider text-text-muted">Organization ID</label>
        <input
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder="org uuid from registration response"
          className="mt-1 mb-3 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
        />
        {error && <p className="text-signal-red text-sm mb-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-2">
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
