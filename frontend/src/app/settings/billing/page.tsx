"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  useBillingPlan,
  useBillingUsage,
  PLAN_TIERS,
  FEATURE_MATRIX,
  getPlanRank,
  maskLicenseKey,
  formatPrice,
  createCheckoutSession,
  openCustomerPortal,
} from "@/lib/billing";
import { useAuth } from "@/lib/auth";
import { PlanCard } from "@/components/billing/PlanCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const textColor = pct > 90 ? "text-red-400" : pct > 70 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-gray-400">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className={cn("font-medium", textColor)}>
          {current} / {limit === Infinity ? "Unlimited" : limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
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
  const { plan, loading: planLoading } = useBillingPlan();
  const { usage, loading: usageLoading } = useBillingUsage();
  const [keyCopied, setKeyCopied] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [, setCheckingOut] = useState(false);
  const searchParams = useSearchParams();

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

  const handleCopyKey = async () => {
    if (plan?.license_key) {
      await navigator.clipboard.writeText(plan.license_key);
      setKeyCopied(true);
      toast.success("License key copied");
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const getStatusBadge = () => {
    if (plan?.trial) return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Trial</Badge>;
    if (plan?.status === "active") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>;
    if (plan?.status === "expired") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
    if (plan?.status === "payment_failed") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Payment Failed</Badge>;
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

      {/* A. Current Plan Card */}
      <Card className="bg-gray-900/50 border-white/10">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <CreditCard className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{tier?.name || currentPlan} Plan</h2>
                    {getStatusBadge()}
                  </div>
                  <p className="text-sm text-gray-400">
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
                <div className="text-2xl font-bold text-emerald-400">Free</div>
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
        <Card className="bg-gray-900/50 border-white/10">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Usage</h3>
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
        <Card className="bg-gray-900/50 border-white/10">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">License Key</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-lg bg-gray-800/50 border border-white/5 px-4 py-2.5 font-mono text-sm text-gray-300">
                {maskLicenseKey(plan.license_key)}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyKey}
                className="cursor-pointer"
              >
                {keyCopied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
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
      <Card className="bg-gray-900/50 border-white/10">
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Feature Access</h3>
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
                      ? "border-white/10 bg-gray-800/30"
                      : "border-white/5 bg-gray-900/30 opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {available ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Lock className="h-4 w-4 text-gray-500" />
                    )}
                    {feat.label}
                  </span>
                  {!available && requiredTier && (
                    <span className="text-xs text-gray-500">
                      {requiredTier.name}+
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Plans comparison */}
      <div id="plans">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Available Plans</h3>
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-gray-900/50 p-1">
            <button
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
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
                "px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                interval === "annual"
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white"
              )}
              onClick={() => setInterval("annual")}
            >
              Annual
              <span className="ml-1 text-emerald-400">-15%</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            recommended={currentPlan !== "pro"}
            onSelect={handleSelectPlan}
          />
          <PlanCard
            plan="scale"
            interval={interval}
            current={currentPlan === "scale"}
            onSelect={handleSelectPlan}
          />
          <PlanCard
            plan="enterprise"
            interval={interval}
            current={currentPlan === "enterprise"}
            onSelect={handleSelectPlan}
          />
        </div>
      </div>

      {/* E. Billing History Placeholder */}
      <Card className="bg-gray-900/50 border-white/10">
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Billing History</h3>
          <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
            <Shield className="h-8 w-8 text-gray-600 mx-auto mb-2" />
            {plan?.has_stripe ? (
              <>
                <p className="text-sm text-gray-500">
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
              <p className="text-sm text-gray-500">
                Your license was activated manually. Billing history is available for plans purchased through Stripe.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
