import { buildBookingIcs, getBookingById } from "@/lib/server/bookings";
import { getCompanyById } from "@/lib/server/company-context";
import { ApiError, errorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloadable calendar invite for a booking. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const booking = await getBookingById(id);
    if (!booking) {
      throw new ApiError("NOT_FOUND", "Booking not found", { status: 404 });
    }
    const company = await getCompanyById(booking.company_id);
    const ics = buildBookingIcs(booking, company);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="demo-with-${company.agent_name || "atlas"}.ics"`.toLowerCase(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
