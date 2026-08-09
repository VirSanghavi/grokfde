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
  startOfDayInZone,
  todayInZone,
  ymdInZone,
  zoneAbbrev,
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

/**
 * Four buckets covering all 24 hours, in chronological order. The overnight
 * bucket is the point: it is the thing a human-staffed calendar cannot offer.
 */
export type SlotPeriod = "overnight" | "morning" | "afternoon" | "evening";

export const SLOT_PERIOD_ORDER: SlotPeriod[] = [
  "overnight",
  "morning",
  "afternoon",
  "evening",
];

export const SLOT_PERIOD_LABEL: Record<SlotPeriod, string> = {
  overnight: "Overnight",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function periodForHour(hour: number): SlotPeriod {
  if (hour < 6) return "overnight";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export type AvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  /** Wall-clock time in the guest zone, e.g. "2:30 PM". */
  label: string;
  /** Zone abbreviation at that instant, e.g. "PDT". Disambiguates DST repeats. */
  zoneAbbrev: string;
  period: SlotPeriod;
};

export type AvailabilityGroup = {
  period: SlotPeriod;
  label: string;
  slots: AvailabilitySlot[];
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

export function bookingIcsUrl(bookingId: string): string {
  return `${appBaseUrl()}/api/bookings/${bookingId}/ics`;
}

/** Whether real outbound email is wired. When false, the join link is the handoff. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY);
}

/**
 * Every half-hour start inside one calendar day of the guest's zone, minus
 * taken slots and anything in the past.
 *
 * Slots are walked forward in UTC from the true start of the local day rather
 * than generated from a fixed list of 48 wall-clock times. That is what makes
 * DST correct without special cases: a spring-forward day naturally yields 46
 * slots and never offers a time that does not exist, a fall-back day yields 50
 * and offers both instances of the repeated hour, and no instant is ever
 * emitted twice.
 */
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

  // A day that already ended in the guest's own zone is never bookable.
  if (args.date < todayInZone(tz)) return [];

  const dayStartUtc = startOfDayInZone(args.date, tz);
  const dayEndUtc = startOfDayInZone(addDaysYmd(args.date, 1), tz);

  const now = Date.now();
  const earliest = now + MIN_LEAD_MINUTES * 60_000;
  const maxHorizon = now + MAX_DAYS_AHEAD * 24 * 60 * 60_000;

  if (dayStartUtc.getTime() > maxHorizon) return [];
  if (dayEndUtc.getTime() <= earliest) return [];

  const taken = await listTakenStarts({
    companyId: args.companyId,
    fromIso: dayStartUtc.toISOString(),
    toIso: dayEndUtc.toISOString(),
  });
  const takenSet = new Set(taken.map((t) => new Date(t).getTime()));

  const slots: AvailabilitySlot[] = [];
  const stepMs = SLOT_STEP_MINUTES * 60_000;

  for (let ts = dayStartUtc.getTime(); ts < dayEndUtc.getTime(); ts += stepMs) {
    if (ts < earliest) continue;
    if (ts > maxHorizon) break;
    if (takenSet.has(ts)) continue;

    const start = new Date(ts);
    const p = getTzParts(start, tz);
    slots.push({
      startsAt: start.toISOString(),
      endsAt: new Date(ts + duration * 60_000).toISOString(),
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
      }).format(start),
      zoneAbbrev: zoneAbbrev(start, tz),
      period: periodForHour(p.hour),
    });
  }

  return slots;
}

/** Group a day's slots into the four periods, dropping the empty ones. */
export function groupSlotsByPeriod(slots: AvailabilitySlot[]): AvailabilityGroup[] {
  const groups: AvailabilityGroup[] = [];
  for (const period of SLOT_PERIOD_ORDER) {
    const inPeriod = slots.filter((s) => s.period === period);
    if (inPeriod.length > 0) {
      groups.push({ period, label: SLOT_PERIOD_LABEL[period], slots: inPeriod });
    }
  }
  return groups;
}

