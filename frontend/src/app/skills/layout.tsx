"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar, MobileBottomNav } from "@/components/sidebar";
import { PlanBanner } from "@/components/billing/PlanBanner";

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="pt-16 lg:pt-0 pb-20 lg:pb-0">
          <PlanBanner />
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
