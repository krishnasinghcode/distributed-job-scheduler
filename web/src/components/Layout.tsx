import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HeartbeatStrip } from "./HeartbeatStrip";
import { useAuth } from "../hooks/useAuth";
import { api } from "../api/client";

interface Worker {
  id: string;
  currentJobCount: number;
}

const navItems = [
  { to: "/projects", label: "Projects", icon: "◧" },
  { to: "/workers", label: "Worker Fleet", icon: "◨" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [samples, setSamples] = useState<number[]>(Array(60).fill(0));

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ data: Worker[] }>("/api/workers");
        const total = res.data.reduce((sum, w) => sum + w.currentJobCount, 0);
        setSamples((prev) => [...prev.slice(1), total]);
      } catch {
        setSamples((prev) => [...prev.slice(1), 0]);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex bg-ink">
      <aside className="w-56 border-r border-ink-border bg-ink-surface flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-ink-border">
          <h1 className="font-display font-700 text-lg tracking-tight text-text-primary">
            Pulse<span className="text-signal-amber">.</span>
          </h1>
          <p className="text-[11px] text-text-faint font-mono mt-0.5">job scheduler console</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-ink-raised text-signal-amber"
                    : "text-text-muted hover:text-text-primary hover:bg-ink-raised/60"
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-ink-border">
          <p className="text-xs text-text-muted truncate">{user?.email}</p>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="mt-2 text-xs text-signal-red hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <HeartbeatStrip samples={samples} />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
