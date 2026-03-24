"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, type Skill, type SkillAgent } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskResultRenderer } from "@/components/TaskResultRenderer";
import {
  ArrowLeft,
  Calendar,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { ExportTemplateModal } from "@/components/marketplace/ExportTemplateModal";

const CATEGORY_ICONS: Record<string, string> = {
  copywriting: "✍️",
  branding: "🎨",
  "social-media": "📱",
  email: "📧",
  "customer-service": "💬",
  advertising: "📢",
  seo: "🔍",
  reporting: "📊",
  development: "💻",
};

const ACTIVATION_DOT: Record<string, string> = {
  always: "bg-green-500",
  board: "bg-blue-500",
  tag: "bg-amber-500",
};

const ACTIVATION_LABEL: Record<string, string> = {
  always: "Always active",
  board: "Board-specific",
  tag: "Tag-specific",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const skillId = Number(id);

  const [skill, setSkill] = useState<Skill | null>(null);
  const [agents, setAgents] = useState<SkillAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"content" | "attachments" | "agents">("content");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showExportTemplate, setShowExportTemplate] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!skillId) return;
    (async () => {
      try {
        const [s, a] = await Promise.all([
          api.skill(skillId),
          api.getSkillAgents(skillId),
        ]);
        setSkill(s);
        setAgents(a);
      } catch {
        toast.error("Skill not found");
        router.replace("/skills");
      } finally {
        setLoading(false);
      }
    })();
  }, [skillId, router]);

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      await api.deleteSkill(skill.id);
      toast.success("Skill deleted");
      router.replace("/skills");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (!skill) return;
    const url = api.exportSkillUrl(skill.id);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    // Use fetch to add auth header, then download as blob
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${skill.slug}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Export failed"));
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="animate-in-page max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md skeleton-shimmer" />
          <div className="h-8 w-64 rounded-md skeleton-shimmer" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="h-6 w-48 rounded-md skeleton-shimmer" />
            <div className="h-4 w-full rounded-md skeleton-shimmer" />
            <div className="h-4 w-3/4 rounded-md skeleton-shimmer" />
            <div className="h-64 w-full rounded-md skeleton-shimmer" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!skill) return null;

  const categoryIcon = skill.category ? CATEGORY_ICONS[skill.category] || "📝" : "📝";
  const attachments = skill.attachments || [];

  const tabs = [
    { key: "content" as const, label: "Content", count: null },
    { key: "attachments" as const, label: "Attachments", count: attachments.length },
    { key: "agents" as const, label: "Agents", count: agents.length },
  ];

  return (
    <div className="animate-in-page max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground -ml-2"
        onClick={() => router.push("/skills")}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Skills Library
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0">
            {categoryIcon}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{skill.name}</h1>
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                v{skill.version}
              </span>
              <Badge
                variant="outline"
                className="text-xs gap-1"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    ACTIVATION_DOT[skill.activation_mode] || ACTIVATION_DOT.always
                  }`}
                />
                {ACTIVATION_LABEL[skill.activation_mode] || skill.activation_mode}
              </Badge>
              {skill.is_system && (
                <Badge variant="secondary" className="text-[10px]">System</Badge>
              )}
            </div>
            {skill.description && (
              <p className="text-muted-foreground mt-1">{skill.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/skills/${skill.id}/edit`)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExportTemplate(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Export as Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
              disabled={skill.is_system}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {skill.category && (
          <Badge variant="secondary" className="capitalize">{skill.category}</Badge>
        )}
        {(skill.tags || []).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>
        ))}
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" /> Created {formatDate(skill.created_at)}
        </span>
        {skill.updated_at && skill.updated_at !== skill.created_at && (
          <span className="flex items-center gap-1">
            Updated {formatDate(skill.updated_at)}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-medium text-foreground">{agents.length}</span> agent{agents.length !== 1 ? "s" : ""} assigned
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          <span className="font-medium text-foreground">{attachments.length}</span> attachment{attachments.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "content" && (
        <Card>
          <CardContent className="p-6">
            {skill.content ? (
              <TaskResultRenderer content={skill.content} />
            ) : (
              <p className="text-muted-foreground italic text-center py-8">
                No content yet. <button className="text-primary underline" onClick={() => router.push(`/skills/${skill.id}/edit`)}>Add content</button>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "attachments" && (
        <Card>
          <CardContent className="p-6">
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {att.original_filename}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {att.file_size !== null && (
                          <span>{formatBytes(att.file_size)}</span>
                        )}
                        {att.mime_type && <span>{att.mime_type}</span>}
                        {att.description && (
                          <span className="truncate">— {att.description}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      asChild
                    >
                      <a
                        href={api.downloadSkillAttachmentUrl(att.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <Paperclip className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">No attachments</p>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Add attachments by editing this skill.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "agents" && (
        <Card>
          <CardContent className="p-6">
            {agents.length > 0 ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => router.push(`/agents/${agent.id}`)}
                  >
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-lg shadow-sm flex-shrink-0">
                      🤖
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {agent.role_title}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        agent.status === "online"
                          ? "border-green-500/50 text-green-600"
                          : agent.status === "busy"
                          ? "border-yellow-500/50 text-yellow-600"
                          : ""
                      }`}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">
                  Not assigned to any agents yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Assign this skill from an agent&apos;s detail page under the Skills tab.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{skill.name}</strong>? This will
            unassign it from all agents. This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export as Template Modal */}
      {showExportTemplate && skill && (
        <ExportTemplateModal
          type="skill"
          resourceId={skill.id}
          resourceName={skill.name}
          onClose={() => setShowExportTemplate(false)}
        />
      )}
    </div>
  );
}
