import {
  addFileToCollection,
  askGrokStructured,
  uploadFileToXai,
} from "@/lib/ai/grok";
import {
  COMPANY_EXTRACTION_SYSTEM,
  companyExtractionUserPrompt,
} from "@/lib/ai/prompts/company-extraction";
import { mergeKnowledgeSummary, parseKnowledgeSummary } from "./merge";
import { getSupabaseAdmin } from "./supabase-admin";
import { KnowledgeSummarySchema, type CompanyRow, type KnowledgeSourceRow } from "./types";
import { ApiError } from "./errors";

function slugifyFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "knowledge"
  );
}

export async function extractAndMergeCompanyKnowledge(args: {
  company: CompanyRow;
  sourceTitle: string;
  content: string;
}): Promise<void> {
  try {
    const extracted = await askGrokStructured({
      schema: KnowledgeSummarySchema,
      schemaName: "CompanyKnowledge",
      messages: [
        { role: "system", content: COMPANY_EXTRACTION_SYSTEM },
        {
          role: "user",
          content: companyExtractionUserPrompt({
            companyName: args.company.name,
            sourceTitle: args.sourceTitle,
            content: args.content,
          }),
        },
      ],
    });

    const merged = mergeKnowledgeSummary(args.company.knowledge_summary_json, extracted);
    const db = getSupabaseAdmin();
    await db
      .from("companies")
      .update({
        knowledge_summary_json: merged,
        description:
          args.company.description ||
          merged.companyDescription ||
          merged.valueProposition ||
          null,
      })
      .eq("id", args.company.id);
  } catch (err) {
    console.warn("[knowledge] extraction failed", err);
    // Non-fatal: source can still be ready with raw file available
  }
}

export async function ingestTextKnowledge(args: {
  companyId: string;
  type: "paste" | "url" | "file";
  title: string;
  content: string;
  sourceUrl?: string;
  contentType?: string;
  filename?: string;
}): Promise<KnowledgeSourceRow> {
  const db = getSupabaseAdmin();

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("*")
    .eq("id", args.companyId)
    .single();

  if (companyError || !company) {
    throw new ApiError("NOT_FOUND", "Company not found", { status: 404 });
  }

  const { data: source, error: insertError } = await db
    .from("knowledge_sources")
    .insert({
      company_id: args.companyId,
      type: args.type,
      title: args.title,
      source_url: args.sourceUrl ?? null,
      status: "processing",
      metadata_json: { bytes: Buffer.byteLength(args.content, "utf8") },
    })
    .select("*")
    .single();

  if (insertError || !source) {
    throw new ApiError("KNOWLEDGE_INGESTION_FAILED", "Could not create knowledge source", {
      status: 500,
      details: insertError?.message,
    });
  }

  try {
    const filename =
      args.filename || `${slugifyFilename(args.title)}.${args.type === "url" ? "html" : "md"}`;

    let fileId: string | null = null;
    let xaiFilename = filename;

    if (process.env.XAI_API_KEY) {
      try {
        const uploaded = await uploadFileToXai(
          args.content,
          filename,
          args.contentType ?? "text/markdown",
        );
        fileId = uploaded.fileId;
        xaiFilename = uploaded.filename;
        if (company.xai_collection_id) {
          await addFileToCollection(company.xai_collection_id, uploaded.fileId);
        }
      } catch (uploadErr) {
        console.warn("[knowledge] xAI upload failed; storing text locally", uploadErr);
      }
    }

    await extractAndMergeCompanyKnowledge({
      company: company as CompanyRow,
      sourceTitle: args.title,
      content: args.content,
    });

    // Offline / no-key: still merge a lightweight heuristic summary from raw text
    if (!process.env.XAI_API_KEY) {
      await heuristicMergeFromText(company as CompanyRow, args.content);
    }

    const { data: ready, error: updateError } = await db
      .from("knowledge_sources")
      .update({
        status: "ready",
        xai_file_id: fileId,
        metadata_json: {
          ...(source.metadata_json as object),
          xai_filename: xaiFilename,
          // Keep a content excerpt server-side for offline grounding (not returned publicly)
          content_excerpt: args.content.slice(0, 12000),
          offline: !fileId,
        },
      })
      .eq("id", source.id)
      .select("*")
      .single();

    if (updateError || !ready) {
      throw new ApiError("KNOWLEDGE_INGESTION_FAILED", "Failed to mark source ready", {
        status: 500,
        details: updateError?.message,
      });
    }

    return ready as KnowledgeSourceRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    await db
      .from("knowledge_sources")
      .update({ status: "error", error_message: message.slice(0, 500) })
      .eq("id", source.id);

    if (err instanceof ApiError) throw err;
    throw new ApiError("KNOWLEDGE_INGESTION_FAILED", message, {
      status: 502,
      details: err,
    });
  }
}

