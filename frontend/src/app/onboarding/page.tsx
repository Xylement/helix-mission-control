"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Stepper } from "@/components/onboarding/stepper";
import { WelcomeStep } from "@/components/onboarding/welcome-step";
import { OrgStep } from "@/components/onboarding/org-step";
import { AIModelStep } from "@/components/onboarding/ai-model-step";
import { DepartmentsStep } from "@/components/onboarding/departments-step";
import { AgentsStep } from "@/components/onboarding/agents-step";
import { LicenseStep } from "@/components/onboarding/license-step";
import { TelegramStep } from "@/components/onboarding/telegram-step";
import { TeamStep } from "@/components/onboarding/team-step";
import { CompleteStep } from "@/components/onboarding/complete-step";
import { Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const status = await api.onboardingStatus();
      if (!status.needs_onboarding) {
        router.replace("/dashboard");
        return;
      }
      setCurrentStep(status.current_step);
    } catch {
      // If we can't reach the API, stay on step 1
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const goToStep = (step: number) => {
    // Don't allow jumping past the license step (step 3) without completing it
    if (step > 3 && currentStep <= 3) return;
    setCurrentStep(step);
  };

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 9));
  };

  const handleSkip = async (step: number) => {
    try {
      await api.onboardingSkip(step);
      setCurrentStep(step + 1);
    } catch {
      setCurrentStep(step + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Stepper header */}
      <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Stepper currentStep={currentStep} onStepClick={goToStep} />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-4 py-8">
        {currentStep === 1 && <WelcomeStep onNext={handleNext} />}
        {currentStep === 2 && <OrgStep onNext={handleNext} />}
        {currentStep === 3 && (
          <LicenseStep onNext={handleNext} />
        )}
        {currentStep === 4 && (
          <AIModelStep onNext={handleNext} onSkip={() => handleSkip(4)} />
        )}
        {currentStep === 5 && (
          <DepartmentsStep onNext={handleNext} onSkip={() => handleSkip(5)} />
        )}
        {currentStep === 6 && (
          <AgentsStep onNext={handleNext} onSkip={() => handleSkip(6)} />
        )}
        {currentStep === 7 && (
          <TelegramStep onNext={handleNext} onSkip={() => handleSkip(7)} />
        )}
        {currentStep === 8 && (
          <TeamStep onNext={handleNext} onSkip={() => handleSkip(8)} />
        )}
        {currentStep === 9 && <CompleteStep />}
      </div>
    </div>
  );
}
