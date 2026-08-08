import { ApiError } from "@/lib/server/errors";

export async function sendEmail(args: {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ id: string; provider: string }> {
  const apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY;
  const from = args.from || process.env.EMAIL_FROM || "fde@grok-fde.local";

  if (!apiKey) {
    // Hackathon fallback: pretend send succeeded and log
    const id = `local_email_${crypto.randomUUID()}`;
    console.info("[email] mock send", { id, to: args.to, subject: args.subject });
    return { id, provider: "mock" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("EMAIL_FAILED", "Outbound email failed", {
      status: 502,
      details: text.slice(0, 400),
    });
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? crypto.randomUUID(), provider: "resend" };
}
