"use client";

import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (!configured) {
        router.push("/onboarding");
        return;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (err) throw err;
      setMessage("Check your email to confirm, or continue if confirmations are disabled.");
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-8 shadow-md">
        <div className="mb-8">
          <LogoMark size={36} variant="brand" className="mb-4" />
          <h1 className="text-xl font-semibold tracking-tight text-fg">Create your workspace</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Deploy an AI Forward-Deployed Engineer for your company.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Work email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required={configured}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required={configured}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
              {message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:text-fg">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
