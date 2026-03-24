"use client";

import { useState } from "react";
import Link from "next/link";
import { useBillingPlan, useBillingUsage } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { X, AlertTriangle, Clock, CreditCard, Wifi, ArrowRight } from "lucide-react";

type BannerState = {
  message: string;
  cta: string | null;
  ctaHref: string;
  variant: "blue" | "amber" | "red" | "gray";
  dismissible: boolean;
  icon: React.ElementType;
} | null;

const VARIANT_STYLES = {
  blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  red: "bg-red-500/10 border-red-500/30 text-red-400",
  gray: "bg-gray-500/10 border-gray-500/30 text-gray-400",
};

export function PlanBanner() {
  const { plan } = useBillingPlan();
  const { usage } = useBillingUsage();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (!plan) return null;

  const banner = getBannerState(plan, usage);
  if (!banner) return null;

  // Dismiss key includes variant+cta so different banner types don't share keys
  const bannerKey = `banner_dismissed_${plan.status}_${plan.plan}_${banner.variant}_${banner.cta}`;
  const isDismissed =
    dismissedKey === bannerKey ||
    (typeof window !== "undefined" && sessionStorage.getItem(bannerKey) === "1");
  if (isDismissed && banner.dismissible) return null;

  const Icon = banner.icon;

  const handleDismiss = () => {
    if (!banner.dismissible) return;
    setDismissedKey(bannerKey);
    sessionStorage.setItem(bannerKey, "1");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm border-b transition-all duration-300",
        VARIANT_STYLES[banner.variant]
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{banner.message}</span>
      {banner.cta && (
        <Link
          href={banner.ctaHref}
          className="flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80 whitespace-nowrap cursor-pointer"
        >
          {banner.cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
      {banner.dismissible && (
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function getBannerState(
  plan: NonNullable<ReturnType<typeof useBillingPlan>["plan"]>,
  usage: ReturnType<typeof useBillingUsage>["usage"]
): BannerState {
  const now = new Date();

  // No license
  if (plan.status === "no_license") {
    return {
      message: "No license activated. Activate a license or start a free trial.",
      cta: "Activate",
      ctaHref: "/settings/billing",
      variant: "red",
      dismissible: false,
      icon: AlertTriangle,
    };
  }

  // Offline warning
  if (plan.status === "offline_warning") {
    return {
      message: "Unable to verify license. Check internet connection.",
      cta: null,
      ctaHref: "",
      variant: "gray",
      dismissible: true,
      icon: Wifi,
    };
  }

  // 1. Expired / locked (no grace period remaining)
  if (plan.status === "expired" && !plan.grace_period_ends) {
    return {
      message: "Your subscription has expired. Renew to continue using HELIX.",
      cta: "Renew now",
      ctaHref: "/settings/billing",
      variant: "red",
      dismissible: false,
      icon: AlertTriangle,
    };
  }

  // 2. Payment failed
  if (plan.status === "payment_failed") {
    return {
      message: "Payment failed. Please update your billing information.",
      cta: "Fix billing",
      ctaHref: "/settings/billing",
      variant: "amber",
      dismissible: false,
      icon: CreditCard,
    };
  }

  // Check trial state (used for priorities 3 and 6)
  const isTrial = plan.trial === true && plan.trial_ends_at && new Date(plan.trial_ends_at) > now;
  let trialDaysLeft = 0;
  if (isTrial) {
    trialDaysLeft = Math.ceil((new Date(plan.trial_ends_at!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 3. Trial urgent (< 2 days remaining)
  if (isTrial && trialDaysLeft <= 2) {
    return {
      message: trialDaysLeft <= 1 ? "Trial expires tomorrow!" : `Trial expires in ${trialDaysLeft} days!`,
      cta: "Upgrade to keep your agents",
      ctaHref: "/settings/billing#plans",
      variant: "amber",
      dismissible: false,
      icon: AlertTriangle,
    };
  }

  // 4. Grace period (expired but still has time)
  if (plan.status === "expired" && plan.grace_period_ends) {
    const graceEnd = new Date(plan.grace_period_ends);
    if (graceEnd > now) {
      return {
        message: "Your subscription has expired. Renew to continue using HELIX.",
        cta: "Renew now",
        ctaHref: "/settings/billing#plans",
        variant: "red",
        dismissible: false,
        icon: AlertTriangle,
      };
    }
  }

  // 5. Overage check
  if (usage) {
    if (usage.agents.current > usage.agents.limit) {
      return {
        message: `You have ${usage.agents.current} agents but your plan allows ${usage.agents.limit}. Remove agents or upgrade.`,
        cta: "Manage",
        ctaHref: "/settings/billing#plans",
        variant: "amber",
        dismissible: true,
        icon: AlertTriangle,
      };
    }
    if (usage.members.current > usage.members.limit) {
      return {
        message: `You have ${usage.members.current} members but your plan allows ${usage.members.limit}. Remove members or upgrade.`,
        cta: "Manage",
        ctaHref: "/settings/billing#plans",
        variant: "amber",
        dismissible: true,
        icon: AlertTriangle,
      };
    }
  }

  // 6. Trial active (normal, > 2 days remaining)
  if (isTrial) {
    return {
      message: `Free trial: ${trialDaysLeft} days remaining`,
      cta: "Upgrade now",
      ctaHref: "/settings/billing#plans",
      variant: "blue",
      dismissible: true,
      icon: Clock,
    };
  }

  // Active, no issues
  return null;
}
