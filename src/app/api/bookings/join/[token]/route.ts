import {
  getBookingByToken,
  joinWindowStatus,
  serializeBooking,
} from "@/lib/server/bookings";
import { getCompanyById } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve join token → booking + join eligibility */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    const booking = await getBookingByToken(token);
    if (!booking) {
      throw new ApiError("NOT_FOUND", "Demo link not found", { status: 404 });
    }
    const company = await getCompanyById(booking.company_id);
    const window = joinWindowStatus(booking);
    return jsonOk({
      booking: serializeBooking(booking, company),
      join: window,
      fdePath:
        booking.prospect_id
          ? `/fde/${company.slug}/p/${booking.prospect_id}?call=1&booking=${booking.id}`
          : `/fde/${company.slug}?call=1&booking=${booking.id}`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Mark booking completed when guest joins (optional telemetry) */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    const booking = await getBookingByToken(token);
    if (!booking) {
      throw new ApiError("NOT_FOUND", "Demo link not found", { status: 404 });
    }
    const window = joinWindowStatus(booking);
    if (!window.canJoin) {
      throw new ApiError("BAD_REQUEST", window.message, { status: 403 });
    }
    const db = getSupabaseAdmin();
    await db
      .from("demo_bookings")
      .update({
        metadata_json: {
          ...(booking.metadata_json ?? {}),
          joinedAt: new Date().toISOString(),
        },
      })
      .eq("id", booking.id);

    const company = await getCompanyById(booking.company_id);
    return jsonOk({
      ok: true,
      booking: serializeBooking(booking, company),
      fdePath:
        booking.prospect_id
          ? `/fde/${company.slug}/p/${booking.prospect_id}?call=1&booking=${booking.id}`
          : `/fde/${company.slug}?call=1&booking=${booking.id}`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
