import { sendEmail } from "@/lib/email/outbound";
import { ApiError } from "@/lib/server/errors";
import {
  createConversation,
  createProspect,
  insertMessage,
} from "@/lib/server/prospect-context";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { CompanyRow } from "@/lib/server/types";
import {
  addDaysYmd,
  getTzParts,
  isValidIanaTimeZone,
  wallTimeToUtc,
  ymdInZone,
} from "@/lib/server/timezone";

export const DEFAULT_DURATION_MINUTES = 30;
export const SLOT_STEP_MINUTES = 30;
/** Don't offer slots starting sooner than this. */
export const MIN_LEAD_MINUTES = 15;
/** How far ahead guests can book. */
export const MAX_DAYS_AHEAD = 60;
/** Join window opens this many minutes before start. */
export const JOIN_EARLY_MINUTES = 15;

export type DemoBookingRow = {
  id: string;
  company_id: string;
  prospect_id: string | null;
  conversation_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  timezone: string;
  guest_name: string;
  guest_email: string;
  guest_company: string | null;
  notes: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  join_token: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function bookingJoinUrl(companySlug: string, joinToken: string): string {
  return `${appBaseUrl()}/book/${companySlug}/join/${joinToken}`;
}

export function bookingConfirmUrl(companySlug: string, bookingId: string): string {
  return `${appBaseUrl()}/book/${companySlug}/c/${bookingId}`;
}

/** All 24/7 half-hour starts for a single calendar day in guest TZ, minus taken + past. */
export async function getAvailabilityForDay(args: {
  companyId: string;
  /** YYYY-MM-DD in guest timezone */
  date: string;
  timeZone: string;
  durationMinutes?: number;
}): Promise<AvailabilitySlot[]> {
  const tz = args.timeZone;
  if (!isValidIanaTimeZone(tz)) {
    throw new ApiError("BAD_REQUEST", "Invalid timezone", { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new ApiError("BAD_REQUEST", "date must be YYYY-MM-DD", { status: 400 });
  }

  const duration = args.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const [y, m, d] = args.date.split("-").map(Number) as [number, number, number];

  const dayStartUtc = wallTimeToUtc(y, m, d, 0, 0, tz);
  const nextYmd = addDaysYmd(args.date, 1);
  const [ny, nm, nd] = nextYmd.split("-").map(Number) as [number, number, number];
  const dayEndUtc = wallTimeToUtc(ny, nm, nd, 0, 0, tz);

  const now = Date.now();
  const earliest = now + MIN_LEAD_MINUTES * 60_000;
  const maxHorizon = now + MAX_DAYS_AHEAD * 24 * 60 * 60_000;

  // Reject dates outside bookable horizon (in guest TZ "today" still ok)
  if (dayStartUtc.getTime() > maxHorizon) return [];
  if (dayEndUtc.getTime() < earliest - 24 * 60 * 60_000) return [];

  const taken = await listTakenStarts({
    companyId: args.companyId,
    fromIso: dayStartUtc.toISOString(),
    toIso: dayEndUtc.toISOString(),
  });
  const takenSet = new Set(taken.map((t) => new Date(t).getTime()));

  const slots: AvailabilitySlot[] = [];
  const steps = Math.floor((24 * 60) / SLOT_STEP_MINUTES);

  for (let i = 0; i < steps; i++) {
    const minuteOfDay = i * SLOT_STEP_MINUTES;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const start = wallTimeToUtc(y, m, d, hour, minute, tz);
    const end = new Date(start.getTime() + duration * 60_000);

    if (start.getTime() < earliest) continue;
    if (start.getTime() > maxHorizon) continue;
    if (takenSet.has(start.getTime())) continue;

    // Label in guest TZ
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(start);

    slots.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label,
    });
  }

  return slots;
}

/** Which days in a month have at least one free slot (for calendar dots). */
export async function getMonthAvailability(args: {
  companyId: string;
  /** YYYY-MM */
  month: string;
  timeZone: string;
  durationMinutes?: number;
}): Promise<{ date: string; availableCount: number }[]> {
  if (!/^\d{4}-\d{2}$/.test(args.month)) {
    throw new ApiError("BAD_REQUEST", "month must be YYYY-MM", { status: 400 });
  }
  const [ys, ms] = args.month.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const daysInMo = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const duration = args.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const tz = args.timeZone;

  const firstYmd = `${args.month}-01`;
  const lastYmd = `${args.month}-${String(daysInMo).padStart(2, "0")}`;
  const [fy, fm, fd] = firstYmd.split("-").map(Number) as [number, number, number];
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const nextFirst = `${nextMonth}-01`;
  const [ny, nm, nd] = nextFirst.split("-").map(Number) as [number, number, number];

  const rangeStart = wallTimeToUtc(fy, fm, fd, 0, 0, tz);
  const rangeEnd = wallTimeToUtc(ny, nm, nd, 0, 0, tz);

  const taken = await listTakenStarts({
    companyId: args.companyId,
    fromIso: rangeStart.toISOString(),
    toIso: rangeEnd.toISOString(),
  });
  const takenSet = new Set(taken.map((t) => new Date(t).getTime()));

  const now = Date.now();
  const earliest = now + MIN_LEAD_MINUTES * 60_000;
  const maxHorizon = now + MAX_DAYS_AHEAD * 24 * 60 * 60_000;
  const out: { date: string; availableCount: number }[] = [];
  const steps = Math.floor((24 * 60) / SLOT_STEP_MINUTES);

  for (let day = 1; day <= daysInMo; day++) {
    const date = `${args.month}-${String(day).padStart(2, "0")}`;
    let count = 0;
    for (let i = 0; i < steps; i++) {
      const minuteOfDay = i * SLOT_STEP_MINUTES;
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const start = wallTimeToUtc(year, month, day, hour, minute, tz);
      if (start.getTime() < earliest) continue;
      if (start.getTime() > maxHorizon) continue;
      if (takenSet.has(start.getTime())) continue;
      count += 1;
    }
    if (count > 0) out.push({ date, availableCount: count });
  }
  // duration unused for markers but kept for API symmetry
  void duration;
  return out;
}

async function listTakenStarts(args: {
  companyId: string;
  fromIso: string;
  toIso: string;
}): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("demo_bookings")
    .select("starts_at")
    .eq("company_id", args.companyId)
    .eq("status", "confirmed")
    .gte("starts_at", args.fromIso)
    .lt("starts_at", args.toIso);

  if (error) {
    // Table missing in fresh env — treat as empty
    if (error.message?.includes("does not exist")) return [];
    throw new ApiError("INTERNAL_ERROR", "Could not load bookings", {
      status: 500,
      details: error.message,
    });
  }
  return (data ?? []).map((r) => String(r.starts_at));
}

