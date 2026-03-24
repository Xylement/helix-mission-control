"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { TrialLockScreen } from "@/components/billing/TrialLockScreen";

function WebSocketWrapper({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Read token from localStorage and update on storage changes
    setToken(localStorage.getItem("token"));

    const onStorage = () => setToken(localStorage.getItem("token"));
    window.addEventListener("storage", onStorage);
    // Also poll for token changes (login/logout)
    const interval = setInterval(() => {
      const current = localStorage.getItem("token");
      setToken((prev) => (prev !== current ? current : prev));
    }, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  return <WebSocketProvider token={token}>{children}</WebSocketProvider>;
}

function BillingOverlay({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const excluded = ["/login", "/onboarding"];
  const show = !excluded.some((p) => pathname.startsWith(p));

  return (
    <>
      {children}
      {show && <TrialLockScreen />}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <OnboardingGuard>
          <WebSocketWrapper>
            <BillingOverlay>{children}</BillingOverlay>
          </WebSocketWrapper>
        </OnboardingGuard>
      </AuthProvider>
    </ThemeProvider>
  );
}
