import { getBookingById, serializeBooking } from "@/lib/server/bookings";
import { getCompanyById } from "@/lib/server/company-context";
import { ApiError, errorResponse, jsonOk } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return jsonOk({ booking: serializeBooking(booking, company) });
  } catch (err) {
    return errorResponse(err);
  }
}
