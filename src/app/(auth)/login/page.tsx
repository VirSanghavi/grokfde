"use client";

import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!configured) {
        router.push(next);
        return;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-8 shadow-md">
        <div className="mb-8 flex items-center gap-2.5">
          <LogoMark size={36} variant="brand" />
          <div>
            <p className="text-sm font-semibold text-fg">Sign in to Grok FDE</p>
            <p className="text-xs text-fg-muted">Company workspace</p>
          </div>
        </div>

        {!configured && (
          <div className="mb-4 rounded-lg border border-brand/20 bg-brand-dim px-3 py-2 text-xs text-fg-secondary">
            Supabase auth is not configured. Continue opens the app without a session.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Email</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required={configured}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Password</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required={configured}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : configured ? "Sign in" : "Continue to dashboard"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          No account?{" "}
          <Link href="/signup" className="font-medium text-brand hover:text-fg">
            Create one
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-fg-faint">
          <Link href="/" className="hover:text-fg-muted">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <LoginForm />
    </Suspense>
  );
}
