"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

interface OrgStepProps {
  onNext: () => void;
}

export function OrgStep({ onNext }: OrgStepProps) {
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!orgName || !adminEmail || !adminPassword || !adminName) {
      toast.error("All fields are required");
      return;
    }
    if (adminPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (adminPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const result = await api.onboardingStep2({
        org_name: orgName,
        admin_email: adminEmail,
        admin_password: adminPassword,
        admin_name: adminName,
      });

      if (result.token) {
        localStorage.setItem("token", result.token);
      }

      toast.success("Organization created!");
      onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Create Your Organization</h2>
        <p className="text-muted-foreground text-sm">
          Set up your company and admin account
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Organization Name</label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Corp"
          />
        </div>

        <hr className="border-border" />

        <div>
          <label className="text-sm font-medium mb-1 block">Admin Name</label>
          <Input
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Admin Email</label>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@yourcompany.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Password</label>
          <Input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Confirm Password</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={saving || !orgName || !adminEmail || !adminPassword || !adminName}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Organization & Admin
        </Button>
      </Card>
    </div>
  );
}
