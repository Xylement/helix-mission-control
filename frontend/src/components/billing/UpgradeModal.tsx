"use client";

import { useRouter } from "next/navigation";
import { PLAN_TIERS } from "@/lib/billing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, Users, ArrowRight } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  type: "agent" | "member";
  current: number;
  limit: number;
  upgradeTo: string;
}

export function UpgradeModal({ open, onClose, type, current, limit, upgradeTo }: UpgradeModalProps) {
  const router = useRouter();
  const upgradeTier = PLAN_TIERS[upgradeTo.toLowerCase()];
  const newLimit = type === "agent" ? upgradeTier?.agents : upgradeTier?.members;
  const Icon = type === "agent" ? Bot : Users;
  const label = type === "agent" ? "agent" : "team member";
  const labelPlural = type === "agent" ? "agents" : "team members";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Icon className="h-5 w-5 text-amber-400" />
            </div>
            {type === "agent" ? "Agent" : "Team Member"} Limit Reached
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            You&apos;ve reached the {limit}-{label} limit on your current plan.
            {upgradeTier && (
              <>
                {" "}Upgrade to <span className="font-semibold text-white">{upgradeTier.name}</span> for up to{" "}
                <span className="font-semibold text-white">
                  {newLimit === Infinity ? "unlimited" : newLimit}
                </span>{" "}
                {labelPlural}.
              </>
            )}
          </p>

          {/* Usage bar */}
          <div className="rounded-lg border border-white/10 bg-gray-900/50 p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400 capitalize">{labelPlural}</span>
              <span className="font-medium text-red-400">
                {current}/{limit}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500 transition-all duration-300"
                style={{ width: "100%" }}
              />
            </div>
          </div>

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
              Upgrade to {upgradeTier?.name || upgradeTo}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
