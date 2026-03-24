"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Building2,
  KeyRound,
  Wifi,
  Key,
  Bell,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { GeneralTab } from "@/components/settings/general-tab";
import { GatewayTab } from "@/components/settings/gateway-tab";
import { TokensTab } from "@/components/settings/tokens-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { DangerZoneTab } from "@/components/settings/danger-zone-tab";

const TABS = [
  { key: "general", label: "General", icon: Building2 },
  { key: "ai-model", label: "AI Model", icon: KeyRound },
  { key: "gateway", label: "Gateway", icon: Wifi },
  { key: "tokens", label: "API Keys", icon: Key },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function OrganizationSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Organization settings are only available to administrators.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in-page space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization configuration, integrations, and security
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? tab.key === "danger"
                    ? "border-destructive text-destructive"
                    : "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "ai-model" && (
          <div className="max-w-2xl">
            <p className="text-sm text-muted-foreground mb-4">
              AI model configuration is available on the{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => router.push("/settings/model-config")}
              >
                Model Config page
              </button>
              .
            </p>
            <Button
              variant="outline"
              onClick={() => router.push("/settings/model-config")}
            >
              <KeyRound className="h-4 w-4 mr-2" />
              Go to Model Config
            </Button>
          </div>
        )}
        {activeTab === "gateway" && <GatewayTab />}
        {activeTab === "tokens" && <TokensTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "danger" && <DangerZoneTab />}
      </div>
    </div>
  );
}
