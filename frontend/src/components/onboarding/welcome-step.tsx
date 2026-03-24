"use client";

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 py-12">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>

      <div className="space-y-3 max-w-lg">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to HELIX
        </h1>
        <h2 className="text-xl text-muted-foreground">
          Mission Control
        </h2>
        <p className="text-muted-foreground mt-4">
          Let&apos;s set up your AI-powered workspace. This wizard will guide you through
          creating your organization, configuring AI models, setting up departments, and
          inviting your team.
        </p>
      </div>

      <Button size="lg" onClick={onNext} className="px-8">
        Get Started
      </Button>

      <p className="text-xs text-muted-foreground">
        This will take about 5 minutes
      </p>
    </div>
  );
}
