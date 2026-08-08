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