/** Which days in a month have at least one free slot (for calendar markers). */
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
  const tz = args.timeZone;
  if (!isValidIanaTimeZone(tz)) {
    throw new ApiError("BAD_REQUEST", "Invalid timezone", { status: 400 });
  }

  const firstYmd = `${args.month}-01`;
  const [y, m] = args.month.split("-").map(Number) as [number, number];
  const nextMonth =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

  const rangeStart = startOfDayInZone(firstYmd, tz);
  const rangeEnd = startOfDayInZone(`${nextMonth}-01`, tz);

  const taken = await listTakenStarts({
    companyId: args.companyId,
    fromIso: rangeStart.toISOString(),
    toIso: rangeEnd.toISOString(),
  });
  const takenSet = new Set(taken.map((t) => new Date(t).getTime()));

  const now = Date.now();
  const earliest = now + MIN_LEAD_MINUTES * 60_000;
  const maxHorizon = now + MAX_DAYS_AHEAD * 24 * 60 * 60_000;
  const stepMs = SLOT_STEP_MINUTES * 60_000;

  // Walk the whole month once in UTC and bucket by the guest's local date, so
  // DST-shortened and DST-lengthened days count correctly with no special case.
  // Anchored on the local start of the month so every step lands on a real
  // half-hour boundary in the guest's zone, including 45-minute-offset zones.
  const counts = new Map<string, number>();
  for (let ts = rangeStart.getTime(); ts < rangeEnd.getTime(); ts += stepMs) {
    if (ts < earliest) continue;
    if (ts > maxHorizon) break;
    if (takenSet.has(ts)) continue;
    const date = ymdInZone(new Date(ts), tz);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([date]) => date.startsWith(args.month))
    .map(([date, availableCount]) => ({ date, availableCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
    // Table missing in fresh env, treat as empty
    if (error.message?.includes("does not exist")) return [];
    throw new ApiError("INTERNAL_ERROR", "Could not load bookings", {
      status: 500,
      details: error.message,
    });
  }
  return (data ?? []).map((r) => String(r.starts_at));
}

/** Is this exact instant already held by a confirmed booking? */
async function isSlotTaken(companyId: string, startsAt: Date): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("demo_bookings")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .eq("starts_at", startsAt.toISOString())
    .limit(1);
  if (error) {
    if (error.message?.includes("does not exist")) return false;
    throw new ApiError("INTERNAL_ERROR", "Could not check availability", {
      status: 500,
      details: error.message,
    });
  }
  return (data ?? []).length > 0;
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

  const now = Date.now();
  if (startsAt.getTime() < now + MIN_LEAD_MINUTES * 60_000) {
    throw new ApiError("BAD_REQUEST", "That time is no longer available", {
      status: 409,
    });
  }
  if (startsAt.getTime() > now + MAX_DAYS_AHEAD * 24 * 60 * 60_000) {
    throw new ApiError("BAD_REQUEST", "That date is beyond the booking window", {
      status: 400,
    });
  }

  // Must land on a real slot boundary in the guest's zone.
  const parts = getTzParts(startsAt, args.timeZone);
  if (parts.minute % SLOT_STEP_MINUTES !== 0 || parts.second !== 0) {
    throw new ApiError("BAD_REQUEST", "Start time must be on a half-hour boundary", {
      status: 400,
    });
  }
  if (startsAt.getTime() % 60_000 !== 0) {
    throw new ApiError("BAD_REQUEST", "Start time must be on a half-hour boundary", {
      status: 400,
    });
  }

  // Pre-insert conflict check. The partial unique index
  // demo_bookings_company_slot_uidx (company_id, starts_at) where
  // status = 'confirmed' is the real guarantee and is verified applied on this
  // database; this check exists so the common case returns a clean 409 instead
  // of relying on a constraint violation, and so we never build a prospect and
  // conversation for a booking that cannot land.
  if (await isSlotTaken(args.company.id, startsAt)) {
    throw new ApiError("BAD_REQUEST", "That time was just taken. Pick another.", {
      status: 409,
    });
  }

  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  // Insert the booking FIRST. If it loses a race, nothing else has been
  // created, so a rejected attempt leaves no orphan prospect or conversation.
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("demo_bookings")
    .insert({
      company_id: args.company.id,
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

  let booking = data as DemoBookingRow;

  // Give the FDE an identity and a memory to walk into. If any of this fails
  // the demo is still booked and the join link still works, so it must not
  // take the request down with it.
  try {
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

    const whenLocal = new Intl.DateTimeFormat("en-US", {
      timeZone: args.timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(startsAt);

    await insertMessage({
      conversationId: conversation.id,
      channel: "system",
      role: "system",
      content: [
        `Meeting booked for ${whenLocal} (${args.timeZone}).`,
        `Guest: ${name} <${email}>${args.guestCompany ? `, ${args.guestCompany}` : ""}`,
        args.notes ? `They asked you to prepare: ${args.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: { kind: "demo_booking", bookingId: booking.id },
    });

    await db
      .from("prospects")
      .update({
        memory_json: {
          stage: "demo-booked",
          summary: `Booked a live call with ${args.company.agent_name || "the FDE"} for ${whenLocal}.`,
          currentStack: [],
          painPoints: [],
          requirements: args.notes ? [args.notes] : [],
          objections: [],
          technicalQuestions: [],
          unresolvedQuestions: [],
          competitors: [],
          commitments: [`Call at ${startsAt.toISOString()}`],
          nextAction: "Attend the scheduled call",
        },
        stage: "demo-booked",
      })
      .eq("id", prospect.id);

    const { data: linked } = await db
      .from("demo_bookings")
      .update({ prospect_id: prospect.id, conversation_id: conversation.id })
      .eq("id", booking.id)
      .select("*")
      .single();
    if (linked) booking = linked as DemoBookingRow;
  } catch (err) {
    console.warn("[bookings] prospect/conversation setup failed", err);
  }

  // Best-effort confirmation email. Never blocks the response, and when no
  // provider is configured `sendEmail` mock-sends, which is exactly why the
  // confirmation screen treats the join link as the real handoff.
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
    subject: `Confirmed with ${agent}, ${args.company.name}`,
    html: `
      <div style="font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif;max-width:520px;line-height:1.55;color:#13110f">
        <p style="font-size:15px;margin:0 0 12px">Hi ${escapeHtml(args.booking.guest_name)},</p>
        <p style="font-size:15px;margin:0 0 12px">
          Your call with <strong>${escapeHtml(agent)}</strong> at
          <strong>${escapeHtml(args.company.name)}</strong> is confirmed.
        </p>
        <p style="font-size:13px;margin:0 0 4px;color:#6b645c">When</p>
        <p style="font-size:15px;margin:0 0 16px">${escapeHtml(when)}</p>
        <p style="font-size:15px;margin:0 0 16px">
          ${escapeHtml(agent)} joins on a live video call with your notes and full company context.
        </p>
        <p style="margin:0 0 24px">
          <a href="${join}" style="display:inline-block;background:#13110f;color:#fbfaf9;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:600;font-size:14px">
            Join the call
          </a>
        </p>
        <p style="font-size:13px;color:#6b645c;margin:0">
          The link opens ${JOIN_EARLY_MINUTES} minutes before the start. Save this email.
        </p>
      </div>
    `,
    text: `Call with ${agent} confirmed for ${when}. Join: ${join}`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Calendar file ──────────────────────────────────────────────────────── */

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 wants lines folded at 75 octets, continuations starting with a space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) out.push(" " + rest);
  return out.join("\r\n");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A real VEVENT: UTC stamps, a UID unique to this booking, and DESCRIPTION
 * carrying the join link so the guest can start the call from their calendar.
 */
export function buildBookingIcs(
  booking: DemoBookingRow,
  company: { slug: string; name: string; agent_name: string },
): string {
  const agent = company.agent_name || "Atlas";
  const join = bookingJoinUrl(company.slug, booking.join_token);
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);
  const cancelled = booking.status === "cancelled";

  const description = [
    `${agent} joins on a live video call with full company context.`,
    booking.notes ? `Your notes: ${booking.notes}` : null,
    ``,
    `Join: ${join}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Grok FDE//Demo Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${booking.id}@grok-fde`,
    `DTSTAMP:${icsStamp(new Date(booking.updated_at || booking.created_at))}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SEQUENCE:${cancelled ? 1 : 0}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${icsEscape(`${agent}, ${company.name}`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(join)}`,
    `URL:${icsEscape(join)}`,
    `ORGANIZER;CN=${icsEscape(agent)}:mailto:fde@${company.slug}.invalid`,
    `ATTENDEE;CN=${icsEscape(booking.guest_name)};RSVP=FALSE:mailto:${booking.guest_email}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`Your call with ${agent} starts in 10 minutes`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
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
    // default: upcoming plus the last 30 days, so "past" is not empty
    const from = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
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
      message: "This meeting was cancelled.",
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
      message: `Join opens ${JOIN_EARLY_MINUTES} minutes before the start.`,
    };
  }
  if (now > end + 30 * 60_000) {
    return {
      canJoin: false,
      phase: "ended",
      opensAt: new Date(openAt).toISOString(),
      message: "This meeting window has ended.",
    };
  }
  return {
    canJoin: true,
    phase: "open",
    opensAt: new Date(openAt).toISOString(),
    message: "Your FDE is ready. Join the live demo.",
  };
}

/** Where the join link drops the guest, carrying booking context. */
export function bookingFdePath(
  booking: DemoBookingRow,
  companySlug: string,
): string {
  return booking.prospect_id
    ? `/fde/${companySlug}/p/${booking.prospect_id}?call=1&booking=${booking.id}`
    : `/fde/${companySlug}?call=1&booking=${booking.id}`;
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
    icsUrl: bookingIcsUrl(booking.id),
    fdePath: bookingFdePath(booking, company.slug),
    prospectId: booking.prospect_id,
    conversationId: booking.conversation_id,
    emailConfigured: isEmailConfigured(),
    company: {
      slug: company.slug,
      name: company.name,
      agentName: company.agent_name,
    },
    join: joinWindowStatus(booking),
  };
}

/** Local date of a booking in the zone it was booked in. */
export function bookingLocalYmd(booking: DemoBookingRow): string {
  return ymdInZone(new Date(booking.starts_at), booking.timezone);
}
