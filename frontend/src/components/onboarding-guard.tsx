"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const EXCLUDED_PATHS = ["/onboarding", "/login"];

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Don't check on excluded paths
    if (EXCLUDED_PATHS.some((p) => pathname.startsWith(p))) {
      setChecked(true);
      return;
    }

    let cancelled = false;

    api
      .onboardingStatus()
      .then((status) => {
        if (!cancelled && status.needs_onboarding) {
          router.replace("/onboarding");
          return;
        }
        if (!cancelled) setChecked(true);
      })
      .catch(() => {
        // If API is unreachable, let the page render normally
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!checked) {
    return null; // Brief flash while checking
  }

  return <>{children}</>;
}
