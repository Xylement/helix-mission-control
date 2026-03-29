export interface BrandingConfig {
  product_name: string;
  product_short_name: string;
  company_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  accent_color: string;
  accent_color_secondary: string;
  login_title: string;
  login_subtitle: string | null;
  footer_text: string;
  loading_animation_enabled: boolean;
  loading_animation_text: string;
  custom_css: string | null;
  docs_url: string;
  support_email: string | null;
  support_url: string | null;
  marketplace_visible: boolean;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  product_name: "HELIX Mission Control",
  product_short_name: "HELIX",
  company_name: "HelixNode",
  logo_url: null,
  favicon_url: null,
  accent_color: "#3b82f6",
  accent_color_secondary: "#8b5cf6",
  login_title: "Sign in to Mission Control",
  login_subtitle: null,
  footer_text: "Powered by HelixNode",
  loading_animation_enabled: true,
  loading_animation_text: "HELIX",
  custom_css: null,
  docs_url: "https://docs.helixnode.tech",
  support_email: null,
  support_url: null,
  marketplace_visible: true,
};

let _cachedBranding: BrandingConfig | null = null;
let _fetchPromise: Promise<BrandingConfig> | null = null;

export async function fetchBranding(): Promise<BrandingConfig> {
  if (_cachedBranding) return _cachedBranding;

  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch("/api/branding")
    .then(async (res) => {
      if (!res.ok) throw new Error(`Branding API ${res.status}`);
      const data = await res.json();
      _cachedBranding = { ...DEFAULT_BRANDING, ...data };
      return _cachedBranding!;
    })
    .catch((err) => {
      console.warn("Failed to fetch branding, using defaults:", err);
      _cachedBranding = DEFAULT_BRANDING;
      return DEFAULT_BRANDING;
    })
    .finally(() => {
      _fetchPromise = null;
    }) as Promise<BrandingConfig>;

  return _fetchPromise;
}

export function getBranding(): BrandingConfig {
  return _cachedBranding || DEFAULT_BRANDING;
}

export function invalidateBranding(): void {
  _cachedBranding = null;
  _fetchPromise = null;
}
