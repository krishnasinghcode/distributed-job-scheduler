import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@scheduler.dev");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display font-bold text-2xl text-text-primary">
            Pulse<span className="text-signal-amber">.</span>
          </h1>
          <p className="text-text-faint text-sm font-mono mt-1">job scheduler console</p>
        </div>
        <form onSubmit={onSubmit} className="bg-ink-surface border border-ink-border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
              required
            />
          </div>
          {error && <p className="text-signal-red text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal-amber text-ink font-semibold rounded-md py-2 text-sm hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-text-muted mt-4">
          No account? <Link to="/register" className="text-signal-amber hover:underline">Create one</Link>
        </p>
        <p className="text-center text-xs text-text-faint mt-2">Demo: demo@scheduler.dev / password123</p>
      </div>
    </div>
  );
}
