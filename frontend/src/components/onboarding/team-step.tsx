"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { Loader2, Plus, X, SkipForward, Users, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface TeamStepProps {
  onNext: () => void;
  onSkip: () => void;
}

interface MemberRow {
  name: string;
  email: string;
  role: string;
}

interface CreatedMember {
  name: string;
  email: string;
  temp_password: string;
}

export function TeamStep({ onNext, onSkip }: TeamStepProps) {
  const [members, setMembers] = useState<MemberRow[]>([
    { name: "", email: "", role: "member" },
  ]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedMember[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const addRow = () => {
    setMembers((prev) => [...prev, { name: "", email: "", role: "member" }]);
  };

  const removeRow = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof MemberRow, value: string) => {
    setMembers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const copyPassword = (idx: number, password: string) => {
    navigator.clipboard.writeText(password);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleSubmit = async () => {
    const validMembers = members.filter((m) => m.name.trim() && m.email.trim());
    if (validMembers.length === 0) {
      toast.error("Add at least one team member");
      return;
    }

    setSaving(true);
    try {
      const result = await api.onboardingStep7({ members: validMembers });
      if (result.members_created) {
        setCreated(result.members_created);
        toast.success(`${result.members_created.length} team members created!`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create members");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Invite Your Team</h2>
        <p className="text-muted-foreground text-sm">
          Add team members who will use Mission Control
        </p>
      </div>

      {created ? (
        <div className="space-y-4">
          <Card className="p-4 border-amber-500/30 bg-amber-500/5">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Share these temporary passwords with your team. They will need to change them on first login.
            </p>
          </Card>

          <div className="space-y-2">
            {created.map((member, idx) => (
              <Card key={idx} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {member.temp_password}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyPassword(idx, member.temp_password)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedIdx === idx ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button className="w-full" onClick={onNext}>
            Continue to Finish
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {members.map((member, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Name"
                    value={member.name}
                    onChange={(e) => updateRow(idx, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={member.email}
                    onChange={(e) => updateRow(idx, "email", e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={member.role}
                    onValueChange={(v) => updateRow(idx, "role", v)}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Button variant="outline" onClick={addRow} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add Another
          </Button>

          <Button className="w-full" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Team Members
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <SkipForward className="h-3 w-3" /> Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
