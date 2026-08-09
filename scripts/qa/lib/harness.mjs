/**
 * Shared QA harness: env loading, HTTP helpers, assertions, result table.
 *
 * Every suite creates a run, registers named tests, and finishes. The run
 * prints a pass/fail table, writes a JSON result file that all.mjs
 * consolidates, and sets the process exit code.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const QA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(QA_DIR, "..", "..");
export const RESULTS_DIR = join(QA_DIR, "results");

/** Load .env.local into process.env without clobbering real env vars. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();

export const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** The real demo company. Overridable so the suite can point at another tenant. */
export const DEMO = {
  slug: process.env.QA_COMPANY_SLUG || "grok-fde",
  id: process.env.QA_COMPANY_ID || "778f9573-b6c6-4530-826d-1a29e536fc58",
  agentName: "Atlas",
};

/**
 * Run id namespaces everything this run writes to the database, so QA
 * artifacts are trivially identifiable and never read as real demo data.
 */
export const RUN_ID = `qa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const qaName = (label) => `${RUN_ID}-${label}`;
export const qaEmail = (label) => `${RUN_ID}-${label}@qa.invalid`;

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual, expected, what) {
  if (actual !== expected) {
    throw new AssertionError(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertOneOf(actual, allowed, what) {
  if (!allowed.includes(actual)) {
    throw new AssertionError(`${what}: expected one of ${JSON.stringify(allowed)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Shape assertion. Spec maps a dotted path to a checker:
 * "string" | "number" | "boolean" | "array" | "object" | "string?" | fn.
 */
export function assertShape(value, spec, label = "response") {
  for (const [path, kind] of Object.entries(spec)) {
    const found = readPath(value, path);
    const optional = typeof kind === "string" && kind.endsWith("?");
    const base = typeof kind === "string" ? kind.replace(/\?$/, "") : kind;

    if (found === undefined || found === null) {
      if (optional) continue;
      throw new AssertionError(`${label}.${path} is missing (got ${JSON.stringify(found)})`);
    }
    if (typeof base === "function") {
      const problem = base(found);
      if (problem) throw new AssertionError(`${label}.${path} ${problem}`);
      continue;
    }
    const actual = Array.isArray(found) ? "array" : typeof found;
    if (actual !== base) {
      throw new AssertionError(`${label}.${path}: expected ${base}, got ${actual}`);
    }
  }
}

function readPath(root, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), root);
}

