import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", name: "", orgName: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.orgName);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div>
      <label className="text-xs uppercase tracking-wider text-text-muted">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full bg-ink border border-ink-border rounded-md px-3 py-2 text-sm focus:border-signal-amber outline-none"
        required
      />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display font-bold text-2xl text-text-primary">
            Pulse<span className="text-signal-amber">.</span>
          </h1>
          <p className="text-text-faint text-sm font-mono mt-1">create your console</p>
        </div>
        <form onSubmit={onSubmit} className="bg-ink-surface border border-ink-border rounded-lg p-6 space-y-4">
          {field("name", "Your name")}
          {field("email", "Email", "email")}
          {field("password", "Password (min 8 chars)", "password")}
          {field("orgName", "Organization name")}
          {error && <p className="text-signal-red text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal-amber text-ink font-semibold rounded-md py-2 text-sm hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-text-muted mt-4">
          Already have one? <Link to="/login" className="text-signal-amber hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