export async function createDemoBooking(args: {
  company: CompanyRow;
  startsAtIso: string;
  timeZone: string;
  guestName: string;
  guestEmail: string;
  guestCompany?: string;
  notes?: string;
  durationMinutes?: number;
}): Promise<DemoBookingRow> {
  if (!isValidIanaTimeZone(args.timeZone)) {
    throw new ApiError("BAD_REQUEST", "Invalid timezone", { status: 400 });
  }
  const email = args.guestEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError("BAD_REQUEST", "Valid email is required", { status: 400 });
  }
  const name = args.guestName.trim();
  if (name.length < 1) {
    throw new ApiError("BAD_REQUEST", "Name is required", { status: 400 });
  }

  const duration = args.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const startsAt = new Date(args.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    throw new ApiError("BAD_REQUEST", "Invalid start time", { status: 400 });
  }

  const earliest = Date.now() + MIN_LEAD_MINUTES * 60_000;
  if (startsAt.getTime() < earliest) {
    throw new ApiError("BAD_REQUEST", "That time is no longer available", {
      status: 409,
    });
  }

  // Must land on a valid slot boundary in guest TZ
  const parts = getTzParts(startsAt, args.timeZone);
  if (parts.minute % SLOT_STEP_MINUTES !== 0 || parts.second !== 0) {
    throw new ApiError("BAD_REQUEST", "Start time must be on a half-hour boundary", {
      status: 400,
    });
  }

  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  // Re-check availability
  const ymd = ymdInZone(startsAt, args.timeZone);
  const open = await getAvailabilityForDay({
    companyId: args.company.id,
    date: ymd,
    timeZone: args.timeZone,
    durationMinutes: duration,
  });
  if (!open.some((s) => s.startsAt === startsAt.toISOString())) {
    throw new ApiError("BAD_REQUEST", "That time was just taken. Pick another.", {
      status: 409,
    });
  }

  // Create prospect + conversation so FDE has identity + memory from booking
  const prospect = await createProspect({
    companyId: args.company.id,
    personName: name,
    email,
    companyName: args.guestCompany?.trim() || undefined,
    stage: "demo-booked",
  });

  const conversation = await createConversation({
    companyId: args.company.id,
    prospectId: prospect.id,
  });

  await insertMessage({
    conversationId: conversation.id,
    channel: "system",
    role: "system",
    content: `Demo booked for ${startsAt.toISOString()} (${args.timeZone}). Guest: ${name} <${email}>${
      args.guestCompany ? ` · ${args.guestCompany}` : ""
    }${args.notes ? `\nNotes: ${args.notes}` : ""}`,
    metadata: { kind: "demo_booking" },
  });

  // Seed memory
  const db = getSupabaseAdmin();
  await db
    .from("prospects")
    .update({
      memory_json: {
        stage: "demo-booked",
        summary: `Booked a live demo with ${args.company.agent_name || "the FDE"}.`,
        currentStack: [],
        painPoints: [],
        requirements: args.notes ? [args.notes] : [],
        objections: [],
        technicalQuestions: [],
        unresolvedQuestions: [],
        competitors: [],
        commitments: [`Demo at ${startsAt.toISOString()}`],
        nextAction: "Attend scheduled FDE demo",
      },
      stage: "demo-booked",
    })
    .eq("id", prospect.id);

  const { data, error } = await db
    .from("demo_bookings")
    .insert({
      company_id: args.company.id,
      prospect_id: prospect.id,
      conversation_id: conversation.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      duration_minutes: duration,
      timezone: args.timeZone,
      guest_name: name,
      guest_email: email,
      guest_company: args.guestCompany?.trim() || null,
      notes: args.notes?.trim() || null,
      status: "confirmed",
      metadata_json: {
        agentName: args.company.agent_name,
        companySlug: args.company.slug,
      },
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new ApiError("BAD_REQUEST", "That time was just taken. Pick another.", {
        status: 409,
      });
    }
    throw new ApiError("INTERNAL_ERROR", "Could not create booking", {
      status: 500,
      details: error?.message,
    });
  }

  const booking = data as DemoBookingRow;

  // Best-effort confirmation email
  void sendBookingConfirmationEmail({
    company: args.company,
    booking,
  }).catch((err) => console.warn("[bookings] email failed", err));

  return booking;
}

