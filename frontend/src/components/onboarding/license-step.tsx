"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  billingApi,
  formatLicenseKey,
  isValidLicenseKey,
  createCheckoutSession,
  PLAN_TIERS,
} from "@/lib/billing";
import { Loader2, Zap, KeyRound, ShoppingCart, Check, X } from "lucide-react";
import { toast } from "sonner";


interface LicenseStepProps {
  onNext: () => void;
  onSkip?: () => void;
}

export function LicenseStep({ onNext }: LicenseStepProps) {
  // Trial state
  const [trialEmail, setTrialEmail] = useState("");
  const [trialOrgName, setTrialOrgName] = useState("");
  const [startingTrial, setStartingTrial] = useState(false);

  // License key state
  const [licenseKey, setLicenseKey] = useState("");
  const [activatingKey, setActivatingKey] = useState(false);

  // Buy plan state
  const [buyEmail, setBuyEmail] = useState("");
  const [buyPlan, setBuyPlan] = useState("pro");
  const [buyInterval, setBuyInterval] = useState<"monthly" | "annual">("monthly");
  const [checkingOut, setCheckingOut] = useState(false);

  const keyValid = isValidLicenseKey(licenseKey);

  const handleStartTrial = async () => {
    if (!trialEmail || !trialOrgName) {
      toast.error("Email and organization name are required");
      return;
    }
    setStartingTrial(true);
    try {
      await billingApi.startTrial({ email: trialEmail, org_name: trialOrgName });
      toast.success("Free trial activated!");
      onNext();
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

  const handleActivateKey = async () => {
    if (!keyValid) return;
    setActivatingKey(true);
    try {
      await billingApi.activate({ license_key: licenseKey });
      toast.success("License activated!");
      onNext();
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "detail" in err
          ? String((err as Record<string, unknown>).detail)
          : "Failed to activate license";
      toast.error(message);
    } finally {
      setActivatingKey(false);
    }
  };

  const handleKeyInput = (value: string) => {
    setLicenseKey(formatLicenseKey(value));
  };

  const handleBuyPlan = async () => {
    if (!buyEmail) {
      toast.error("Email is required to proceed to checkout.");
      return;
    }
    setCheckingOut(true);
    try {
      const { checkout_url } = await createCheckoutSession(buyPlan, buyInterval, buyEmail);
      window.location.href = checkout_url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto">
          <KeyRound className="h-6 w-6 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold">Activate Your License</h2>
        <p className="text-muted-foreground text-sm">
          Choose how you&apos;d like to get started with HELIX
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Option A: Free Trial */}
        <Card className="p-5 space-y-4 bg-gray-900/50 border-white/10 hover:border-blue-500/30 transition-colors">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Zap className="h-4 w-4 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-sm">Start 7-Day Free Trial</h3>
          </div>
          <p className="text-xs text-gray-400">
            Try HELIX with up to 5 agents and 3 team members. No credit card required.
          </p>
          <div className="space-y-2">
            <Input
              type="email"
              value={trialEmail}
              onChange={(e) => setTrialEmail(e.target.value)}
              placeholder="Email address"
              className="text-sm"
            />
            <Input
              value={trialOrgName}
              onChange={(e) => setTrialOrgName(e.target.value)}
              placeholder="Organization name"
              className="text-sm"
            />
          </div>
          <Button
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer text-sm"
            onClick={handleStartTrial}
            disabled={startingTrial || !trialEmail || !trialOrgName}
          >
            {startingTrial && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Start Free Trial
          </Button>
        </Card>

        {/* Option B: License Key */}
        <Card className="p-5 space-y-4 bg-gray-900/50 border-white/10 hover:border-blue-500/30 transition-colors">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <KeyRound className="h-4 w-4 text-blue-400" />
            </div>
            <h3 className="font-semibold text-sm">Enter License Key</h3>
          </div>
          <p className="text-xs text-gray-400">
            Already purchased? Enter your license key below.
          </p>
          <div className="relative">
            <Input
              value={licenseKey}
              onChange={(e) => handleKeyInput(e.target.value)}
              placeholder="HLX-XXXX-XXXX-XXXX-XXXX"
              className="font-mono text-sm pr-8"
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
            className="w-full bg-blue-500 hover:bg-blue-600 text-white cursor-pointer text-sm"
            onClick={handleActivateKey}
            disabled={!keyValid || activatingKey}
          >
            {activatingKey && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Activate License
          </Button>
        </Card>

        {/* Option C: Buy a Plan */}
        <Card className="p-5 space-y-4 bg-gray-900/50 border-white/10 hover:border-blue-500/30 transition-colors">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <ShoppingCart className="h-4 w-4 text-purple-400" />
            </div>
            <h3 className="font-semibold text-sm">Buy a Plan</h3>
          </div>
          <p className="text-xs text-gray-400">
            Purchase a license and get your key via email instantly.
          </p>
          <div className="space-y-2">
            <Input
              type="email"
              value={buyEmail}
              onChange={(e) => setBuyEmail(e.target.value)}
              placeholder="Email address"
              className="text-sm"
            />
            <select
              value={buyPlan}
              onChange={(e) => setBuyPlan(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-gray-900/50 px-3 py-2 text-sm text-white"
            >
              {["starter", "pro", "scale"].map((p) => (
                <option key={p} value={p}>
                  {PLAN_TIERS[p]?.name} — ${buyInterval === "monthly" ? PLAN_TIERS[p]?.monthly : PLAN_TIERS[p]?.annual}/mo
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                className={`flex-1 text-xs py-1 rounded ${buyInterval === "monthly" ? "bg-white/10 text-white" : "text-gray-400"}`}
                onClick={() => setBuyInterval("monthly")}
              >
                Monthly
              </button>
              <button
                className={`flex-1 text-xs py-1 rounded ${buyInterval === "annual" ? "bg-white/10 text-white" : "text-gray-400"}`}
                onClick={() => setBuyInterval("annual")}
              >
                Annual
              </button>
            </div>
          </div>
          <Button
            className="w-full bg-purple-500 hover:bg-purple-600 text-white cursor-pointer text-sm"
            onClick={handleBuyPlan}
            disabled={checkingOut || !buyEmail}
          >
            {checkingOut && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Checkout with Stripe
          </Button>
        </Card>
      </div>

    </div>
  );
}
