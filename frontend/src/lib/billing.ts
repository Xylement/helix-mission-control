"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Plan tier definitions ───────────────────────────────────────────────────

export const PLAN_TIERS: Record<string, PlanTier> = {
  trial: { name: "Trial", agents: 5, members: 3, monthly: 0, annual: 0 },
  starter: { name: "Starter", agents: 5, members: 3, monthly: 49, annual: 42 },
  pro: { name: "Pro", agents: 15, members: 10, monthly: 99, annual: 84 },
  scale: { name: "Scale", agents: 50, members: 25, monthly: 199, annual: 169 },
  agency: { name: "Agency", agents: 50, members: 25, monthly: 499, annual: 424 },
  partner: { name: "Partner", agents: 100, members: 50, monthly: 999, annual: 849 },
  enterprise: { name: "Enterprise", agents: Infinity, members: Infinity, monthly: null, annual: null },
};

export interface PlanTier {
  name: string;
  agents: number;
  members: number;
  monthly: number | null;
  annual: number | null;
}

// ─── Feature matrix ──────────────────────────────────────────────────────────

export const FEATURE_MATRIX: Record<string, { label: string; minPlan: string }> = {
  kanban: { label: "Kanban Boards", minPlan: "trial" },
  agent_memory: { label: "Agent Memory", minPlan: "trial" },
  byok: { label: "BYOK Models", minPlan: "trial" },
  mention: { label: "@Mention Collaboration", minPlan: "trial" },
  telegram: { label: "Telegram Integration", minPlan: "pro" },
  backups: { label: "Automated Backups", minPlan: "pro" },
  priority_support: { label: "Priority Support", minPlan: "pro" },
  health_monitoring: { label: "Health Monitoring", minPlan: "scale" },
  sla: { label: "SLA Guarantee", minPlan: "scale" },
  custom_integrations: { label: "Custom Integrations", minPlan: "enterprise" },
  plugins: { label: "Plugins", minPlan: "pro" },
  white_label: { label: "White Label Branding", minPlan: "agency" },
  custom_plugins: { label: "Custom Plugins", minPlan: "enterprise" },
};

// ─── Feature display names (for FeatureGateModal) ────────────────────────────

export const FEATURE_LABELS: Record<string, { label: string; description: string }> = {
  telegram: { label: "Telegram Integration", description: "Connect agents to Telegram bots" },
  backups: { label: "Automated Backups", description: "Scheduled database and config backups" },
  health_monitoring: { label: "Health Monitoring", description: "Real-time system health dashboard" },
  priority_support: { label: "Priority Support", description: "Direct support channel with SLA" },
  sla: { label: "SLA Guarantee", description: "Guaranteed uptime and response times" },
  custom_integrations: { label: "Custom Integrations", description: "Build custom agent integrations" },
  workflow_builder: { label: "Workflow Builder", description: "Create multi-step automated workflows across agents" },
  plugins: { label: "Plugins", description: "Connect agents to external APIs and services" },
  white_label: { label: "White Label Branding", description: "Custom logos, colors, company name, and login page" },
  custom_plugins: { label: "Custom Plugins", description: "Create and install custom plugin configurations" },
};

// ─── Plan ordering & comparison ──────────────────────────────────────────────

const PLAN_ORDER = ["trial", "starter", "pro", "scale", "agency", "partner", "enterprise"];

export function getPlanOrder(): string[] {
  return PLAN_ORDER;
}

export function getPlanRank(plan: string): number {
  const idx = PLAN_ORDER.indexOf(plan.toLowerCase());
  return idx === -1 ? 0 : idx;
}

export function isPlanHigherThan(a: string, b: string): boolean {
  return getPlanRank(a) > getPlanRank(b);
}

export function isFeatureAvailable(feature: string, currentPlan: string): boolean {
  const feat = FEATURE_MATRIX[feature];
  if (!feat) return false;
  return getPlanRank(currentPlan) >= getPlanRank(feat.minPlan);
}

export function getUpgradeTier(currentPlan: string): string {
  const rank = getPlanRank(currentPlan);
  if (rank < PLAN_ORDER.length - 1) return PLAN_ORDER[rank + 1];
  return currentPlan;
}

