import {
  bookingFdePath,
  getBookingByToken,
  joinWindowStatus,
  serializeBooking,
} from "@/lib/server/bookings";
import { getCompanyById } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve join token to booking + join eligibility */
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
    return jsonOk({
      booking: serializeBooking(booking, company),
      join: joinWindowStatus(booking),
      fdePath: bookingFdePath(booking, company.slug),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Record the guest arriving, then hand back where to send them. */
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
      fdePath: bookingFdePath(booking, company.slug),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
