"use client";

import { PLAN_TIERS } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Star, ArrowRight } from "lucide-react";

interface PlanCardProps {
  plan: string;
  recommended?: boolean;
  current?: boolean;
  interval: "monthly" | "annual";
  onSelect: (plan: string) => void;
}

const PLAN_FEATURES: Record<string, string[]> = {
  trial: ["5 AI agents", "3 team members", "Kanban boards", "Agent memory", "BYOK models"],
  starter: ["5 AI agents", "3 team members", "Kanban boards", "Agent memory", "BYOK models", "@Mention collaboration"],
  pro: [
    "15 AI agents",
    "10 team members",
    "Everything in Starter",
    "Telegram integration",
    "Automated backups",
    "Priority support",
  ],
  scale: [
    "50 AI agents",
    "25 team members",
    "Everything in Pro",
    "Health monitoring",
    "SLA guarantee",
  ],
  agency: [
    "50 AI agents",
    "25 team members",
    "Everything in Scale",
    "White Label branding",
  ],
  partner: [
    "100 AI agents",
    "50 team members",
    "Everything in Agency",
    "Custom plugins",
  ],
  enterprise: [
    "Unlimited agents",
    "Unlimited members",
    "Everything in Partner",
    "Custom integrations",
    "Dedicated support",
    "Custom SLA",
  ],
};

export function PlanCard({ plan, recommended, current, interval, onSelect }: PlanCardProps) {
  const tier = PLAN_TIERS[plan];
  if (!tier) return null;

  const features = PLAN_FEATURES[plan] || [];
  const isEnterprise = plan === "enterprise";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-6 transition-all duration-200",
        "bg-card hover:bg-accent/30",
        recommended
          ? "border-blue-500/50 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500/30"
          : current
            ? "border-emerald-500/50"
            : "border-border hover:border-border/80"
      )}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-500 hover:bg-blue-500 text-white text-xs px-3 py-0.5 gap-1">
            <Star className="h-3 w-3" />
            Recommended
          </Badge>
        </div>
      )}

      {current && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-xs px-3 py-0.5">
            Current Plan
          </Badge>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold">{tier.name}</h3>
        <div className="mt-2">
          {isEnterprise ? (
            <div className="text-2xl font-bold">Custom</div>
          ) : (
            <>
              <span className="text-3xl font-bold">
                {tier.monthly === 0 ? "Free" : `$${interval === "monthly" ? tier.monthly : tier.annual}`}
              </span>
              {tier.monthly !== 0 && (
                <span className="text-sm text-muted-foreground ml-1">/month</span>
              )}
            </>
          )}
          {interval === "annual" && tier.monthly !== 0 && tier.monthly !== null && (
            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">
              Save ${(tier.monthly - (tier.annual || 0)) * 12}/year
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 mb-6">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-muted-foreground">{feature}</span>
          </div>
        ))}
      </div>

      {current ? (
        <Button variant="outline" className="w-full cursor-default" disabled>
          Current Plan
        </Button>
      ) : isEnterprise ? (
        <Button
          variant="outline"
          className="w-full cursor-pointer"
          onClick={() => {
            window.open("mailto:sales@helixnode.tech", "_blank");
          }}
        >
          Contact Sales
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button
          className={cn(
            "w-full cursor-pointer",
            recommended
              ? "bg-blue-500 hover:bg-blue-600 text-white"
              : ""
          )}
          onClick={() => onSelect(plan)}
        >
          {current ? "Current Plan" : `Select ${tier.name}`}
          {!current && <ArrowRight className="h-4 w-4 ml-1" />}
        </Button>
      )}
    </div>
  );
}
