const COMPANY_KEY = "grok_fde_company_id";
const COMPANY_SLUG_KEY = "grok_fde_company_slug";

export function getStoredCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(COMPANY_KEY);
}

export function getStoredCompanySlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(COMPANY_SLUG_KEY);
}

export function setStoredCompany(id: string, slug?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COMPANY_KEY, id);
  if (slug) localStorage.setItem(COMPANY_SLUG_KEY, slug);
}

export function clearStoredCompany() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COMPANY_KEY);
  localStorage.removeItem(COMPANY_SLUG_KEY);
}

/* ──────────────────────────────────────────────────────────────────────────
   Prospect identity: anonymous but persistent.

   A visitor never signs up, so the only thing tying them to the thread and
   the memory Atlas built is this id. It is minted server side on first visit
   and kept here, SCOPED PER COMPANY SLUG so two companies sharing a browser
   never resolve to one identity. Without the scope, opening acme.grokfde.com
   after globex.grokfde.com would hand Acme's engineer Globex's memory.

   Storage can be unavailable (Safari private mode, disabled cookies, an
   embedded webview). That is survivable: the visitor simply starts fresh
   each time, which is the documented degradation, so every access is guarded
   rather than allowed to throw and take the page down with it.
   ────────────────────────────────────────────────────────────────────────── */

const PROSPECT_KEY_PREFIX = "grok_fde_prospect_id:";

function prospectKey(companySlug: string): string {
  return `${PROSPECT_KEY_PREFIX}${companySlug}`;
}

export function getStoredProspectId(companySlug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(prospectKey(companySlug));
  } catch {
    return null;
  }
}

export function setStoredProspectId(companySlug: string, prospectId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(prospectKey(companySlug), prospectId);
  } catch {
    /* Storage unavailable. The visitor starts fresh next time. */
  }
}

export function clearStoredProspectId(companySlug: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(prospectKey(companySlug));
  } catch {
    /* Nothing to clear if storage is unavailable. */
  }
}
