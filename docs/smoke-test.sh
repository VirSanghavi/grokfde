#!/usr/bin/env bash
#
# Pre-demo smoke test. Read-only and fast: run it in the lobby, before you walk
# into the room.
#
# It touches only the demo-critical path and it WRITES NOTHING, so it can be run
# as many times as you like without filling the database with junk companies.
# For the full suite (API contracts, page routes, real browser, realtime voice)
# run `npm run qa`, documented in docs/QA.md.
#
#   ./docs/smoke-test.sh
#   BASE_URL=https://grokfde.com ./docs/smoke-test.sh
#
set -uo pipefail

BASE_URL="${BASE_URL:-${BASE:-http://localhost:3000}}"
BASE_URL="${BASE_URL%/}"
SLUG="${QA_COMPANY_SLUG:-grok-fde}"

pass=0
fail=0

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; DIM=''; BOLD=''; RESET=''
fi

ok()   { pass=$((pass+1)); printf '  %sPASS%s  %-46s %s%s%s\n' "$GREEN" "$RESET" "$1" "$DIM" "${2:-}" "$RESET"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s  %-46s %s\n' "$RED" "$RESET" "$1" "${2:-}"; }

# Fetch a URL into $BODY and $CODE. Never aborts the script on a bad status.
fetch() {
  local url="$1"
  local tmp
  tmp="$(mktemp)"
  CODE="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 45 "$url" 2>/dev/null || echo 000)"
  BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

# Read a dotted path out of $BODY. Prints nothing when absent.
json() {
  BODY="$BODY" node -e '
    const path = process.argv[1].split(".");
    let v;
    try { v = JSON.parse(process.env.BODY); } catch { process.exit(0); }
    for (const k of path) { if (v == null) break; v = v[k]; }
    if (v !== undefined && v !== null) process.stdout.write(String(Array.isArray(v) ? v.length : v));
  ' "$1" 2>/dev/null
}

printf '\n%sGrok FDE pre-demo smoke%s  %sbase=%s slug=%s (read-only)%s\n\n' \
  "$BOLD" "$RESET" "$DIM" "$BASE_URL" "$SLUG" "$RESET"

# --- the server is up and configured ----------------------------------------
fetch "$BASE_URL/api/health"
if [ "$CODE" = "200" ] && [ "$(json ok)" = "true" ]; then
  xai="$(json xaiConfigured)"; supa="$(json supabaseConfigured)"
  if [ "$xai" = "true" ] && [ "$supa" = "true" ]; then
    ok "health" "$(json models.text) / $(json models.voice)"
  else
    bad "health" "server is up but keys are missing (xai=$xai supabase=$supa)"
  fi
else
  bad "health" "HTTP $CODE"
fi

# --- the company the demo is pinned to --------------------------------------
fetch "$BASE_URL/api/company?slug=$SLUG"
COMPANY_ID="$(json company.id)"
if [ "$CODE" = "200" ] && [ -n "$COMPANY_ID" ]; then
  ok "company resolves" "$(json company.name) / agent $(json company.agentName)"
else
  bad "company resolves" "HTTP $CODE, the demo link is dead"
fi

# --- knowledge is actually ingested, or chat has nothing to retrieve --------
# Only the ?id= variant embeds the sources; ?slug= returns the company alone.
if [ -n "$COMPANY_ID" ]; then
  fetch "$BASE_URL/api/company?id=$COMPANY_ID"
  sources="$(json knowledgeSources)"
  if [ -n "$sources" ] && [ "$sources" != "0" ]; then
    ok "knowledge sources" "$sources ingested"
  else
    bad "knowledge sources" "none ingested, so Atlas has nothing to answer from"
  fi
else
  bad "knowledge sources" "company did not resolve"
fi

# --- a missing slug must be a clean JSON 404, never a 500 or an HTML page ----
fetch "$BASE_URL/api/company?slug=smoke-no-such-company"
case "$BODY" in
  "<"*) bad "unknown slug is a clean 404" "returned an HTML error page (HTTP $CODE)" ;;
  *)
    if [ "$CODE" = "404" ] && [ -n "$(json error.code)" ]; then
      ok "unknown slug is a clean 404" "$(json error.code)"
    else
      bad "unknown slug is a clean 404" "HTTP $CODE $(printf '%.90s' "$BODY")"
    fi
    ;;
