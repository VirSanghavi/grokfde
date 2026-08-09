#!/usr/bin/env node
/**
 * Runs every QA suite and prints one consolidated report.
 *
 * Suites run in order of how fast they tell you something useful: API first
 * (fastest, proves the backend), then routes, then voice (proves the demo
 * centerpiece), then the browser pass (slowest, proves the pixels).
 *
 * Exits non-zero if any suite fails, so this is safe to gate a deploy on.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BASE_URL, QA_DIR, RESULTS_DIR } from "./lib/harness.mjs";

const ALL_SUITES = ["api", "routes", "voice", "auth", "browser"];

const requested = (process.env.QA_SUITES || process.argv.slice(2).filter((a) => !a.startsWith("-")).join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const suites = requested.length ? ALL_SUITES.filter((s) => requested.includes(s)) : ALL_SUITES;
const unknown = requested.filter((s) => !ALL_SUITES.includes(s));
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(", ")}. Available: ${ALL_SUITES.join(", ")}`);
  process.exit(2);
}

// Start from a clean slate so a stale result file cannot fake a pass.
rmSync(RESULTS_DIR, { recursive: true, force: true });
mkdirSync(RESULTS_DIR, { recursive: true });

const BOLD = "[1m";
const DIM = "[2m";
const GREEN = "[32m";
const RED = "[31m";
const YELLOW = "[33m";
const RESET = "[0m";
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (c, t) => (color ? `${c}${t}${RESET}` : t);

console.log(`\n${paint(BOLD, "Grok FDE QA")}  ${paint(DIM, `base=${BASE_URL}  suites=${suites.join(", ")}`)}`);
console.log(paint(DIM, "".padEnd(78, "=")));

function runSuite(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(QA_DIR, `${name}.mjs`)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`  could not start the ${name} suite: ${err.message}`);
      resolve(1);
    });
  });
}

const exitCodes = {};
for (const suite of suites) {
  console.log(paint(DIM, "".padEnd(78, "-")));
  exitCodes[suite] = await runSuite(suite);
}

// ---------------------------------------------------------------------------
// Consolidated report
// ---------------------------------------------------------------------------

console.log(paint(DIM, "".padEnd(78, "=")));
console.log(`\n${paint(BOLD, "Consolidated report")}  ${paint(DIM, `base=${BASE_URL}`)}\n`);

let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;
const allFailures = [];
const missing = [];

for (const suite of suites) {
  const file = join(RESULTS_DIR, `${suite}.json`);
  if (!existsSync(file)) {
    missing.push(suite);
    console.log(
      `  ${paint(RED, "ERROR")}  ${suite.padEnd(10)} produced no results (exit ${exitCodes[suite]}) - the suite crashed before finishing`,
    );
    totalFail += 1;
    continue;
  }

  const data = JSON.parse(readFileSync(file, "utf8"));
  totalPass += data.pass;
  totalFail += data.fail;
  totalSkip += data.skipped;
  allFailures.push(...data.results.filter((r) => r.status === "fail"));

  const verdict = data.fail === 0 ? paint(GREEN, "PASS ") : paint(RED, "FAIL ");
  const skipNote = data.skipped ? paint(YELLOW, `, ${data.skipped} skipped`) : "";
  console.log(
    `  ${verdict}  ${suite.padEnd(10)} ${String(data.pass).padStart(3)} passed, ${String(data.fail).padStart(3)} failed${skipNote}  ${paint(DIM, `(${(data.totalMs / 1000).toFixed(1)}s)`)}`,
  );
}

if (allFailures.length) {
  console.log(`\n${paint(BOLD, `${allFailures.length} failing check${allFailures.length === 1 ? "" : "s"}`)}\n`);
  for (const f of allFailures) {
    console.log(`  ${paint(RED, "FAIL")}  ${paint(DIM, `[${f.suite}]`)} ${f.name}`);
    console.log(`        ${f.detail.split("\n").join("\n        ")}`);
  }
}

const shots = join(QA_DIR, "screenshots");
if (existsSync(shots)) {
  console.log(`\n  ${paint(DIM, `screenshots: ${shots}`)}`);
}
console.log(`  ${paint(DIM, `raw results: ${RESULTS_DIR}`)}`);

const ok = totalFail === 0 && missing.length === 0;
console.log(
  `\n${ok ? paint(GREEN, `${BOLD}PASS`) : paint(RED, `${BOLD}FAIL`)}  ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped\n`,
);

process.exit(ok ? 0 : 1);
