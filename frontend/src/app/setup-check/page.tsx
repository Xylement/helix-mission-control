"use client";

import { useEffect, useState } from "react";
import { api, type SetupCheckResponse } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const CHECK_LABELS: Record<string, { label: string; fixUrl?: string; fixLabel?: string }> = {
  database: { label: "Database" },
  redis: { label: "Redis" },
  gateway: { label: "AI Gateway", fixUrl: "/settings/models", fixLabel: "Configure AI Model" },
  model_configured: { label: "AI Model", fixUrl: "/settings/models", fixLabel: "Configure AI Model" },
  license: { label: "License", fixUrl: "/settings/billing", fixLabel: "Activate License" },
  admin_exists: { label: "Admin Account" },
  onboarding: { label: "Onboarding", fixUrl: "/onboarding", fixLabel: "Start Onboarding" },
};

export default function SetupCheckPage() {
  const [data, setData] = useState<SetupCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await api.getSetupCheck();
      setData(result);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reach backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white mb-2">Setup Check</h1>
        <p className="text-zinc-400 mb-6">Verify all services are running correctly.</p>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 mb-4">
            <CardContent className="p-4 text-red-400">
              Cannot reach backend API: {error}
            </CardContent>
          </Card>
        )}

        {data && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-0 divide-y divide-zinc-800">
              {Object.entries(data.checks).map(([key, check]) => {
                const meta = CHECK_LABELS[key] || { label: key };
                return (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{check.ok ? "\u2705" : "\u274C"}</span>
                      <div>
                        <div className="text-white font-medium">{meta.label}</div>
                        <div className="text-zinc-500 text-sm">{check.message}</div>
                      </div>
                    </div>
                    {!check.ok && meta.fixUrl && (
                      <Link href={meta.fixUrl}>
                        <Button variant="outline" size="sm" className="text-xs">
                          {meta.fixLabel || "Fix"}
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {data && !data.ready && data.next_step && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
            Next step: {data.next_step}
          </div>
        )}

        {data?.ready && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300 text-sm">
            All systems operational. <Link href="/dashboard" className="underline">Go to Dashboard</Link>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={refresh} disabled={loading} variant="outline" size="sm">
            {loading ? "Checking..." : "Refresh"}
          </Button>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
