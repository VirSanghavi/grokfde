import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { errorResponse, jsonOk, ApiError } from "@/lib/server/errors";
import { htmlToText, ingestTextKnowledge, sourceToPublic } from "@/lib/server/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 20000;
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 100_000;
const MIN_USEFUL_CHARS = 120;
const MAX_REDIRECTS = 4;

const Schema = z.object({
  companyId: z.string().uuid(),
  // Deliberately loose. People paste "acme.com" and "docs.acme.com/start" far more
  // often than they paste a fully formed URL, and rejecting that is friction we
  // can simply absorb here.
  url: z.string().trim().min(3),
  title: z.string().trim().optional(),
});

/** "docs.acme.com/start" becomes https://docs.acme.com/start. */
function normalizeUrl(raw: string): URL {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new ApiError(
      "BAD_REQUEST",
      `That does not look like a web address. Try something like https://docs.yourcompany.com`,
      { status: 400 },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError("BAD_REQUEST", "Only http and https pages can be read.", {
      status: 400,
    });
  }

  return parsed;
}

/**
 * Is this resolved IP somewhere we must never fetch from?
 *
 * Loopback, RFC1918, carrier NAT, link local (169.254.0.0/16 is the cloud
 * metadata endpoint and the reason this check exists), IPv6 loopback, unique
 * local fc00::/7, link local fe80::/10, and IPv4 mapped into IPv6.
 */
function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    // ::ffff:127.0.0.1 and friends are IPv4 wearing a hat.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
    if (mapped) return isBlockedAddress(mapped[1]!);
    const head = ip.split(":")[0] ?? "";
    if (/^f[cd][0-9a-f]{2}$/.test(head)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]$/.test(head)) return true; // fe80::/10
    return false;
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true; // metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

const PRIVATE_ADDRESS_MESSAGE =
  "That address resolves to a private network, so it cannot be read from here. Use a public URL.";

/**
 * Resolves the host and refuses if ANY answer is internal.
 *
 * Hostname string matching is not enough: a perfectly public name can resolve to
 * 127.0.0.1 or to 169.254.169.254, which is how this endpoint would otherwise
 * hand out cloud credentials to an anonymous caller.
 */
async function assertPublicHost(target: URL): Promise<void> {
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ApiError("BAD_REQUEST", PRIVATE_ADDRESS_MESSAGE, { status: 400 });
  }

  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new ApiError("BAD_REQUEST", PRIVATE_ADDRESS_MESSAGE, { status: 400 });
    }
    return;
  }

  let answers: Array<{ address: string }>;
  try {
    answers = await lookup(host, { all: true });
  } catch {
    throw new ApiError(
      "KNOWLEDGE_INGESTION_FAILED",
      `We could not find ${host}. Check the address and try again.`,
      { status: 502 },
    );
  }

  if (answers.length === 0 || answers.some((a) => isBlockedAddress(a.address))) {
    throw new ApiError("BAD_REQUEST", PRIVATE_ADDRESS_MESSAGE, { status: 400 });
  }
}

/** The page's own <title>, so the source is not named after a 90 character URL. */
function extractTitle(html: string, fallback: string): string {
  const match = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  const raw = match?.[1]
    ?.replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
  return raw && raw.length > 1 ? raw.slice(0, 160) : fallback;
}

/** Reads at most MAX_BYTES so one enormous page cannot exhaust the server. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (received >= MAX_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return text + decoder.decode();
}

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const target = normalizeUrl(body.url);

    // Redirects are followed by hand so every hop is validated. With
    // redirect: "follow" a public URL can bounce straight to 169.254.169.254 and
    // the guard on the first hop buys nothing.
    let current = target;
    let res: Response;

    for (let hop = 0; ; hop++) {
      await assertPublicHost(current);

      try {
        res = await fetch(current, {
          headers: {
            "User-Agent": "GrokFDE-Ingest/1.0 (+https://grokfde.com)",
            Accept: "text/html,text/plain,application/xhtml+xml,text/markdown;q=0.9,*/*;q=0.5",
          },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (err) {
        const timedOut = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
        throw new ApiError(
          "KNOWLEDGE_INGESTION_FAILED",
          timedOut
            ? `${current.hostname} took longer than 20 seconds to answer. Try again, or paste the text instead.`
            : `We could not reach ${current.hostname}. Check the address and try again.`,
          { status: 502 },
        );
      }

      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;

      if (hop >= MAX_REDIRECTS) {
        throw new ApiError(
          "KNOWLEDGE_INGESTION_FAILED",
          `${target.hostname} kept redirecting. Try linking the final page directly.`,
          { status: 502 },
        );
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ApiError(
          "KNOWLEDGE_INGESTION_FAILED",
          `${current.hostname} redirected somewhere we could not read.`,
          { status: 502 },
        );
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new ApiError("BAD_REQUEST", "Only http and https pages can be read.", {
          status: 400,
        });
      }
      current = next;
    }

    if (!res.ok) {
      const reason =
        res.status === 404
          ? "that page does not exist"
          : res.status === 401 || res.status === 403
            ? "that page needs a login"
            : res.status >= 500
              ? "the site returned a server error"
              : `the site answered with ${res.status}`;
      throw new ApiError(
        "KNOWLEDGE_INGESTION_FAILED",
        `We reached ${current.hostname} but ${reason}. Try a public page, or paste the text instead.`,
        { status: 502 },
      );
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !/text\/|json|xml|markdown|javascript/.test(contentType)
    ) {
      throw new ApiError(
        "KNOWLEDGE_INGESTION_FAILED",
        `That link is a ${contentType.split(";")[0]} file, which cannot be read as text. Upload it as a file instead.`,
        { status: 415 },
      );
    }

    const raw = await readCapped(res);
    const isHtml = contentType.includes("html") || /^\s*<(!doctype|html)/i.test(raw);
    const text = isHtml ? await htmlToText(raw) : raw;

    if (!text || text.trim().length < MIN_USEFUL_CHARS) {
      throw new ApiError(
        "KNOWLEDGE_INGESTION_FAILED",
        `${current.hostname} loaded but had almost no readable text, which usually means the page renders in the browser. Paste the text instead.`,
        { status: 422 },
      );
    }

    const title =
      body.title ||
      (isHtml ? extractTitle(raw, current.hostname + current.pathname) : current.hostname + current.pathname);

    const source = await ingestTextKnowledge({
      companyId: body.companyId,
      type: "url",
      title,
      content: text.slice(0, MAX_CHARS),
      sourceUrl: current.toString(),
      contentType: "text/plain",
      filename: "url-source.txt",
    });

    return jsonOk({ source: sourceToPublic(source) }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(
        new ApiError("BAD_REQUEST", "Enter the address of a page we can read.", {
          status: 400,
          details: err.flatten(),
        }),
      );
    }
    return errorResponse(err);
  }
}
