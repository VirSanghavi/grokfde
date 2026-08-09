"use client";

import { IconAlert, LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

/** Failures, turned into something a person can act on. */
function humanSignupError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "There is already an account on that email. Sign in instead.";
  }
  if (message.includes("email address") && message.includes("invalid")) {
    return "That email address was rejected. Try your work address.";
  }
  if (message.includes("password")) {
    return "That password is too weak. Use at least 8 characters.";
  }
  return raw;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError({});

    if (configured) {
      const next: { email?: string; password?: string } = {};
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        next.email = "Enter a valid email address.";
      }
      if (password.length < 8) {
        next.password = "Use at least 8 characters.";
      }
      if (next.email || next.password) {
        setFieldError(next);
        return;
      }
    }

    setBusy(true);
    try {
      if (!configured) {
        router.push("/onboarding");
        return;
      }

      // No email verification. The account is created server side already confirmed,
      // then this browser signs in with the password just chosen. Nothing is mailed,
      // so nothing can be stuck behind a mail quota. The old flow parked people on a
      // "check your inbox" screen that regularly never resolved.
      const supabase = createClient();
      if (!supabase) throw new Error("Sign in is not configured on this deployment.");

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error?.message ?? "We could not create your account. Try again.",
        );
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(humanSignupError(errorMessage(err, "We could not create your account. Try again.")));
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
          href="/login"
          className="transition-premium text-[0.875rem] font-medium text-ink-3 hover:text-ink"
        >
          Sign in
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <h1 className="text-display-m text-ink">Create your workspace</h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-3">
            Deploy your own engineer. If you would rather see one working first,{" "}
            <Link
              href="/book/grok-fde"
              className="font-medium text-ink underline underline-offset-4"
            >
              book a call
            </Link>
            .
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <Input
              label="Your name"
              name="name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              hint="Optional. Used when Atlas introduces your team."
            />
            <Input
              label="Work email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required={configured}
              error={fieldError.email}
            />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required={configured}
              error={fieldError.password}
            />

            <div className="min-h-[2.25rem]">
              {error && (
                <p role="alert" className="flex gap-2 pb-3 text-[0.875rem] leading-snug text-critical">
                  <IconAlert size={16} className="mt-px shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>

            <Button type="submit" fullWidth loading={busy} loadingLabel="Creating your workspace">
              Create workspace
            </Button>
          </form>

          <p className="mt-6 border-t border-rule pt-6 text-[0.875rem] text-ink-3">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-ink underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
