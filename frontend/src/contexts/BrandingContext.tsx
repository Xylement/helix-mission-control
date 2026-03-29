"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { BrandingConfig, DEFAULT_BRANDING, fetchBranding } from "@/lib/branding";

const BrandingContext = createContext<BrandingConfig>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

  useEffect(() => {
    fetchBranding().then(setBranding);
  }, []);

  // Apply CSS custom properties for accent colors
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent-color", branding.accent_color);
    root.style.setProperty("--accent-color-secondary", branding.accent_color_secondary);

    // Apply custom CSS if set
    const existingStyle = document.getElementById("branding-custom-css");
    if (existingStyle) existingStyle.remove();

    if (branding.custom_css) {
      const style = document.createElement("style");
      style.id = "branding-custom-css";
      style.textContent = branding.custom_css;
      document.head.appendChild(style);
    }
  }, [branding]);

  // Update document title
  useEffect(() => {
    if (typeof document !== "undefined") {
      const currentTitle = document.title;
      if (currentTitle.includes("|")) {
        const pageName = currentTitle.split("|")[0].trim();
        document.title = `${pageName} | ${branding.product_name}`;
      } else {
        document.title = branding.product_name;
      }
    }
  }, [branding.product_name]);

  // Update favicon
  useEffect(() => {
    if (branding.favicon_url) {
      const link =
        (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
        document.createElement("link");
      link.type = "image/x-icon";
      link.rel = "shortcut icon";
      link.href = branding.favicon_url;
      document.head.appendChild(link);
    }
  }, [branding.favicon_url]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingConfig {
  return useContext(BrandingContext);
}
