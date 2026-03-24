"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { SkillForm } from "@/components/skills/SkillForm";
import { type Skill } from "@/lib/api";

// ---------------------------------------------------------------------------
// Frontmatter parser (for upload mode)
// ---------------------------------------------------------------------------

function parseFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("---")) return { meta: {}, body: text };
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return { meta: {}, body: text };
  const yamlBlock = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 3).trimStart();
  const meta: Record<string, unknown> = {};
  let currentKey = "";
  let currentList: string[] | null = null;
  for (const line of yamlBlock.split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.+)/);
    if (listMatch && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listMatch[1].trim());
      continue;
    }
    if (currentKey && currentList) {
      meta[currentKey] = currentList;
      currentList = null;
    }
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val) meta[currentKey] = val;
    }
  }
  if (currentKey && currentList) meta[currentKey] = currentList;
  return { meta, body };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateSkillPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"editor" | "upload">("editor");
  // When a file is uploaded, we build a synthetic Skill to pre-fill the form
  const [importedSkill, setImportedSkill] = useState<Skill | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/skills");
  }, [user, router]);

  const handleFileUpload = useCallback((file: File) => {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      toast.error("Only .md and .txt files are supported");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { meta, body } = parseFrontmatter(text);
      const activation = meta.activation as Record<string, unknown> | undefined;
      // Build a partial Skill object to pre-fill the form
      setImportedSkill({
        id: 0,
        name: (meta.name as string) || "",
        slug: (meta.slug as string) || "",
        version: (meta.version as string) || "1.0.0",
        description: (meta.description as string) || null,
        category: (meta.category as string) || null,
        tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : null,
        content: body,
        activation_mode: (activation?.mode as string) || "always",
        activation_boards: Array.isArray(activation?.boards) ? (activation.boards as number[]) : null,
        activation_tags: Array.isArray(activation?.tags) ? (activation.tags as string[]) : null,
        is_system: false,
        created_by: null,
        created_at: null,
        updated_at: null,
        agent_count: 0,
        attachment_count: 0,
        attachments: null,
      });
      setFormKey((k) => k + 1);
      setMode("editor");
      toast.success("File parsed — review and save");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.currentTarget.classList.remove("border-primary", "bg-primary/5");
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  return (
    <div className="animate-in-page max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/skills")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Skill</h1>
          <p className="text-sm text-muted-foreground">
            Teach your agents how to perform specific types of work
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "editor"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("editor")}
        >
          <FileText className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Editor
        </button>
        <button
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "upload"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("upload")}
        >
          <Upload className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Upload .md file
        </button>
      </div>

      {/* Upload mode */}
      {mode === "upload" && (
        <Card>
          <CardContent className="p-8">
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("border-primary", "bg-primary/5")}
              className="border-2 border-dashed rounded-xl p-16 text-center transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">
                Drop a .md file here or click to browse
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                If the file has YAML frontmatter, we&apos;ll extract metadata and pre-fill the form.
              </p>
              <p className="text-xs text-muted-foreground">Supported: .md, .txt</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Editor mode */}
      {mode === "editor" && (
        <SkillForm
          key={formKey}
          initialSkill={importedSkill}
          onSaved={(skill) => {
            toast.success("Skill created!");
            router.push(`/skills/${skill.id}`);
          }}
          onCancel={() => router.push("/skills")}
        />
      )}
    </div>
  );
}