/** fetch with an explicit timeout that always returns status + parsed body. */
export async function request(path, options = {}) {
  const { timeoutMs = 30_000, ...init } = options;
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    let json = null;
    if (contentType.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return {
      url,
      status: res.status,
      contentType,
      headers: res.headers,
      text,
      json,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new AssertionError(`request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(path, body, options = {}) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...options,
  });
}

/**
 * Assert a route failed the way the contract promises: a real JSON error
 * envelope with the expected status, never an HTML error page.
 */
export function assertErrorEnvelope(res, expectedStatus) {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  assert(
    !res.text.trimStart().startsWith("<"),
    `expected a JSON error envelope, got an HTML page (status ${res.status}): ${res.text.slice(0, 120)}`,
  );
  assert(
    res.contentType.includes("application/json"),
    `expected content-type application/json, got "${res.contentType}" (status ${res.status})`,
  );
  assertOneOf(res.status, statuses, "status");
  assert(res.json != null, "response body did not parse as JSON");
  assertShape(res.json, { "error.code": "string", "error.message": "string" }, "body");
  return res.json.error;
}

const GREEN = "[32m";
const RED = "[31m";
const YELLOW = "[33m";
const DIM = "[2m";
const BOLD = "[1m";
const RESET = "[0m";
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (color ? `${code}${text}${RESET}` : text);

export function createRun(suite, title) {
  const results = [];
  const startedAt = Date.now();

  console.log(`\n${paint(BOLD, `${title || suite}`)}  ${paint(DIM, `base=${BASE_URL} run=${RUN_ID}`)}\n`);

  async function test(name, fn, options = {}) {
    const at = Date.now();
    try {
      const detail = await fn();
      results.push({ suite, name, status: "pass", detail: detail || "", ms: Date.now() - at });
    } catch (err) {
      // An operator endpoint that answers 401 without a session is the auth
      // contract working, not a broken route, so it is reported as a SKIP with
      // the reason rather than a failure. That the gate is actually shut is
      // asserted directly in auth.mjs, so this cannot hide a missing gate.
      if (/got 401/.test(err.message) && !options.expectsAuth) {
        results.push({
          suite,
          name,
          status: "skip",
          detail: "gated: needs an operator session (gating asserted in the auth suite)",
          ms: Date.now() - at,
        });
        printRow(results[results.length - 1]);
        return false;
      }
      if (options.skipOn && options.skipOn(err)) {
        results.push({ suite, name, status: "skip", detail: err.message, ms: Date.now() - at });
      } else {
        results.push({
          suite,
          name,
          status: "fail",
          detail: err instanceof AssertionError ? err.message : `${err.name}: ${err.message}`,
          ms: Date.now() - at,
        });
      }
    }
    const last = results[results.length - 1];
    printRow(last);
    return last.status === "pass";
  }

  function skip(name, reason) {
    const row = { suite, name, status: "skip", detail: reason, ms: 0 };
    results.push(row);
    printRow(row);
  }

  function record(row) {
    results.push({ suite, ms: 0, detail: "", ...row });
    printRow(results[results.length - 1]);
  }

  function finish() {
    const pass = results.filter((r) => r.status === "pass").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const skipped = results.filter((r) => r.status === "skip").length;
    const totalMs = Date.now() - startedAt;

    console.log("");
    if (fail > 0) {
      console.log(paint(BOLD, "Failures"));
      for (const r of results.filter((x) => x.status === "fail")) {
        console.log(`  ${paint(RED, "FAIL")}  ${r.name}\n        ${r.detail}`);
      }
      console.log("");
    }
    const verdict = fail === 0 ? paint(GREEN, "PASS") : paint(RED, "FAIL");
    console.log(
      `${verdict}  ${suite}: ${pass} passed, ${fail} failed, ${skipped} skipped  ${paint(DIM, `(${(totalMs / 1000).toFixed(1)}s)`)}\n`,
    );

    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(
      join(RESULTS_DIR, `${suite}.json`),
      JSON.stringify({ suite, baseUrl: BASE_URL, runId: RUN_ID, totalMs, pass, fail, skipped, results }, null, 2),
    );

    process.exitCode = fail > 0 ? 1 : 0;
    return { pass, fail, skipped, results };
  }

  return { test, skip, record, finish, results };
}

function printRow(r) {
  const tag =
    r.status === "pass" ? paint(GREEN, "PASS") : r.status === "fail" ? paint(RED, "FAIL") : paint(YELLOW, "SKIP");
  const name = r.name.length > 58 ? `${r.name.slice(0, 57)}…` : r.name.padEnd(58);
  const ms = r.ms ? paint(DIM, `${String(r.ms).padStart(6)}ms`) : paint(DIM, "        -");
  const detail = r.status === "pass" ? paint(DIM, r.detail || "") : r.detail;
  console.log(`  ${tag}  ${name} ${ms}  ${detail}`);
}

/** Placeholder strings that must never reach a rendered page. */
export const PLACEHOLDER_PATTERNS = [
  { label: "lorem ipsum", re: /\blorem ipsum\b/i },
  { label: "example.com", re: /example\.com/i },
  { label: "Your Company", re: /Your Company\b/ },
  { label: "literal undefined", re: /(^|[\s>"'(,:])undefined([\s<"'),.:]|$)/ },
  { label: "literal NaN", re: /(^|[\s>"'(,:])NaN([\s<"'),.:]|$)/ },
  { label: "[object Object]", re: /\[object Object\]/ },
  { label: "unrendered {{token}}", re: /\{\{\s*[A-Za-z0-9_.]+\s*\}\}/ },
];

/**
 * Scan rendered HTML for placeholder leakage. Script/JSON payloads are
 * stripped first: Next.js flight data legitimately contains the string
 * "undefined" and is never shown to a human.
 */
export function findPlaceholders(html) {
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const hits = [];
  for (const { label, re } of PLACEHOLDER_PATTERNS) {
    const match = visible.match(re);
    if (match) {
      const at = Math.max(0, match.index - 60);
      hits.push(`${label} near "${visible.slice(at, match.index + 60).replace(/\s+/g, " ").trim()}"`);
    }
  }
  return hits;
}
