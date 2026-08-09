import { z } from "zod";
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DAYS_AHEAD,
  getAvailabilityForDay,
  getMonthAvailability,
  groupSlotsByPeriod,
} from "@/lib/server/bookings";
import { getCompanyBySlug } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import {
  currentMonthInZone,
  isValidIanaTimeZone,
  todayInZone,
} from "@/lib/server/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  slug: z.string().min(1),
  timeZone: z.string().min(1),
  /** YYYY-MM-DD, day slots */
  date: z.string().optional(),
  /** YYYY-MM, month day markers */
  month: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(120).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = Query.parse({
      slug: url.searchParams.get("slug") ?? "",
      timeZone: url.searchParams.get("timeZone") ?? "",
      date: url.searchParams.get("date") ?? undefined,
      month: url.searchParams.get("month") ?? undefined,
      durationMinutes: url.searchParams.get("durationMinutes") ?? undefined,
    });

    if (!isValidIanaTimeZone(parsed.timeZone)) {
      throw new ApiError("BAD_REQUEST", "Invalid timeZone", { status: 400 });
    }

    const company = await getCompanyBySlug(parsed.slug);
    const duration = parsed.durationMinutes ?? DEFAULT_DURATION_MINUTES;

    // "Today" and "this month" are always resolved in the GUEST's zone. A guest
    // in Auckland must not be shown yesterday because the server is in UTC.
    const today = todayInZone(parsed.timeZone);
    const currentMonth = currentMonthInZone(parsed.timeZone);
    const base = {
      company: {
        slug: company.slug,
        name: company.name,
        agentName: company.agent_name,
      },
      timeZone: parsed.timeZone,
      durationMinutes: duration,
      today,
      currentMonth,
      maxDaysAhead: MAX_DAYS_AHEAD,
    };

    if (parsed.date) {
      const slots = await getAvailabilityForDay({
        companyId: company.id,
        date: parsed.date,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
      });
      return jsonOk({
        ...base,
        date: parsed.date,
        slots,
        groups: groupSlotsByPeriod(slots),
      });
    }

    if (parsed.month) {
      const days = await getMonthAvailability({
        companyId: company.id,
        month: parsed.month,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
      });
      return jsonOk({ ...base, month: parsed.month, days });
    }

    throw new ApiError("BAD_REQUEST", "Provide date=YYYY-MM-DD or month=YYYY-MM", {
      status: 400,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid availability query", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
