"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { api, type Board, type Skill, type SkillAttachment } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Code,
  Download,
  Eye,
  FileText,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: "copywriting", label: "Copywriting" },
  { value: "branding", label: "Branding" },
  { value: "social-media", label: "Social Media" },
  { value: "email", label: "Email" },
  { value: "customer-service", label: "Customer Service" },
  { value: "advertising", label: "Advertising" },
  { value: "seo", label: "SEO" },
  { value: "reporting", label: "Reporting" },
  { value: "development", label: "Development" },
];

const ALLOWED_ATTACHMENT_EXTS = [
  ".pdf", ".md", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".xlsx", ".docx",
];
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const SKILL_TEMPLATE = `## Tone & Voice
[Describe the writing style, personality, language]

## Structure
[Describe the expected output format]

## Rules
[List of must-follow rules]

## Examples
### Good
[Show a good example]

### Bad
[Show what to avoid]

## Do
- [Things to always do]

## Don't
- [Things to never do]
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return version;
  parts[2] = String(Number(parts[2]) + 1);
  return parts.join(".");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingFile {
  file: File;
  description: string;
  id: string;
}

export interface SkillFormProps {
  /** Existing skill for edit mode — null for create mode */
  initialSkill?: Skill | null;
  /** Existing attachments for edit mode */
  existingAttachments?: SkillAttachment[];
  /** Called after successful save. Receives the saved skill. */
  onSaved: (skill: Skill) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillForm({
  initialSkill = null,
  existingAttachments = [],
  onSaved,
  onCancel,
}: SkillFormProps) {
  const isEdit = !!initialSkill;

  // Form fields
  const [name, setName] = useState(initialSkill?.name || "");
  const [slug, setSlug] = useState(initialSkill?.slug || "");
  const [slugManual, setSlugManual] = useState(isEdit);
  const [description, setDescription] = useState(initialSkill?.description || "");
  const [category, setCategory] = useState(initialSkill?.category || "");
  const [tags, setTags] = useState<string[]>(initialSkill?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [version, setVersion] = useState(initialSkill?.version || "1.0.0");
  const [activationMode, setActivationMode] = useState(initialSkill?.activation_mode || "always");
  const [activationBoards, setActivationBoards] = useState<number[]>(initialSkill?.activation_boards || []);
  const [activationTags, setActivationTags] = useState<string[]>(initialSkill?.activation_tags || []);
  const [activationTagInput, setActivationTagInput] = useState("");
  const [content, setContent] = useState(initialSkill?.content || "");
  const [originalContent] = useState(initialSkill?.content || "");

  // Track if content changed (for auto version bump in edit mode)
  const [versionBumped, setVersionBumped] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Boards
  const [boards, setBoards] = useState<Board[]>([]);

  // Attachments
  const [currentAttachments, setCurrentAttachments] = useState<SkillAttachment[]>(existingAttachments);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [deletingAttachment, setDeletingAttachment] = useState<number | null>(null);

  // Saving
  const [saving, setSaving] = useState(false);

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const attachDropRef = useRef<HTMLDivElement>(null);

  // Load boards
  useEffect(() => {
    api.boards().then(setBoards).catch(() => {});
  }, []);

  // Auto-slug (create mode only)
  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  // Auto-bump version when content changes in edit mode
  useEffect(() => {
    if (isEdit && !versionBumped && content !== originalContent && content.length > 0) {
      setVersion(bumpPatch(initialSkill?.version || "1.0.0"));
      setVersionBumped(true);
    }
  }, [content, isEdit, versionBumped, originalContent, initialSkill?.version]);

  // ------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------

  const insertMarkdown = useCallback(
    (before: string, after: string = "") => {
      const el = editorRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = content.slice(start, end);
      const newText =
        content.slice(0, start) + before + selected + after + content.slice(end);
      setContent(newText);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(
          start + before.length,
          start + before.length + selected.length
        );
      });
    },
    [content]
  );

  const toolbarActions = useMemo(
    () => [
      { icon: Heading2, label: "H2", action: () => insertMarkdown("## ", "\n") },
      { icon: Heading3, label: "H3", action: () => insertMarkdown("### ", "\n") },
      { sep: true },
      { icon: Bold, label: "Bold", action: () => insertMarkdown("**", "**") },
      { icon: Italic, label: "Italic", action: () => insertMarkdown("*", "*") },
      { icon: Code, label: "Code", action: () => insertMarkdown("`", "`") },
      { sep: true },
      { icon: List, label: "Bullet list", action: () => insertMarkdown("- ") },
      { icon: ListOrdered, label: "Numbered list", action: () => insertMarkdown("1. ") },
      { icon: Link2, label: "Link", action: () => insertMarkdown("[", "](url)") },
      { icon: Minus, label: "Divider", action: () => insertMarkdown("\n---\n") },
    ],
    [insertMarkdown]
  );

  // ------------------------------------------------------------------
  // Tags
  // ------------------------------------------------------------------

  const addTag = (value: string) => {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const addActivationTag = (value: string) => {
    const t = value.trim().toLowerCase();
    if (t && !activationTags.includes(t)) setActivationTags([...activationTags, t]);
    setActivationTagInput("");
  };

  const removeActivationTag = (tag: string) =>
    setActivationTags(activationTags.filter((t) => t !== tag));

  // ------------------------------------------------------------------
  // Attachments
  // ------------------------------------------------------------------

  const handleAttachmentFiles = (files: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXTS.includes(ext)) {
        toast.error(`File type ${ext} not allowed: ${file.name}`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`File too large (max 10MB): ${file.name}`);
        continue;
      }
      newFiles.push({ file, description: "", id: crypto.randomUUID() });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const removePendingFile = (id: string) =>
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));

  const updatePendingFileDesc = (id: string, desc: string) =>
    setPendingFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, description: desc } : f))
    );

  const deleteExistingAttachment = async (attachmentId: number) => {
    setDeletingAttachment(attachmentId);
    try {
      await api.deleteSkillAttachment(attachmentId);
      setCurrentAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast.success("Attachment deleted");
    } catch {
      toast.error("Failed to delete attachment");
    } finally {
      setDeletingAttachment(null);
    }
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Skill name is required");
      return;
    }
    setSaving(true);
    try {
      let skill: Skill;

      if (isEdit && initialSkill) {
        // Update
        skill = await api.updateSkill(initialSkill.id, {
          name: name.trim(),
          slug: slug || undefined,
          description: description.trim() || undefined,
          category: category || undefined,
          tags: tags.length > 0 ? tags : [],
          content,
          activation_mode: activationMode,
          activation_boards: activationMode === "board" ? activationBoards : [],
          activation_tags: activationMode === "tag" ? activationTags : [],
        });
      } else {
        // Create
        skill = await api.createSkill({
          name: name.trim(),
          slug: slug || undefined,
          description: description.trim() || undefined,
          category: category || undefined,
          tags: tags.length > 0 ? tags : undefined,
          content,
          activation_mode: activationMode,
          activation_boards: activationMode === "board" ? activationBoards : undefined,
          activation_tags: activationMode === "tag" ? activationTags : undefined,
        });
      }

      // Upload new attachments
      for (const pf of pendingFiles) {
        try {
          await api.uploadSkillAttachment(skill.id, pf.file, pf.description || undefined);
        } catch {
          toast.error(`Failed to upload ${pf.file.name}`);
        }
      }

      onSaved(skill);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Drag-and-drop
  // ------------------------------------------------------------------

  const onAttachDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-primary", "bg-primary/5");
    if (e.dataTransfer.files?.length) handleAttachmentFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("border-primary", "bg-primary/5");
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("border-primary", "bg-primary/5");
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Name + Slug */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shopee Product Listing"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Slug</label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                placeholder="auto-generated"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short summary of what this skill teaches agents..."
            />
          </div>

          {/* Category + Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Version
                {isEdit && versionBumped && (
                  <span className="text-xs text-muted-foreground ml-2">(auto-bumped)</span>
                )}
              </label>
              <Input
                value={version}
                onChange={(e) => { setVersion(e.target.value); setVersionBumped(true); }}
                placeholder="1.0.0"
                className="font-mono"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              placeholder="Type tag and press Enter..."
              className="max-w-sm"
            />
          </div>

          {/* Activation mode */}
          <div>
            <label className="text-sm font-medium mb-2 block">Activation Mode</label>
            <div className="flex gap-2 mb-3">
              {([
                { value: "always", label: "Always", desc: "Active on every task" },
                { value: "board", label: "Board-specific", desc: "Only on selected boards" },
                { value: "tag", label: "Tag-specific", desc: "Only on matching task tags" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setActivationMode(opt.value)}
                  className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
                    activationMode === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {activationMode === "board" && (
              <div className="pl-1">
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Select boards where this skill activates
                </label>
                <div className="flex flex-wrap gap-2">
                  {boards.map((board) => {
                    const selected = activationBoards.includes(board.id);
                    return (
                      <button
                        key={board.id}
                        onClick={() =>
                          setActivationBoards(
                            selected
                              ? activationBoards.filter((bid) => bid !== board.id)
                              : [...activationBoards, board.id]
                          )
                        }
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {board.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activationMode === "tag" && (
              <div className="pl-1">
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Task tags that trigger this skill
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {activationTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                      {tag}
                      <button onClick={() => removeActivationTag(tag)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  value={activationTagInput}
                  onChange={(e) => setActivationTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addActivationTag(activationTagInput);
                    }
                  }}
                  onBlur={() => { if (activationTagInput.trim()) addActivationTag(activationTagInput); }}
                  placeholder="Type tag and press Enter..."
                  className="max-w-sm"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Markdown Editor */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-0.5 px-3 py-2 border-b bg-muted/30 flex-wrap">
            {toolbarActions.map((item, i) =>
              "sep" in item ? (
                <div key={i} className="w-px h-5 bg-border mx-1" />
              ) : (
                <button
                  key={i}
                  onClick={item.action}
                  title={item.label}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                </button>
              )
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => {
                if (!content.trim()) setContent(SKILL_TEMPLATE);
                else setContent(content + "\n\n" + SKILL_TEMPLATE);
              }}
            >
              <Sparkles className="h-3 w-3" /> Use Template
            </Button>
            <Button
              variant={showPreview ? "secondary" : "ghost"}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-3 w-3" /> Preview
            </Button>
          </div>
          <div className={showPreview ? "grid grid-cols-2 divide-x" : ""}>
            <div>
              <Textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                placeholder="Write your skill content in Markdown..."
                className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none font-mono text-sm min-h-[480px]"
              />
            </div>
            {showPreview && (
              <div className="p-4 overflow-y-auto max-h-[520px]">
                {content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nothing to preview yet...</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            Attachments
            <span className="text-muted-foreground font-normal">
              (optional — brand guides, reference docs, images)
            </span>
          </h3>

          {/* Existing attachments (edit mode) */}
          {currentAttachments.length > 0 && (
            <div className="space-y-2 mb-4">
              {currentAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{att.original_filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {att.file_size !== null ? formatBytes(att.file_size) : ""}
                      {att.description ? ` — ${att.description}` : ""}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={api.downloadSkillAttachmentUrl(att.id)} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingAttachment === att.id}
                    onClick={() => deleteExistingAttachment(att.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Pending new files */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2 mb-4">
              {pendingFiles.map((pf) => (
                <div key={pf.id} className="flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{pf.file.name}</div>
                    <div className="text-xs text-muted-foreground">{formatBytes(pf.file.size)} — new</div>
                  </div>
                  <Input
                    value={pf.description}
                    onChange={(e) => updatePendingFileDesc(pf.id, e.target.value)}
                    placeholder="Description..."
                    className="max-w-[200px] h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removePendingFile(pf.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            ref={attachDropRef}
            onDrop={onAttachDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className="border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ALLOWED_ATTACHMENT_EXTS.join(",");
              input.onchange = () => { if (input.files) handleAttachmentFiles(input.files); };
              input.click();
            }}
          >
            <Plus className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Max 10MB per file. PDF, MD, TXT, images, CSV, XLSX, DOCX</p>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between pb-8">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
          {saving && (
            <svg className="h-4 w-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
            </svg>
          )}
          {isEdit ? "Save Changes" : "Create Skill"}
        </Button>
      </div>
    </div>
  );
}