esac

# --- booking, the thing the whole demo exists to produce --------------------
TZ_NAME="America/Los_Angeles"
MONTH="$(node -e 'const d=new Date(Date.now()+7*864e5);process.stdout.write(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit"}).format(d))')"
DATE="$(node -e 'const d=new Date(Date.now()+7*864e5);process.stdout.write(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(d))')"

fetch "$BASE_URL/api/bookings/availability?slug=$SLUG&timeZone=$TZ_NAME&month=$MONTH"
days="$(json days)"
if [ "$CODE" = "200" ] && [ -n "$days" ] && [ "$days" != "0" ]; then
  ok "availability (month $MONTH)" "$days bookable days"
else
  bad "availability (month $MONTH)" "HTTP $CODE, $days days - the calendar renders empty"
fi

fetch "$BASE_URL/api/bookings/availability?slug=$SLUG&timeZone=$TZ_NAME&date=$DATE"
slots="$(json slots)"
if [ "$CODE" = "200" ] && [ -n "$slots" ] && [ "$slots" != "0" ]; then
  ok "availability (day $DATE)" "$slots slots"
else
  bad "availability (day $DATE)" "HTTP $CODE, $slots slots - nobody could book"
fi

# --- the voice route is alive and reachable without a session ---------------
# Minting a real token needs a conversation, and creating one is a write, so
# this stays read-only and proves the next best thing: the route is up, it is
# NOT behind auth (a prospect on /fde has no account and must be able to call),
# and it answers a bad id with a clean 404 rather than a 500 or a redirect.
# `npm run qa:voice` is the real end-to-end proof, including live xAI audio.
fetch "$BASE_URL/api/voice/token?conversationId=00000000-0000-4000-8000-0000000000aa"
if [ "$CODE" = "404" ] && [ "$(json error.code)" = "NOT_FOUND" ]; then
  ok "voice route reachable" "clean 404, not gated (full check: npm run qa:voice)"
elif [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  bad "voice route reachable" "HTTP $CODE, the route is behind auth so a prospect could never start a call"
else
  bad "voice route reachable" "HTTP $CODE $(printf '%.60s' "$BODY")"
fi

# --- the homepage still points at a company that exists ---------------------
# DEMO-STATE.md, do not regress: a CTA slug with no company row is what produced
# the original "Company not found" crash the user reported.
fetch "$BASE_URL/"
if [ "$CODE" = "200" ]; then
  missing=""
  case "$BODY" in *"/book/$SLUG"*) ;; *) missing="/book/$SLUG" ;; esac
  case "$BODY" in *"/fde/$SLUG"*) ;; *) missing="$missing /fde/$SLUG" ;; esac
  if [ -z "$missing" ]; then
    ok "homepage CTAs" "point at /book/$SLUG and /fde/$SLUG"
  else
    bad "homepage CTAs" "missing:$missing"
  fi
else
  bad "homepage CTAs" "HTTP $CODE"
fi

# --- the two prospect-facing pages render -----------------------------------
for path in "/fde/$SLUG" "/book/$SLUG"; do
  fetch "$BASE_URL$path"
  if [ "$CODE" = "200" ]; then
    case "$BODY" in
      *"Application error"*|*"Unhandled Runtime Error"*)
        bad "GET $path" "renders a runtime error" ;;
      *)
        ok "GET $path" "$(printf '%s' "$BODY" | wc -c | tr -d ' ') bytes" ;;
    esac
  else
    bad "GET $path" "HTTP $CODE"
  fi
done

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '%s%sSMOKE OK%s  %d passed. Full suite: %snpm run qa%s\n\n' "$BOLD" "$GREEN" "$RESET" "$pass" "$DIM" "$RESET"
  exit 0
fi
printf '%s%sSMOKE FAILED%s  %d passed, %d failed. Details: %snpm run qa%s\n\n' \
  "$BOLD" "$RED" "$RESET" "$pass" "$fail" "$DIM" "$RESET"
exit 1
