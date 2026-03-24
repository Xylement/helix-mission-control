"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, type Skill, type SkillAttachment } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { SkillForm } from "@/components/skills/SkillForm";

export default function EditSkillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const skillId = Number(id);

  const [skill, setSkill] = useState<Skill | null>(null);
  const [attachments, setAttachments] = useState<SkillAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace(`/skills/${skillId}`);
      return;
    }
  }, [user, router, skillId]);

  useEffect(() => {
    if (!skillId) return;
    (async () => {
      try {
        const s = await api.skill(skillId);
        setSkill(s);
        setAttachments(s.attachments || []);
      } catch {
        toast.error("Skill not found");
        router.replace("/skills");
      } finally {
        setLoading(false);
      }
    })();
  }, [skillId, router]);

  // Loading
  if (loading) {
    return (
      <div className="animate-in-page max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md skeleton-shimmer" />
          <div className="h-8 w-48 rounded-md skeleton-shimmer" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="h-10 w-full rounded-md skeleton-shimmer" />
            <div className="h-10 w-full rounded-md skeleton-shimmer" />
            <div className="h-32 w-full rounded-md skeleton-shimmer" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!skill) return null;

  // System skill — read-only
  if (skill.is_system) {
    return (
      <div className="animate-in-page max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/skills/${skill.id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Edit Skill</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">System Skill</h3>
            <p className="text-muted-foreground text-sm">
              <strong>{skill.name}</strong> is a system skill and cannot be edited.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push(`/skills/${skill.id}`)}
            >
              Back to Skill
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-in-page max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/skills/${skill.id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Skill</h1>
          <p className="text-sm text-muted-foreground">
            Editing <strong>{skill.name}</strong>
          </p>
        </div>
      </div>

      <SkillForm
        initialSkill={skill}
        existingAttachments={attachments}
        onSaved={(updated) => {
          toast.success("Skill saved!");
          router.push(`/skills/${updated.id}`);
        }}
        onCancel={() => router.push(`/skills/${skill.id}`)}
      />
    </div>
  );
}
