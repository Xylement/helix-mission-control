"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useBranding } from "@/contexts/BrandingContext";

interface CompleteStepProps {
  onComplete?: () => void;
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const branding = useBranding();

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api.onboardingStep8();
      onComplete?.();
      toast.success(`Setup complete! Welcome to ${branding.product_name}.`);
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
      // Still redirect even if marking complete fails
      router.push("/dashboard");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 py-12">
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        </div>
        <div className="absolute -inset-4 rounded-full border-2 border-green-500/20 animate-pulse" />
      </div>

      <div className="space-y-3 max-w-md">
        <h2 className="text-3xl font-bold">You&apos;re All Set!</h2>
        <p className="text-muted-foreground">
          Your {branding.product_name} workspace is ready. Your departments, boards, and
          AI agents are configured and ready to go.
        </p>
      </div>

      <div className="bg-muted/50 rounded-xl p-6 max-w-sm w-full text-left space-y-2">
        <p className="text-sm font-medium mb-3">What&apos;s been set up:</p>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            Organization & admin account
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            AI model configuration
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            Departments & boards
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            AI agents
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            Team members
          </div>
        </div>
      </div>

      <Button size="lg" onClick={handleComplete} disabled={completing} className="px-8">
        {completing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4 mr-2" />
        )}
        Go to Dashboard
      </Button>
    </div>
  );
}
