import { z } from "zod";
import {
  createDemoBooking,
  listCompanyBookings,
  serializeBooking,
} from "@/lib/server/bookings";
import { getCompanyById, getCompanyBySlug } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CreateSchema = z.object({
  slug: z.string().min(1),
  startsAt: z.string().min(1),
  timeZone: z.string().min(1),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(200),
  guestCompany: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(15).max(120).optional(),
});

/** Public: create a demo booking */
export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const company = await getCompanyBySlug(body.slug);
    const booking = await createDemoBooking({
      company,
      startsAtIso: body.startsAt,
      timeZone: body.timeZone,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestCompany: body.guestCompany,
      notes: body.notes,
      durationMinutes: body.durationMinutes,
    });
    return jsonOk(
      {
        booking: serializeBooking(booking, company),
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Invalid booking payload", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}

/** Company ops: list bookings (X-Company-Id or slug) */
export async function GET(req: Request) {
  try {
    // Operator-only. This list carries guest names, guest emails, and join tokens,
    // so an anonymous caller who knows a company slug (which is public by design,
    // it is the prospect URL) could otherwise enumerate everyone who ever booked
    // AND hold the token needed to join their call. The page that renders this is
    // already gated; gating the page alone left the data open, because the page is
    // only one caller of the endpoint.
    // createClient returns null when Supabase auth is not configured. Treat that as
    // "cannot verify", and refuse, rather than falling open. A misconfiguration must
    // never silently downgrade this into the public endpoint it used to be.
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) {
      throw new ApiError("UNAUTHORIZED", "Sign in to view bookings", {
        status: 401,
      });
    }

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const companyIdHeader = req.headers.get("x-company-id");

    let company;
    if (slug) {
      company = await getCompanyBySlug(slug);
    } else if (companyIdHeader) {
      company = await getCompanyById(companyIdHeader);
    } else {
      throw new ApiError("BAD_REQUEST", "slug or X-Company-Id required", {
        status: 400,
      });
    }

    const from = url.searchParams.get("from") ?? undefined;
    const bookings = await listCompanyBookings(company.id, { from });
    return jsonOk({
      bookings: bookings.map((b) => serializeBooking(b, company)),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
