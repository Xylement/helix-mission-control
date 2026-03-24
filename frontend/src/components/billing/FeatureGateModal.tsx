"use client";

import { useRouter } from "next/navigation";
import { FEATURE_LABELS, PLAN_TIERS } from "@/lib/billing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight } from "lucide-react";

interface FeatureGateModalProps {
  open: boolean;
  onClose: () => void;
  feature: string;
  requiredPlan: string;
}

export function FeatureGateModal({ open, onClose, feature, requiredPlan }: FeatureGateModalProps) {
  const router = useRouter();
  const featureInfo = FEATURE_LABELS[feature] || {
    label: feature,
    description: `This feature requires a ${requiredPlan} plan`,
  };
  const planName = PLAN_TIERS[requiredPlan.toLowerCase()]?.name || requiredPlan;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Lock className="h-5 w-5 text-blue-400" />
            </div>
            {featureInfo.label} is a {planName} Feature
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {featureInfo.description} is available on{" "}
            <span className="font-semibold text-white">{planName}</span>, Scale, and Enterprise plans.
          </p>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 cursor-pointer">
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
              onClick={() => {
                onClose();
                router.push("/settings/billing");
              }}
            >
              View Plans
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
