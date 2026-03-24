"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type MarketplaceCategory,
  type MarketplaceSubmitRequest,
  type Agent,
  type SkillSummary,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Zap,
  GitBranch,
  Puzzle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Upload,
  FileJson,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const TEMPLATE_TYPES = [
  {
    value: "agent",
    label: "Agent",
    description: "An AI agent with configured skills and personality",
    icon: Bot,
  },
  {
    value: "skill",
    label: "Skill",
    description: "A reusable skill that agents can use",
    icon: Zap,
  },
  {
    value: "workflow",
    label: "Workflow",
    description: "A multi-step automated workflow",
    icon: GitBranch,
  },
  {
    value: "plugin",
    label: "Plugin",
    description: "An integration plugin for external services",
    icon: Puzzle,
  },
];

const STEPS = [
  { label: "Type", number: 1 },
  { label: "Info", number: 2 },
  { label: "Content", number: 3 },
  { label: "Preview", number: 4 },
  { label: "Submit", number: 5 },
];

export default function MarketplaceSubmitPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  // Form state
  const [templateType, setTemplateType] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [manifestJson, setManifestJson] = useState("");
  const [contentMode, setContentMode] = useState<"select" | "paste">("select");
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");

  // Data state
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [exportingManifest, setExportingManifest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState("");

  // Load categories when reaching step 2
  const loadCategories = useCallback(async () => {
    if (categories.length > 0) return;
    setLoadingCategories(true);
    try {
      const cats = await api.marketplaceCategories();
      setCategories(cats);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoadingCategories(false);
    }
  }, [categories.length]);

  // Load resources when reaching step 3
  const loadResources = useCallback(async () => {
    if (templateType !== "agent" && templateType !== "skill") return;
    setLoadingResources(true);
    try {
      if (templateType === "agent") {
        const data = await api.agents();
        setAgents(data);
      } else {
        const data = await api.skills();
        setSkills(data);
      }
    } catch {
      toast.error("Failed to load resources");
    } finally {
      setLoadingResources(false);
    }
  }, [templateType]);

  useEffect(() => {
    if (step === 2) loadCategories();
    if (step === 3) loadResources();
  }, [step, loadCategories, loadResources]);

  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const handleExportResource = async () => {
    if (!selectedResourceId) return;
    setExportingManifest(true);
    try {
      const id = parseInt(selectedResourceId, 10);
      let data: Record<string, unknown>;
      if (templateType === "agent") {
        data = await api.marketplaceExportAgent(id);
      } else {
        data = await api.marketplaceExportSkill(id);
      }
      setManifest(data);
      setManifestJson(JSON.stringify(data, null, 2));
      toast.success("Manifest exported successfully");
    } catch {
      toast.error("Failed to export resource");
    } finally {
      setExportingManifest(false);
    }
  };

  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(manifestJson);
      setManifest(parsed);
      toast.success("JSON parsed successfully");
    } catch {
      toast.error("Invalid JSON format");
      setManifest(null);
    }
  };

  const handleSubmit = async () => {
    if (!manifest) {
      toast.error("No manifest content provided");
      return;
    }

    setSubmitting(true);
    try {
      const data: MarketplaceSubmitRequest = {
        name,
        template_type: templateType,
        description: description || undefined,
        long_description: longDescription || undefined,
        category_slug: categorySlug,
        tags: tags.length > 0 ? tags : undefined,
        emoji: emoji || undefined,
        manifest,
      };

      const result = await api.marketplaceSubmit(data);
      setSubmissionId(result.id);
      setSubmitted(true);
      toast.success("Template submitted for review!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return !!templateType;
      case 2:
        return !!name && !!categorySlug;
      case 3:
        return manifest !== null;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // --- Step renderers ---

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, idx) => (
        <div key={s.number} className="flex items-center">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors ${
              step === s.number
                ? "bg-primary text-primary-foreground"
                : step > s.number
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step > s.number ? <Check className="h-4 w-4" /> : s.number}
          </div>
          <span
            className={`ml-1.5 text-xs hidden sm:inline ${
              step === s.number
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }`}
          >
            {s.label}
          </span>
          {idx < STEPS.length - 1 && (
            <div
              className={`w-8 h-px mx-2 ${
                step > s.number ? "bg-primary/40" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose Template Type</h2>
        <p className="text-muted-foreground mt-1">
          What kind of template would you like to submit?
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {TEMPLATE_TYPES.map((t) => {
          const Icon = t.icon;
          const selected = templateType === t.value;
          return (
            <Card
              key={t.value}
              className={`cursor-pointer transition-all hover:border-primary/40 ${
                selected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border"
              }`}
              onClick={() => {
                setTemplateType(t.value);
                // Reset content state when type changes
                setManifest(null);
                setManifestJson("");
                setSelectedResourceId("");
                setContentMode("select");
              }}
            >
              <CardContent className="p-6 text-center">
                <Icon
                  className={`h-10 w-10 mx-auto mb-3 ${
                    selected ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <h3 className="font-semibold text-lg">{t.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Basic Information</h2>
        <p className="text-muted-foreground mt-1">
          Describe your template so others can find and understand it.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_80px] gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name</label>
            <Input
              placeholder="My Awesome Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Emoji</label>
            <Input
              placeholder="🤖"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="text-center text-lg"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Short Description
            <span className="text-muted-foreground font-normal ml-1">
              ({description.length}/500)
            </span>
          </label>
          <Textarea
            placeholder="A brief description of what this template does..."
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, 500))
            }
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Long Description
            <span className="text-muted-foreground font-normal ml-1">
              (Markdown supported)
            </span>
          </label>
          <Textarea
            placeholder="Detailed description with features, usage instructions, etc..."
            value={longDescription}
            onChange={(e) => setLongDescription(e.target.value)}
            rows={6}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Category</label>
          {loadingCategories ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading categories...
            </div>
          ) : (
            <Select value={categorySlug} onValueChange={setCategorySlug}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.slug} value={cat.slug}>
                    {cat.icon && <span className="mr-1">{cat.icon}</span>}
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Tags
            <span className="text-muted-foreground font-normal ml-1">
              (comma-separated)
            </span>
          </label>
          <Input
            placeholder="automation, customer-support, ai"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const canSelectResource =
      templateType === "agent" || templateType === "skill";
    const resources =
      templateType === "agent"
        ? agents.map((a) => ({ id: String(a.id), name: a.name }))
        : templateType === "skill"
          ? skills.map((s) => ({ id: String(s.id), name: s.name }))
          : [];

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Template Content</h2>
          <p className="text-muted-foreground mt-1">
            Provide the manifest for your template.
          </p>
        </div>

        {canSelectResource && (
          <div className="flex gap-2 justify-center">
            <Button
              variant={contentMode === "select" ? "default" : "outline"}
              size="sm"
              onClick={() => setContentMode("select")}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Export Existing
            </Button>
            <Button
              variant={contentMode === "paste" ? "default" : "outline"}
              size="sm"
              onClick={() => setContentMode("paste")}
            >
              <FileJson className="h-4 w-4 mr-1.5" />
              Paste JSON
            </Button>
          </div>
        )}

        {canSelectResource && contentMode === "select" ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Select {templateType === "agent" ? "Agent" : "Skill"}
              </label>
              {loadingResources ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading {templateType}s...
                </div>
              ) : (
                <Select
                  value={selectedResourceId}
                  onValueChange={setSelectedResourceId}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={`Choose a ${templateType} to export`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              onClick={handleExportResource}
              disabled={!selectedResourceId || exportingManifest}
              className="w-full"
            >
              {exportingManifest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Export Manifest
                </>
              )}
            </Button>

            {manifest && (
              <div className="rounded-md border border-border bg-muted/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">
                    Manifest exported successfully
                  </span>
                </div>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap">
                  {JSON.stringify(manifest, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Manifest JSON
              </label>
              <Textarea
                placeholder='{"name": "...", "config": { ... }}'
                value={manifestJson}
                onChange={(e) => {
                  setManifestJson(e.target.value);
                  setManifest(null);
                }}
                rows={12}
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={handleParseJson} disabled={!manifestJson} className="w-full">
              <FileJson className="h-4 w-4 mr-1.5" />
              Validate JSON
            </Button>
            {manifest && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                Valid JSON parsed successfully
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStep4 = () => {
    const selectedType = TEMPLATE_TYPES.find((t) => t.value === templateType);
    const selectedCategory = categories.find((c) => c.slug === categorySlug);

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Preview</h2>
          <p className="text-muted-foreground mt-1">
            Review how your template will appear in the marketplace.
          </p>
        </div>

        {/* Template card preview */}
        <Card className="max-w-sm mx-auto hover:shadow-md transition-all">
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{emoji || "📦"}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {name || "Untitled Template"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  by {user?.name || "You"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {description || "No description provided"}
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                {selectedType?.label || templateType}
              </Badge>
              {selectedCategory && (
                <span className="text-xs text-muted-foreground">
                  {selectedCategory.icon} {selectedCategory.name}
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {tags.slice(0, 4).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {tags.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{tags.length - 4} more
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details summary */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h4 className="font-semibold text-sm">Submission Details</h4>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Type</span>
              <span>{selectedType?.label}</span>
              <span className="text-muted-foreground">Name</span>
              <span>{name}</span>
              <span className="text-muted-foreground">Category</span>
              <span>{selectedCategory?.name || categorySlug}</span>
              <span className="text-muted-foreground">Tags</span>
              <span>{tags.length > 0 ? tags.join(", ") : "None"}</span>
              <span className="text-muted-foreground">Manifest</span>
              <span className="text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Provided
              </span>
            </div>
            {longDescription && (
              <div className="pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground block mb-1">
                  Long Description Preview
                </span>
                <p className="text-sm whitespace-pre-wrap line-clamp-4">
                  {longDescription}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderStep5 = () => {
    if (submitted) {
      return (
        <div className="text-center space-y-6 max-w-md mx-auto py-8">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Submitted Successfully!</h2>
            <p className="text-muted-foreground mt-2">
              Your template has been submitted for review. You will be notified
              once it has been reviewed by the marketplace team.
            </p>
          </div>
          {submissionId && (
            <div className="bg-muted/50 rounded-md p-4 text-sm">
              <span className="text-muted-foreground">Submission ID: </span>
              <span className="font-mono">{submissionId}</span>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => router.push("/marketplace")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Marketplace
            </Button>
            <Button onClick={() => router.push("/marketplace/submit")}>
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Submit Another
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center space-y-6 max-w-md mx-auto py-8">
        <div>
          <h2 className="text-2xl font-bold">Ready to Submit?</h2>
          <p className="text-muted-foreground mt-2">
            Your template will be reviewed by the HELIX marketplace team before
            being published. This usually takes 1-2 business days.
          </p>
        </div>

        <Card>
          <CardContent className="p-5 text-sm text-left space-y-2">
            <p className="font-medium">Before submitting, please confirm:</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                Your template does not contain sensitive data or credentials
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                The description accurately represents what the template does
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                You have the right to share this template publicly
              </li>
            </ul>
          </CardContent>
        </Card>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          size="lg"
          className="w-full max-w-xs"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1.5" />
              Submit Template
            </>
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {renderStepIndicator()}

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}

      {/* Navigation buttons */}
      {!submitted && (
        <div className="flex justify-between mt-8 max-w-2xl mx-auto">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          {step < 5 && (
            <Button onClick={goNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
