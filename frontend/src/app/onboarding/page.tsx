"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { billingApi } from "@/lib/billing";
import { Stepper } from "@/components/onboarding/stepper";
import { WelcomeStep } from "@/components/onboarding/welcome-step";
import { OrgStep } from "@/components/onboarding/org-step";
import { AIModelStep } from "@/components/onboarding/ai-model-step";
import { DepartmentsStep } from "@/components/onboarding/departments-step";
import { AgentsStep } from "@/components/onboarding/agents-step";
import { LicenseStep } from "@/components/onboarding/license-step";
import { BrandingStep } from "@/components/onboarding/branding-step";
import { TelegramStep } from "@/components/onboarding/telegram-step";
import { TeamStep } from "@/components/onboarding/team-step";
import { CompleteStep } from "@/components/onboarding/complete-step";
import { Loader2 } from "lucide-react";

const WHITE_LABEL_PLANS = ["agency", "partner", "enterprise"];

const BASE_LABELS = [
  "Welcome", "Organization", "License", "AI Model",
  "Departments", "Agents", "Telegram", "Team", "Complete",
];

const BRANDING_LABELS = [
  "Welcome", "Organization", "License", "Branding", "AI Model",
  "Departments", "Agents", "Telegram", "Team", "Complete",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showBranding, setShowBranding] = useState(false);

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

  const totalSteps = showBranding ? 10 : 9;
  const stepLabels = showBranding ? BRANDING_LABELS : BASE_LABELS;

  // Map logical step positions based on whether branding step is active
  // With branding: 1-Welcome 2-Org 3-License 4-Branding 5-AI 6-Dept 7-Agents 8-Telegram 9-Team 10-Complete
  // Without:       1-Welcome 2-Org 3-License 4-AI 5-Dept 6-Agents 7-Telegram 8-Team 9-Complete
  const step = useMemo(() => {
    if (!showBranding) {
      return {
        welcome: 1, org: 2, license: 3, branding: -1,
        ai: 4, departments: 5, agents: 6, telegram: 7, team: 8, complete: 9,
      };
    }
    return {
      welcome: 1, org: 2, license: 3, branding: 4,
      ai: 5, departments: 6, agents: 7, telegram: 8, team: 9, complete: 10,
    };
  }, [showBranding]);

  const goToStep = (s: number) => {
    if (s > step.license && currentStep <= step.license) return;
    setCurrentStep(s);
  };

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const handleLicenseNext = async () => {
    // After license activation, check if plan has white_label
    try {
      const plan = await billingApi.getPlan();
      const planName = plan?.plan?.toLowerCase() || "";
      if (WHITE_LABEL_PLANS.includes(planName)) {
        setShowBranding(true);
        setCurrentStep(4); // branding step
        return;
      }
    } catch {
      // Ignore — proceed without branding step
    }
    setShowBranding(false);
    handleNext();
  };

  const handleSkip = async (logicalStep: number) => {
    try {
      // The backend tracks steps 1-8 regardless of branding insertion
      // Map our step number back to the backend's step number
      const backendStep = showBranding && logicalStep > step.branding
        ? logicalStep - 1
        : logicalStep;
      await api.onboardingSkip(backendStep);
    } catch {
      // Ignore skip errors
    }
    setCurrentStep(logicalStep + 1);
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
          <Stepper currentStep={currentStep} onStepClick={goToStep} labels={stepLabels} />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-4 py-8">
        {currentStep === step.welcome && <WelcomeStep onNext={handleNext} />}
        {currentStep === step.org && <OrgStep onNext={handleNext} />}
        {currentStep === step.license && (
          <LicenseStep onNext={handleLicenseNext} />
        )}
        {showBranding && currentStep === step.branding && (
          <BrandingStep onNext={handleNext} onSkip={() => handleSkip(step.branding)} />
        )}
        {currentStep === step.ai && (
          <AIModelStep onNext={handleNext} onSkip={() => handleSkip(step.ai)} />
        )}
        {currentStep === step.departments && (
          <DepartmentsStep onNext={handleNext} onSkip={() => handleSkip(step.departments)} />
        )}
        {currentStep === step.agents && (
          <AgentsStep onNext={handleNext} onSkip={() => handleSkip(step.agents)} />
        )}
        {currentStep === step.telegram && (
          <TelegramStep onNext={handleNext} onSkip={() => handleSkip(step.telegram)} />
        )}
        {currentStep === step.team && (
          <TeamStep onNext={handleNext} onSkip={() => handleSkip(step.team)} />
        )}
        {currentStep === step.complete && <CompleteStep />}
      </div>
    </div>
  );
}
