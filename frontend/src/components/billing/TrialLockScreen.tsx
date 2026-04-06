"use client";

import { useState } from "react";
import {
  useBillingPlan,
  billingApi,
  formatLicenseKey,
  isValidLicenseKey,
  createCheckoutSession,
} from "@/lib/billing";
import { useAuth } from "@/lib/auth";
import { PlanCard } from "@/components/billing/PlanCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, KeyRound, Zap } from "lucide-react";
import { toast } from "sonner";

export function TrialLockScreen() {
  const { user } = useAuth();
  const { plan, refresh } = useBillingPlan();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [, setCheckingOut] = useState(false);
  const [trialEmail, setTrialEmail] = useState(user?.email || "");
  const [trialOrgName, setTrialOrgName] = useState("");
  const [startingTrial, setStartingTrial] = useState(false);

  if (!plan) return null;

  // Determine if locked
  const now = new Date();
  const isExpired = plan.status === "expired";
  const isNoLicense = plan.status === "no_license";
  const graceExhausted = !plan.grace_period_ends || new Date(plan.grace_period_ends) <= now;
  const trialExpired = plan.trial && plan.trial_ends_at && new Date(plan.trial_ends_at) <= now;
  const isLocked = isNoLicense || (isExpired && graceExhausted) || (trialExpired && graceExhausted);

  if (!isLocked) return null;

  const keyValid = isValidLicenseKey(licenseKey);

  const handleKeyInput = (value: string) => {
    setLicenseKey(formatLicenseKey(value));
  };

  const handleActivate = async () => {
    if (!keyValid) return;
    setActivating(true);
    try {
      await billingApi.activate({ license_key: licenseKey });
      toast.success("License activated successfully!");
      await refresh();
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "detail" in err
          ? String((err as Record<string, unknown>).detail)
          : "Failed to activate license";
      toast.error(message);
    } finally {
      setActivating(false);
    }
  };

  const handleStartTrial = async () => {
    if (!trialEmail || !trialOrgName) {
      toast.error("Email and organization name are required");
      return;
    }
    setStartingTrial(true);
    try {
      await billingApi.startTrial({ email: trialEmail, org_name: trialOrgName });
      toast.success("Free trial activated!");
      await refresh();
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "detail" in err
          ? String((err as Record<string, unknown>).detail)
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : "Failed to start trial";
      toast.error(message);
    } finally {
      setStartingTrial(false);
    }
  };

  const handleSelectPlan = async (plan: string) => {
    const email = user?.email || prompt("Enter your email to proceed to checkout:");
    if (!email) return;

    setCheckingOut(true);
    try {
      const { checkout_url } = await createCheckoutSession(plan, interval, email);
      window.location.href = checkout_url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
      setCheckingOut(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60">
      <div className="w-full max-w-5xl mx-auto px-4 py-8 max-h-screen overflow-y-auto">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-bold text-lg shadow-lg shadow-blue-500/20">
              H
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">HELIX</span>
          </div>
        </div>

        {/* Message */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            {isNoLicense
              ? "No license activated."
              : trialExpired
                ? "Your free trial has ended."
                : "Your subscription has expired."}
          </h1>
          <p className="text-gray-400">
            {isNoLicense
              ? "Activate a license or start a free trial to begin using HELIX."
              : "Your agents and data are safe — upgrade to continue where you left off."}
          </p>
        </div>

        {/* Free Trial CTA */}
        {isNoLicense && (
          <div className="max-w-md mx-auto mb-8">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Zap className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">Start 7-Day Free Trial</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Try HELIX with up to 5 agents and 3 team members. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  value={trialEmail}
                  onChange={(e) => setTrialEmail(e.target.value)}
                  placeholder="Email address"
                  className="text-sm bg-gray-900/50 border-white/10"
                />
                <Input
                  value={trialOrgName}
                  onChange={(e) => setTrialOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="text-sm bg-gray-900/50 border-white/10"
                />
                <Button
                  className="bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer whitespace-nowrap"
                  onClick={handleStartTrial}
                  disabled={startingTrial || !trialEmail || !trialOrgName}
                >
                  {startingTrial && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Start Free Trial
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Interval toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-gray-900/50 p-1">
            <button
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer",
                interval === "monthly"
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white"
              )}
              onClick={() => setInterval("monthly")}
            >
              Monthly
            </button>
            <button
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer",
                interval === "annual"
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white"
              )}
              onClick={() => setInterval("annual")}
            >
              Annual
              <span className="ml-1.5 text-xs text-emerald-400">Save 15%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <PlanCard plan="starter" interval={interval} onSelect={handleSelectPlan} />
          <PlanCard plan="pro" interval={interval} onSelect={handleSelectPlan} recommended />
          <PlanCard plan="scale" interval={interval} onSelect={handleSelectPlan} />
          <PlanCard plan="enterprise" interval={interval} onSelect={handleSelectPlan} />
        </div>

        {/* License key section */}
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 justify-center mb-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" />
              or enter a license key
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={licenseKey}
                onChange={(e) => handleKeyInput(e.target.value)}
                placeholder="HLX-XXXX-XXXX-XXXX-XXXX"
                className="font-mono text-sm bg-gray-900/50 border-white/10 pr-8"
              />
              {licenseKey && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {keyValid ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleActivate}
              disabled={!keyValid || activating}
              className="bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
            >
              {activating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Activate
            </Button>
          </div>
        </div>

        {/* Support link */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Already have a subscription?{" "}
          <a
            href="mailto:support@helixnode.tech"
            className="text-blue-400 hover:underline cursor-pointer"
          >
            Contact support@helixnode.tech
          </a>
        </p>
      </div>
    </div>
  );
}
