import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { errorMessage } from "../api.js";

function useSubmit(action, onDone) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onDone(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const { error, busy, submit } = useSubmit(
    () => login(form.email, form.password),
    () => navigate(location.state?.from || "/", { replace: true })
  );

  return (
    <form className="auth panel" onSubmit={submit}>
      <h1>Log in</h1>
      <label>
        Email
        <input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </label>
      <label>
        Password
        <input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      <p className="muted">New here? <Link to="/register">Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const { error, busy, submit } = useSubmit(
    () => register(form),
    (user) => navigate(user.role === "provider" ? "/provider" : "/", { replace: true })
  );

  return (
    <form className="auth panel" onSubmit={submit}>
      <h1>Create your account</h1>
      <fieldset className="choice">
        <legend>I want to</legend>
        <label className={form.role === "user" ? "on" : ""}>
          <input type="radio" name="role" checked={form.role === "user"} onChange={() => setForm({ ...form, role: "user" })} />
          Book courts
        </label>
        <label className={form.role === "provider" ? "on" : ""}>
          <input type="radio" name="role" checked={form.role === "provider"} onChange={() => setForm({ ...form, role: "provider" })} />
          List my courts
        </label>
      </fieldset>
      <label>
        Name
        <input required minLength={2} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Email
        <input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </label>
      <label>
        Password
        <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <small className="muted">At least 8 characters</small>
      </label>
      {form.role === "provider" && <p className="note">An admin reviews new provider accounts before listings go live.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      <p className="muted">Already registered? <Link to="/login">Log in</Link></p>
    </form>
  );
}
