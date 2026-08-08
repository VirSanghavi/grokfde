import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { ingestBinaryFile, ingestTextKnowledge, sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const companyId = String(form.get("companyId") ?? "");
      const title = String(form.get("title") ?? form.get("filename") ?? "Uploaded file");
      const file = form.get("file");

      if (!companyId) {
        throw new ApiError("BAD_REQUEST", "companyId is required", { status: 400 });
      }
      if (!(file instanceof File)) {
        throw new ApiError("BAD_REQUEST", "file is required", { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const filename = file.name || "upload.bin";
      const fileType = file.type || "application/octet-stream";

      const isText =
        fileType.startsWith("text/") ||
        /\.(md|txt|csv|json|ts|js|py|yml|yaml)$/i.test(filename);

      const source = isText
        ? await ingestTextKnowledge({
            companyId,
            type: "file",
            title,
            content: bytes.toString("utf8"),
            filename,
            contentType: fileType,
          })
        : await ingestBinaryFile({
            companyId,
            title,
            filename,
            bytes,
            contentType: fileType,
          });

      return jsonOk({ source: sourceToPublic(source) }, 201);
    }

    // JSON fallback: { companyId, title, content, filename? }
    const body = (await req.json()) as {
      companyId?: string;
      title?: string;
      content?: string;
      filename?: string;
    };

    if (!body.companyId || !body.content) {
      throw new ApiError("BAD_REQUEST", "companyId and content are required", {
        status: 400,
      });
    }

    const source = await ingestTextKnowledge({
      companyId: body.companyId,
      type: "file",
      title: body.title || body.filename || "Uploaded document",
      content: body.content,
      filename: body.filename,
    });

    return jsonOk({ source: sourceToPublic(source) }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