export function formatPrice(plan: string, interval: "monthly" | "annual"): string {
  const tier = PLAN_TIERS[plan.toLowerCase()];
  if (!tier) return "";
  const price = interval === "monthly" ? tier.monthly : tier.annual;
  if (price === null) return "Custom";
  if (price === 0) return "Free";
  return `$${price}/mo`;
}

// ─── API response types ──────────────────────────────────────────────────────

export interface BillingPlan {
  valid: boolean;
  plan: string;
  limits: {
    max_agents: number;
    max_members: number;
    features: string[];
  };
  status: string;
  message: string;
  expires_at: string | null;
  trial: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_period_ends: string | null;
  license_key?: string;
  has_stripe?: boolean;
}

export interface BillingUsage {
  agents: { current: number; limit: number };
  members: { current: number; limit: number };
  plan: string;
}

export interface LimitError {
  error: "agent_limit" | "member_limit";
  message: string;
  limit: number;
  current: number;
  upgrade_to: string;
}

export interface FeatureError {
  error: "feature_not_available";
  feature: string;
  required_plan: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function billingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const res = await fetch(`${apiBase}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body;
  }
  return res.json();
}

export const billingApi = {
  getPlan: () => billingRequest<BillingPlan>("/billing/plan"),
  getUsage: () => billingRequest<BillingUsage>("/billing/usage"),
  validate: () => billingRequest<BillingPlan>("/billing/validate", { method: "POST" }),
  activate: (data: { license_key: string; instance_id?: string; domain?: string; version?: string }) =>
    billingRequest<BillingPlan>("/billing/activate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  startTrial: (data: { email: string; org_name: string }) =>
    billingRequest<BillingPlan>("/billing/trial", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useBillingPlan() {
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await billingApi.getPlan();
      setPlan(data);
      setError(null);
    } catch {
      setError("Failed to load billing plan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if user is authenticated
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }

    refresh();

    // Poll every 5 minutes
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { plan, loading, error, refresh };
}

export function useBillingUsage() {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await billingApi.getUsage();
      setUsage(data);
      setError(null);
    } catch {
      setError("Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }

    refresh();
  }, [refresh]);

  return { usage, loading, error, refresh };
}

// ─── Utility: parse 403 responses ───────────────────────────────────────────

export function isLimitError(err: unknown): err is LimitError {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    ((err as Record<string, unknown>).error === "agent_limit" ||
      (err as Record<string, unknown>).error === "member_limit")
  );
}

export function isFeatureError(err: unknown): err is FeatureError {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    (err as Record<string, unknown>).error === "feature_not_available"
  );
}

// ─── Stripe Checkout & Portal ────────────────────────────────────────────────

const LICENSE_API_BASE = process.env.NEXT_PUBLIC_LICENSE_API_URL || "https://api.helixnode.tech";

export async function createCheckoutSession(
  plan: string,
  interval: "monthly" | "annual",
  email: string,
): Promise<{ session_id: string; checkout_url: string }> {
  const response = await fetch(`${LICENSE_API_BASE}/v1/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      interval,
      email,
      success_url: `${window.location.origin}/settings/billing?success=true`,
      cancel_url: `${window.location.origin}/settings/billing?cancelled=true`,
      instance_id: null,
    }),
  });
  if (!response.ok) throw new Error("Failed to create checkout session");
  return response.json();
}

export async function openCustomerPortal(licenseKey: string): Promise<void> {
  const response = await fetch(`${LICENSE_API_BASE}/v1/checkout/portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      license_key: licenseKey,
      return_url: `${window.location.origin}/settings/billing`,
    }),
  });
  if (!response.ok) throw new Error("Failed to open customer portal");
  const { portal_url } = await response.json();
  window.location.href = portal_url;
}

// ─── License key formatting ─────────────────────────────────────────────────

export function formatLicenseKey(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length <= 3) return clean;
  // HLX prefix + groups of 4
  let result = clean.slice(0, 3);
  const rest = clean.slice(3);
  for (let i = 0; i < rest.length && i < 16; i += 4) {
    result += "-" + rest.slice(i, i + 4);
  }
  return result;
}

export function maskLicenseKey(key: string): string {
  if (!key) return "";
  const parts = key.split("-");
  if (parts.length < 2) return key;
  return `${parts[0]}-${parts[1]}-****-****-****`;
}

export function isValidLicenseKey(key: string): boolean {
  return /^HLX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
