"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  useBillingPlan,
  useBillingUsage,
  billingApi,
  PLAN_TIERS,
  FEATURE_MATRIX,
  getPlanRank,
  maskLicenseKey,
  formatPrice,
  formatLicenseKey,
  isValidLicenseKey,
  createCheckoutSession,
  openCustomerPortal,
} from "@/lib/billing";
import { useAuth } from "@/lib/auth";
import { PlanCard } from "@/components/billing/PlanCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  Copy,
  Check,
  Lock,
  Loader2,
  Bot,
  Users,
  Shield,
  ExternalLink,
  ChevronDown,
  Palette,
  AlertTriangle,
  KeyRound,
  Zap,
  X,
} from "lucide-react";
import { toast } from "sonner";

function UsageBar({
  label,
  current,
  limit,
  icon: Icon,
}: {
  label: string;
  current: number;
  limit: number;
  icon: React.ElementType;
}) {
  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = pct > 90 ? "text-red-500 dark:text-red-400" : pct > 70 ? "text-amber-500 dark:text-amber-400" : "text-emerald-500 dark:text-emerald-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className={cn("font-medium", textColor)}>
          {current} / {limit === Infinity ? "Unlimited" : limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuth();
  const { plan, loading: planLoading, refresh: refreshPlan } = useBillingPlan();
  const { usage, loading: usageLoading, refresh: refreshUsage } = useBillingUsage();
  const [keyCopied, setKeyCopied] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [whiteLabelOpen, setWhiteLabelOpen] = useState(false);
  const [, setCheckingOut] = useState(false);
  const searchParams = useSearchParams();

  // License activation state
  const [licenseKey, setLicenseKey] = useState("");
  const [activatingKey, setActivatingKey] = useState(false);
  const [trialEmail, setTrialEmail] = useState("");
  const [trialOrgName, setTrialOrgName] = useState("");
  const [startingTrial, setStartingTrial] = useState(false);

  const licenseKeyValid = isValidLicenseKey(licenseKey);

  const handleActivateKey = async () => {
    if (!licenseKeyValid) return;
    setActivatingKey(true);
    try {
      await billingApi.activate({ license_key: licenseKey });
      toast.success("License activated!");
      setLicenseKey("");
      refreshPlan();
      refreshUsage();
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

  const handleStartTrial = async () => {
    if (!trialEmail || !trialOrgName) {
      toast.error("Email and organization name are required");
      return;
    }
    setStartingTrial(true);
    try {
      await billingApi.startTrial({ email: trialEmail, org_name: trialOrgName });
      toast.success("Free trial activated!");
      setTrialEmail("");
      setTrialOrgName("");
      refreshPlan();
      refreshUsage();
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

  const needsActivation = !plan || !plan.status || plan.status === "expired" || !plan.plan;

  // Handle success/cancelled URL params from Stripe redirect
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Payment successful! Check your email for the license key.");
      window.history.replaceState({}, "", "/settings/billing");
    } else if (searchParams.get("cancelled") === "true") {
      toast.info("Payment cancelled. You can try again anytime.");
      window.history.replaceState({}, "", "/settings/billing");
    }
  }, [searchParams]);

  if (planLoading || usageLoading) {
    return (
      <div className="animate-in-page space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your plan and usage</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const currentPlan = plan?.plan?.toLowerCase() || "trial";
  const tier = PLAN_TIERS[currentPlan];
  const currentPlanRank = getPlanRank(currentPlan);

  const getExpiryWarning = () => {
    const expiryDate = plan?.trial
      ? plan.trial_ends_at
      : plan?.current_period_end;

    if (!expiryDate) return null;

    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      const graceDays = plan?.grace_period_ends
        ? Math.ceil((new Date(plan.grace_period_ends).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      if (graceDays > 0) {
        return { level: "red" as const, message: `Your subscription has expired. You have ${graceDays} days of grace period remaining.` };
      }
      return { level: "red" as const, message: "Your subscription has expired. Upgrade to restore service." };
    }

    const label = plan?.trial ? "trial" : "subscription";

    if (daysLeft <= 2) {
      return {
        level: "red" as const,
        message: `Your ${label} expires ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}! Upgrade now to avoid service interruption.`,
      };
    }

    if (daysLeft <= 7) {
      return {
        level: "amber" as const,
        message: `Your ${label} expires in ${daysLeft} days — upgrade to keep your agents running.`,
      };
    }

    return null;
  };

  const expiryWarning = getExpiryWarning();

  const handleCopyKey = async () => {
    if (plan?.license_key) {
      await navigator.clipboard.writeText(plan.license_key);
      setKeyCopied(true);
      toast.success("License key copied");
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const getStatusBadge = () => {
    if (plan?.trial) return <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30">Trial</Badge>;
    if (plan?.status === "active") return <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Active</Badge>;
    if (plan?.status === "expired") return <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">Expired</Badge>;
    if (plan?.status === "payment_failed") return <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">Payment Failed</Badge>;
    return <Badge variant="secondary">{plan?.status || "Unknown"}</Badge>;
  };

  const handleSelectPlan = async (selectedPlan: string) => {
    const checkoutEmail = user?.email || prompt("Enter your email to proceed to checkout:");
    if (!checkoutEmail) {
      toast.error("Email is required to proceed to checkout.");
      return;
    }

    setCheckingOut(true);
    try {
      const { checkout_url } = await createCheckoutSession(selectedPlan, interval, checkoutEmail);
      window.location.href = checkout_url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
      setCheckingOut(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!plan?.license_key) {
      toast.error("No license key found. Cannot open subscription management.");
      return;
    }
    if (!plan.has_stripe) {
      toast.info("Your license was activated manually. Subscription management is available for plans purchased through Stripe.");
      return;
    }
    try {
      await openCustomerPortal(plan.license_key);
    } catch {
      toast.error("Failed to open subscription portal. Please try again later.");
    }
  };

  return (
    <div className="animate-in-page space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your plan, usage, and license</p>
      </div>

      {/* Expiry Warning Banner */}
      {expiryWarning && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
            expiryWarning.level === "red"
              ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
              : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
          )}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{expiryWarning.message}</span>
          <a href="#plans" className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:opacity-80">
            View Plans
          </a>
        </div>
      )}

      {/* A. Current Plan Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <CreditCard className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{tier?.name || currentPlan} Plan</h2>
                    {getStatusBadge()}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {plan?.trial && plan.trial_ends_at && (
                      <>Trial ends {new Date(plan.trial_ends_at).toLocaleDateString()}</>
                    )}
                    {!plan?.trial && plan?.current_period_end && (
                      <>Next billing: {new Date(plan.current_period_end).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>

              {tier && tier.monthly !== null && tier.monthly > 0 && (
                <div className="text-2xl font-bold">
                  {formatPrice(currentPlan, "monthly")}
                </div>
              )}
              {tier && tier.monthly === 0 && (
                <div className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">Free</div>
              )}
            </div>

            {plan?.has_stripe && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={handleManageSubscription}
                >
                  Manage Subscription
                  <ExternalLink className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* B. Usage Section */}
      {usage && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Usage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <UsageBar
                label="Agents"
                current={usage.agents.current}
                limit={usage.agents.limit}
                icon={Bot}
              />
              <UsageBar
                label="Team Members"
                current={usage.members.current}
                limit={usage.members.limit}
                icon={Users}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* C. License Key */}
      {plan?.license_key && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">License Key</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-lg bg-muted border border-border px-4 py-2.5 font-mono text-sm text-foreground">
                {maskLicenseKey(plan.license_key)}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyKey}
                className="cursor-pointer"
              >
                {keyCopied ? (
                  <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {keyCopied ? "Copied" : "Copy Full Key"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* D. Feature Access */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Feature Access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(FEATURE_MATRIX).map(([key, feat]) => {
              const available = currentPlanRank >= getPlanRank(feat.minPlan);
              const requiredTier = PLAN_TIERS[feat.minPlan];
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors",
                    available
                      ? "border-border bg-accent/30"
                      : "border-border/50 bg-muted/30 opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {available ? (
                      <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    {feat.label}
                  </span>
                  {!available && requiredTier && (
                    <span className="text-xs text-muted-foreground">
                      {requiredTier.name}+
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* License Activation — shown when no active license */}
      {needsActivation && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <KeyRound className="h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Activate License</h2>
                <p className="text-sm text-muted-foreground">
                  Enter your license key or start a free trial to get started.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* License Key Input */}
              <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  <h3 className="text-sm font-medium">Enter License Key</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Already purchased? Paste your license key below.
                </p>
                <div className="relative">
                  <Input
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(formatLicenseKey(e.target.value))}
                    placeholder="HLX-XXXX-XXXX-XXXX-XXXX"
                    className="font-mono text-sm pr-8"
                  />
                  {licenseKey && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {licenseKeyValid ? (
                        <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                      )}
                    </div>
                  )}
                </div>
                <Button
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white cursor-pointer text-sm"
                  onClick={handleActivateKey}
                  disabled={!licenseKeyValid || activatingKey}
                >
                  {activatingKey && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Activate
                </Button>
              </div>

              {/* Free Trial */}
              <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  <h3 className="text-sm font-medium">Start 7-Day Free Trial</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Try with up to 5 agents and 3 team members. No credit card required.
                </p>
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
                <Button
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer text-sm"
                  onClick={handleStartTrial}
                  disabled={startingTrial || !trialEmail || !trialOrgName}
                >
                  {startingTrial && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Start Free Trial
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans comparison */}
      <div id="plans">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Available Plans</h3>
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-1">
            <button
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                interval === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setInterval("monthly")}
            >
              Monthly
            </button>
            <button
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                interval === "annual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setInterval("annual")}
            >
              Annual
              <span className="ml-1 text-emerald-500 dark:text-emerald-400">-15%</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PlanCard
            plan="starter"
            interval={interval}
            current={currentPlan === "starter"}
            onSelect={handleSelectPlan}
          />
          <PlanCard
            plan="pro"
            interval={interval}
            current={currentPlan === "pro"}
            recommended={currentPlan !== "pro" && getPlanRank(currentPlan) < getPlanRank("pro")}
            onSelect={handleSelectPlan}
          />
          <PlanCard
            plan="scale"
            interval={interval}
            current={currentPlan === "scale"}
            onSelect={handleSelectPlan}
          />
        </div>
      </div>

      {/* White Label Plans — collapsible */}
      <div className="rounded-xl border border-border bg-card">
        <button
          className="w-full flex items-center justify-between px-6 py-5 cursor-pointer group"
          onClick={() => setWhiteLabelOpen(!whiteLabelOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Palette className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">
                Want to white-label this platform as your own?
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remove all HelixNode branding and sell to your clients under your own brand.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">View White Label Plans</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                whiteLabelOpen && "rotate-180"
              )}
            />
          </div>
        </button>
        {whiteLabelOpen && (
          <div className="px-6 pb-6 pt-1 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <PlanCard
                plan="agency"
                interval={interval}
                current={currentPlan === "agency"}
                onSelect={handleSelectPlan}
              />
              <PlanCard
                plan="partner"
                interval={interval}
                current={currentPlan === "partner"}
                onSelect={handleSelectPlan}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Need a fully custom setup?{" "}
              <a
                href="mailto:sales@helixnode.tech"
                className="text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
              >
                Contact sales
              </a>{" "}
              for Enterprise white-label pricing.
            </p>
          </div>
        )}
      </div>

      {/* E. Billing History Placeholder */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Billing History</h3>
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            {plan?.has_stripe ? (
              <>
                <p className="text-sm text-muted-foreground">
                  View your invoices and billing history in the Stripe Customer Portal.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 cursor-pointer"
                  onClick={handleManageSubscription}
                >
                  View in Stripe Portal
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your license was activated manually. Billing history is available for plans purchased through Stripe.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
