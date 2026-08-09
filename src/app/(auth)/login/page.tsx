"use client";

import { IconAlert, LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

/**
 * Supabase speaks in codes. A person reading this screen needs a sentence that
 * tells them which of the two things went wrong and what to do next.
 */
function humanAuthError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "That email and password do not match an account. Check both, or create an account.";
  }
  if (message.includes("email not confirmed")) {
    return "This account was created before email confirmation was switched off. Ask an admin to confirm it, or sign up again with a different address.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts in a row. Wait a minute and try again.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We could not reach the sign in service. Check your connection and try again.";
  }
  return raw;
}

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
      if (!supabase) throw new Error("Sign in is not configured on this deployment.");
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(humanAuthError(errorMessage(err, "Sign in failed. Try again.")));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={24} title="Grok FDE home" />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-ink">
            Grok FDE
          </span>
        </Link>
        <Link
          href="/signup"
          className="transition-premium text-[0.875rem] font-medium text-ink-3 hover:text-ink"
        >
          Create an account
        </Link>
      </header>

      {/* A short auth form is the one place a centred measure is the right
          composition, so this column is deliberately narrow. */}
      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <h1 className="text-display-m text-ink">Sign in</h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-3">
            Your workspace holds your FDE, its knowledge, and every prospect conversation.
          </p>

          {!configured && (
            <p className="mt-6 border-t border-rule pt-4 text-[0.875rem] leading-relaxed text-ink-2">
              Supabase is not configured here, so Continue opens the app without a session.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <Input
              label="Work email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required={configured}
            />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required={configured}
            />

            {/* Reserved so the button never jumps when a message appears. */}
            <div className="min-h-[2.25rem]">
              {error && (
                <p role="alert" className="flex gap-2 pb-3 text-[0.875rem] leading-snug text-critical">
                  <IconAlert size={16} className="mt-px shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>

            <Button
              type="submit"
              fullWidth
              size="md"
              loading={busy}
              loadingLabel="Signing in"
            >
              {configured ? "Sign in" : "Continue to dashboard"}
            </Button>
          </form>

          <p className="mt-6 border-t border-rule pt-6 text-[0.875rem] text-ink-3">
            No account yet?{" "}
            <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
              Create one in under a minute
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
      <LoginForm />
    </Suspense>
  );
}