async function sendBookingConfirmationEmail(args: {
  company: CompanyRow;
  booking: DemoBookingRow;
}) {
  const agent = args.company.agent_name || "Atlas";
  const join = bookingJoinUrl(args.company.slug, args.booking.join_token);
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: args.booking.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(args.booking.starts_at));

  await sendEmail({
    to: args.booking.guest_email,
    subject: `Demo confirmed with ${agent} · ${args.company.name}`,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;line-height:1.5;color:#0f172a">
        <p style="font-size:15px;margin:0 0 12px">Hi ${escapeHtml(args.booking.guest_name)},</p>
        <p style="font-size:15px;margin:0 0 12px">
          Your demo with <strong>${escapeHtml(agent)}</strong> at
          <strong>${escapeHtml(args.company.name)}</strong> is confirmed.
        </p>
        <p style="font-size:15px;margin:0 0 4px"><strong>When</strong></p>
        <p style="font-size:15px;margin:0 0 16px">${escapeHtml(when)}</p>
        <p style="font-size:15px;margin:0 0 16px">
          ${escapeHtml(agent)} will meet you on a live video call with full company context and tools.
        </p>
        <p style="margin:0 0 24px">
          <a href="${join}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">
            Join demo
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;margin:0">
          The join link opens ${JOIN_EARLY_MINUTES} minutes before start. Save this email.
        </p>
      </div>
    `,
    text: `Demo with ${agent} confirmed for ${when}. Join: ${join}`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function getBookingById(id: string): Promise<DemoBookingRow | null> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("demo_bookings").select("*").eq("id", id).maybeSingle();
  return (data as DemoBookingRow) ?? null;
}

export async function getBookingByToken(token: string): Promise<DemoBookingRow | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("demo_bookings")
    .select("*")
    .eq("join_token", token)
    .maybeSingle();
  return (data as DemoBookingRow) ?? null;
}

export async function listCompanyBookings(
  companyId: string,
  opts?: { from?: string; limit?: number },
): Promise<DemoBookingRow[]> {
  const db = getSupabaseAdmin();
  let q = db
    .from("demo_bookings")
    .select("*")
    .eq("company_id", companyId)
    .order("starts_at", { ascending: true })
    .limit(opts?.limit ?? 100);

  if (opts?.from) {
    q = q.gte("starts_at", opts.from);
  } else {
    // default: upcoming + last 7d
    const from = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    q = q.gte("starts_at", from);
  }

  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("does not exist")) return [];
    throw new ApiError("INTERNAL_ERROR", "Could not list bookings", {
      status: 500,
      details: error.message,
    });
  }
  return (data ?? []) as DemoBookingRow[];
}

export function joinWindowStatus(booking: DemoBookingRow): {
  canJoin: boolean;
  phase: "upcoming" | "open" | "ended" | "cancelled";
  opensAt: string;
  message: string;
} {
  if (booking.status === "cancelled") {
    return {
      canJoin: false,
      phase: "cancelled",
      opensAt: booking.starts_at,
      message: "This demo was cancelled.",
    };
  }
  const start = new Date(booking.starts_at).getTime();
  const end = new Date(booking.ends_at).getTime();
  const openAt = start - JOIN_EARLY_MINUTES * 60_000;
  const now = Date.now();

  if (now < openAt) {
    return {
      canJoin: false,
      phase: "upcoming",
      opensAt: new Date(openAt).toISOString(),
      message: `Join opens ${JOIN_EARLY_MINUTES} minutes before the demo.`,
    };
  }
  if (now > end + 30 * 60_000) {
    return {
      canJoin: false,
      phase: "ended",
      opensAt: new Date(openAt).toISOString(),
      message: "This demo window has ended.",
    };
  }
  return {
    canJoin: true,
    phase: "open",
    opensAt: new Date(openAt).toISOString(),
    message: "Your FDE is ready. Join the live demo.",
  };
}

export function serializeBooking(
  booking: DemoBookingRow,
  company: { slug: string; name: string; agent_name: string },
) {
  return {
    id: booking.id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    durationMinutes: booking.duration_minutes,
    timezone: booking.timezone,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    guestCompany: booking.guest_company,
    notes: booking.notes,
    status: booking.status,
    joinToken: booking.join_token,
    joinUrl: bookingJoinUrl(company.slug, booking.join_token),
    confirmUrl: bookingConfirmUrl(company.slug, booking.id),
    prospectId: booking.prospect_id,
    conversationId: booking.conversation_id,
    company: {
      slug: company.slug,
      name: company.name,
      agentName: company.agent_name,
    },
    join: joinWindowStatus(booking),
  };
}
