import { z } from "zod";
import {
  DEFAULT_DURATION_MINUTES,
  getAvailabilityForDay,
  getMonthAvailability,
} from "@/lib/server/bookings";
import { getCompanyBySlug } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { isValidIanaTimeZone } from "@/lib/server/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  slug: z.string().min(1),
  timeZone: z.string().min(1),
  /** YYYY-MM-DD — day slots */
  date: z.string().optional(),
  /** YYYY-MM — month day markers */
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

    if (parsed.date) {
      const slots = await getAvailabilityForDay({
        companyId: company.id,
        date: parsed.date,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
      });
      return jsonOk({
        company: {
          slug: company.slug,
          name: company.name,
          agentName: company.agent_name,
        },
        date: parsed.date,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
        slots,
      });
    }

    if (parsed.month) {
      const days = await getMonthAvailability({
        companyId: company.id,
        month: parsed.month,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
      });
      return jsonOk({
        company: {
          slug: company.slug,
          name: company.name,
          agentName: company.agent_name,
        },
        month: parsed.month,
        timeZone: parsed.timeZone,
        durationMinutes: duration,
        days,
      });
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