async function heuristicMergeFromText(company: CompanyRow, content: string): Promise<void> {
  const lines = content
    .split(/\n+/)
    .map((l) => l.replace(/^[-*#\s]+/, "").trim())
    .filter((l) => l.length > 20 && l.length < 240)
    .slice(0, 12);

  const capabilities = lines.filter((l) =>
    /chat|email|voice|mcp|memory|architect|knowledge|call/i.test(l),
  );
  const integrations = Array.from(
    content.matchAll(/\b(Kubernetes|AWS|GCP|Azure|Salesforce|GitHub|MCP)\b/g),
  ).map((m) => m[1]);

  const partial = {
    products: [/Grok FDE/i.test(content) ? "Grok FDE" : company.name],
    capabilities: capabilities.length ? capabilities.slice(0, 8) : lines.slice(0, 5),
    useCases: lines.filter((l) => /prospect|sales|engineer|buyer/i.test(l)).slice(0, 5),
    integrations: Array.from(new Set(integrations)),
    technicalFacts: lines.filter((l) => /api|collection|websocket|tool/i.test(l)).slice(0, 6),
    pricingFacts: lines.filter((l) => /pric|enterprise|cost/i.test(l)).slice(0, 4),
    securityFacts: lines.filter((l) => /security|hipaa|compliance|fabricat/i.test(l)).slice(0, 4),
    implementationFacts: lines.filter((l) => /upload|implement|deploy|train/i.test(l)).slice(0, 4),
    commonObjections: [],
    buyerTypes: lines.filter((l) => /buyer|team|founder/i.test(l)).slice(0, 4),
    companyDescription: lines[0],
    valueProposition: lines.find((l) => /every prospect|value|engineer/i.test(l)),
  };

  const merged = mergeKnowledgeSummary(company.knowledge_summary_json, partial);
  const db = getSupabaseAdmin();
  await db
    .from("companies")
    .update({
      knowledge_summary_json: merged,
      description: company.description || merged.companyDescription || null,
    })
    .eq("id", company.id);
}

export async function ingestBinaryFile(args: {
  companyId: string;
  title: string;
  filename: string;
  bytes: Buffer;
  contentType: string;
}): Promise<KnowledgeSourceRow> {
  const db = getSupabaseAdmin();

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("*")
    .eq("id", args.companyId)
    .single();

  if (companyError || !company) {
    throw new ApiError("NOT_FOUND", "Company not found", { status: 404 });
  }

  const { data: source, error: insertError } = await db
    .from("knowledge_sources")
    .insert({
      company_id: args.companyId,
      type: "file",
      title: args.title,
      status: "processing",
      metadata_json: {
        filename: args.filename,
        contentType: args.contentType,
        bytes: args.bytes.length,
      },
    })
    .select("*")
    .single();

  if (insertError || !source) {
    throw new ApiError("KNOWLEDGE_INGESTION_FAILED", "Could not create knowledge source", {
      status: 500,
      details: insertError?.message,
    });
  }

  try {
    let fileId: string | null = null;
    if (process.env.XAI_API_KEY) {
      try {
        const uploaded = await uploadFileToXai(args.bytes, args.filename, args.contentType);
        fileId = uploaded.fileId;
        if (company.xai_collection_id) {
          await addFileToCollection(company.xai_collection_id, uploaded.fileId);
        }
      } catch (uploadErr) {
        console.warn("[knowledge] binary xAI upload failed", uploadErr);
      }
    }

    const textish =
      args.contentType.startsWith("text/") ||
      args.filename.endsWith(".md") ||
      args.filename.endsWith(".txt") ||
      args.filename.endsWith(".csv") ||
      args.filename.endsWith(".json");

    const extractText = textish
      ? args.bytes.toString("utf8")
      : `Uploaded file "${args.filename}" (${args.contentType}, ${args.bytes.length} bytes) for company knowledge.`;

    await extractAndMergeCompanyKnowledge({
      company: company as CompanyRow,
      sourceTitle: args.title,
      content: extractText,
    });

    if (!process.env.XAI_API_KEY && textish) {
      await heuristicMergeFromText(company as CompanyRow, extractText);
    }

    const { data: ready, error: updateError } = await db
      .from("knowledge_sources")
      .update({
        status: "ready",
        xai_file_id: fileId,
        metadata_json: {
          ...(source.metadata_json as object),
          offline: !fileId,
          content_excerpt: textish ? extractText.slice(0, 12000) : undefined,
        },
      })
      .eq("id", source.id)
      .select("*")
      .single();

    if (updateError || !ready) {
      throw new ApiError("KNOWLEDGE_INGESTION_FAILED", "Failed to mark source ready", {
        status: 500,
      });
    }
    return ready as KnowledgeSourceRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    await db
      .from("knowledge_sources")
      .update({ status: "error", error_message: message.slice(0, 500) })
      .eq("id", source.id);
    if (err instanceof ApiError) throw err;
    throw new ApiError("KNOWLEDGE_INGESTION_FAILED", message, { status: 502 });
  }
}

export function sourceToPublic(source: KnowledgeSourceRow) {
  return {
    id: source.id,
    title: source.title,
    type: source.type,
    status: source.status,
    sourceUrl: source.source_url,
    createdAt: source.created_at,
    errorMessage: source.error_message,
  };
}

export function companyPublic(company: CompanyRow) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    description: company.description,
    agentName: company.agent_name,
    agentVoice: company.agent_voice,
    agentGreeting: company.agent_greeting,
    xaiCollectionId: company.xai_collection_id,
    knowledgeSummary: parseKnowledgeSummary(company.knowledge_summary_json),
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
}

export async function htmlToText(html: string): Promise<string> {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
