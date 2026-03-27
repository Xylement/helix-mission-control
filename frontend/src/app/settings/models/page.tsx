"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { api, type AIModel, type AIModelCreate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  RefreshCw,
  FlaskConical,
  ShieldAlert,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

const PROVIDER_BASE_URLS: Record<string, string> = {
  moonshot: "https://api.moonshot.ai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  kimi_code: "https://api.kimi.com/coding/",
  custom: "",
};

const PROVIDER_LABELS: Record<string, string> = {
  moonshot: "Moonshot (Kimi K2.5)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  nvidia: "NVIDIA",
  kimi_code: "Kimi Code (Advanced)",
  custom: "Custom",
};

const PROVIDER_COLORS: Record<string, string> = {
  moonshot: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  openai: "bg-green-500/15 text-green-600 dark:text-green-400",
  anthropic: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  nvidia: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  kimi_code: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  custom: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

const PROVIDER_SUGGESTIONS: Record<string, string[]> = {
  moonshot: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview", "kimi-k2-0711-preview", "kimi-k2-thinking", "kimi-k2-thinking-turbo"],
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-4o", "gpt-4o-mini"],
  anthropic: ["claude-opus-4-6-20250205", "claude-sonnet-4-6-20250217", "claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250514", "claude-opus-4-5-20251124"],
  nvidia: ["meta/llama-3.1-405b-instruct", "meta/llama-3.1-70b-instruct", "mistralai/mixtral-8x22b-instruct-v0.1"],
  kimi_code: ["k2p5"],
  custom: [],
};

const PROVIDER_NOTES: Record<string, string> = {
  kimi_code: "Requires manual OpenClaw setup via SSH. Use Moonshot for automatic setup.",
};

const PROVIDERS = ["moonshot", "openai", "anthropic", "nvidia", "kimi_code", "custom"];

export default function AIModelsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AIModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  // Form state
  const [formProvider, setFormProvider] = useState("openai");
  const [formModelName, setFormModelName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("https://api.openai.com/v1");
  const [formApiKey, setFormApiKey] = useState("");
  const [formIsDefault, setFormIsDefault] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.aiModels();
      setModels(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchModels();
  }, [isAdmin, fetchModels]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You do not have permission to manage AI models. Please contact an administrator if you believe this is an error.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const openCreate = () => {
    setEditingModel(null);
    setFormProvider("openai");
    setFormModelName("");
    setFormDisplayName("");
    setFormBaseUrl(PROVIDER_BASE_URLS.openai);
    setFormApiKey("");
    setFormIsDefault(false);
    setDialogOpen(true);
  };

  const openEdit = (model: AIModel) => {
    setEditingModel(model);
    setFormProvider(model.provider);
    setFormModelName(model.model_name);
    setFormDisplayName(model.display_name);
    setFormBaseUrl(model.base_url);
    setFormApiKey("");
    setFormIsDefault(model.is_default);
    setDialogOpen(true);
  };

  const handleProviderChange = (provider: string) => {
    setFormProvider(provider);
    setFormBaseUrl(PROVIDER_BASE_URLS[provider] || "");
    setFormModelName("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: AIModelCreate = {
        provider: formProvider,
        model_name: formModelName,
        display_name: formDisplayName,
        base_url: formBaseUrl,
        is_default: formIsDefault,
      };
      if (formApiKey) data.api_key = formApiKey;

      if (editingModel) {
        await api.updateAIModel(editingModel.id, data);
        toast.success("Model updated");
      } else {
        await api.createAIModel(data);
        toast.success("Model created");
      }
      setDialogOpen(false);
      fetchModels();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteAIModel(deleteConfirm.id);
      toast.success("Model deleted");
      setDeleteConfirm(null);
      fetchModels();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete model");
    }
  };

  const handleTest = async (model: AIModel) => {
    setTesting(model.id);
    try {
      const result = await api.testAIModel(model.id);
      if (result.success) {
        toast.success(result.message || "Connection successful");
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(null);
    }
  };

  const handleSetDefault = async (model: AIModel) => {
    try {
      await api.setDefaultAIModel(model.id);
      toast.success(`${model.display_name} set as default`);
      fetchModels();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to set default");
    }
  };

  const suggestions = PROVIDER_SUGGESTIONS[formProvider] || [];

  return (
    <div className="animate-in-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Models</h1>
          <p className="text-muted-foreground">
            {models.length} model{models.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchModels} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Model
          </Button>
        </div>
      </div>

      {loading && models.length === 0 ? (
        <Card className="p-8">
          <div className="flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Loading models...
          </div>
        </Card>
      ) : models.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No AI models configured.</p>
          <p className="text-sm mt-1">Add one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <Card
              key={model.id}
              className={`transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden border-t-2 ${
                model.is_default ? "border-t-blue-500" : model.is_active ? "border-t-green-500" : "border-t-gray-300 dark:border-t-gray-600"
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
                      model.is_active ? "bg-green-500" : "bg-gray-400"
                    }`} />
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        PROVIDER_COLORS[model.provider] || PROVIDER_COLORS.custom
                      }`}
                    >
                      {PROVIDER_LABELS[model.provider] || model.provider}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {model.is_default && (
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                        Default
                      </Badge>
                    )}
                    {model.has_api_key && (
                      <KeyRound className="h-3.5 w-3.5 text-green-500" />
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <h3 className="font-semibold text-base">{model.display_name}</h3>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">{model.model_name}</p>
                </div>

                <p className="text-[10px] font-mono text-muted-foreground/60 mt-2 truncate">
                  {model.base_url}
                </p>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEdit(model)}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleTest(model)}
                    disabled={testing === model.id}
                  >
                    {testing === model.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <FlaskConical className="h-3 w-3 mr-1" />
                    )}
                    Test
                  </Button>
                  {!model.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleSetDefault(model)}
                    >
                      <Star className="h-3 w-3 mr-1" /> Default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive ml-auto"
                    onClick={() => setDeleteConfirm(model)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingModel ? "Edit AI Model" : "Add AI Model"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <Select value={formProvider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {PROVIDER_NOTES[formProvider] && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  {PROVIDER_NOTES[formProvider]}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Model Name</label>
              <Input
                value={formModelName}
                onChange={(e) => setFormModelName(e.target.value)}
                placeholder="e.g. gpt-4o"
              />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setFormModelName(s);
                        if (!formDisplayName) setFormDisplayName(s);
                      }}
                      className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="e.g. GPT-4o"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Base URL</label>
              <Input
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                API Key{editingModel ? " (leave blank to keep current)" : ""}
              </label>
              <Input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={editingModel ? "Leave blank to keep current" : "sk-..."}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-default"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="is-default" className="text-sm font-medium">
                Set as default model
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formModelName || !formDisplayName || !formBaseUrl}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingModel ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete AI Model</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteConfirm?.display_name}</strong>?
            This will remove the model configuration and any agents using it will need to be reassigned.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
