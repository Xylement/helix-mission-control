"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  api,
  type ModelConfig,
  type ProviderInfo,
  type ModelTestResult,
  type ModelUsageResponse,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ChevronDown,
  KeyRound,
  Zap,
  BarChart3,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export default function ModelConfigPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [usage, setUsage] = useState<ModelUsageResponse | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "usage">("config");

  // Form state
  const [provider, setProvider] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contextWindow, setContextWindow] = useState<number | "">("");
  const [maxTokens, setMaxTokens] = useState<number | "">("");
  const [hasExistingKey, setHasExistingKey] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [configData, providerData] = await Promise.all([
        api.getModelConfig(),
        api.getModelProviders(),
      ]);
      setConfig(configData);
      setProviders(providerData);

      // Initialize form
      setProvider(configData.provider || "moonshot");
      setModelName(configData.model_name || "");
      setDisplayName(configData.model_display_name || "");
      setBaseUrl(configData.base_url || "");
      setContextWindow(configData.context_window || "");
      setMaxTokens(configData.max_tokens || "");
      setHasExistingKey(configData.has_api_key);
      setApiKey("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const data = await api.getModelUsage(30);
      setUsage(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load usage");
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadConfig();
  }, [isAdmin, loadConfig]);

  useEffect(() => {
    if (isAdmin && activeTab === "usage") loadUsage();
  }, [isAdmin, activeTab, loadUsage]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Only administrators can configure model settings.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const currentProvider = providers[provider];

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const p = providers[newProvider];
    if (p) {
      setBaseUrl(p.base_url);
      setModelName(p.default_model);
      const defaultModel = p.models.find((m) => m.id === p.default_model);
      if (defaultModel) {
        setDisplayName(defaultModel.name);
        setContextWindow(defaultModel.context_window);
        setMaxTokens(defaultModel.max_tokens);
      }
    }
    setTestResult(null);
  };

  const handleModelSelect = (modelId: string) => {
    setModelName(modelId);
    const model = currentProvider?.models.find((m) => m.id === modelId);
    if (model) {
      setDisplayName(model.name);
      setContextWindow(model.context_window);
      setMaxTokens(model.max_tokens);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey && !hasExistingKey) {
      toast.error("Enter an API key to test");
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await api.testModelConnection({
        provider,
        api_key: apiKey || "EXISTING_KEY_PLACEHOLDER",
        base_url: baseUrl || undefined,
      });
      setTestResult(result);
      if (result.status === "success") {
        toast.success("Connection successful");
      } else {
        toast.error(result.message);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!provider || !modelName) {
      toast.error("Provider and model name are required");
      return;
    }
    if (!apiKey && !hasExistingKey) {
      toast.error("API key is required");
      return;
    }
    setSaving(true);
    try {
      const data: import("@/lib/api").ModelConfigUpdate = {
        provider,
        model_name: modelName,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
        display_name: displayName || undefined,
        context_window: contextWindow ? Number(contextWindow) : undefined,
        max_tokens: maxTokens ? Number(maxTokens) : undefined,
      };

      const updated = await api.updateModelConfig(data);
      setConfig(updated);
      setHasExistingKey(updated.has_api_key);
      setApiKey("");
      toast.success("Model configuration saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-in-page space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Model Configuration</h1>
        <p className="text-muted-foreground">
          Configure your AI model provider and API key (BYOK)
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "config"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("config")}
        >
          <Settings2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Configuration
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "usage"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("usage")}
        >
          <BarChart3 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Usage
        </button>
      </div>

      {activeTab === "config" ? (
        <div className="space-y-6">
          {/* Current Status */}
          {config?.has_api_key && (
            <Card className="p-4 border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Active: {config.provider ? providers[config.provider]?.name || config.provider : "Unknown"} — {config.model_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    API Key: {config.api_key_masked}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Provider Selection */}
          <Card className="p-5 space-y-5">
            <div>
              <label className="text-sm font-medium mb-2 block">Provider</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(providers).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleProviderChange(key)}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-all ${
                      provider === key
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <span className="block">{info.name}</span>
                    {key !== "custom" && (
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {info.models.length} model{info.models.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Model</label>
              {currentProvider?.models.length ? (
                <div className="space-y-2">
                  <Select value={modelName} onValueChange={handleModelSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProvider.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span>{m.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {(m.context_window / 1000).toFixed(0)}K ctx
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Or type a custom model name below
                  </p>
                  <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Custom model name"
                    className="font-mono text-sm"
                  />
                </div>
              ) : (
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Model name (e.g., gpt-4o)"
                  className="font-mono text-sm"
                />
              )}
            </div>

            {/* API Key */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                <KeyRound className="h-4 w-4 inline mr-1 -mt-0.5" />
                API Key
                {hasExistingKey && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Key configured
                  </Badge>
                )}
              </label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasExistingKey
                      ? `Current: ${config?.api_key_masked || "****"} — leave blank to keep`
                      : `${currentProvider?.key_prefix || "sk-"}your-key-here`
                  }
                  className="pr-20 font-mono text-sm"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Test Connection */}
            <div>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection || (!apiKey && !hasExistingKey)}
                className="w-full sm:w-auto"
              >
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-lg text-sm ${
                    testResult.status === "success"
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    {testResult.message}
                  </div>
                  {testResult.models && testResult.models.length > 0 && (
                    <div className="mt-2 pl-6">
                      <p className="text-xs font-medium mb-1">Available models:</p>
                      <div className="flex flex-wrap gap-1">
                        {testResult.models.slice(0, 10).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleModelSelect(m.id)}
                            className="text-xs px-2 py-0.5 rounded bg-background border border-border hover:border-primary/50 transition-colors"
                          >
                            {m.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                  Advanced Settings
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Display Name</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Friendly name (e.g., GPT-4o)"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Base URL Override</label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={currentProvider?.base_url || "https://api.example.com/v1"}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to use provider default
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Context Window</label>
                    <Input
                      type="number"
                      value={contextWindow}
                      onChange={(e) =>
                        setContextWindow(e.target.value ? Number(e.target.value) : "")
                      }
                      placeholder="256000"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Max Output Tokens</label>
                    <Input
                      type="number"
                      value={maxTokens}
                      onChange={(e) =>
                        setMaxTokens(e.target.value ? Number(e.target.value) : "")
                      }
                      placeholder="8192"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={saving || !provider || !modelName || (!apiKey && !hasExistingKey)}
                className="min-w-[120px]"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Configuration
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        /* Usage Tab */
        <div className="space-y-6">
          {loadingUsage ? (
            <Card className="p-8">
              <div className="flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Loading usage data...
              </div>
            </Card>
          ) : usage ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Total Tokens</p>
                  <p className="text-2xl font-bold mt-1">
                    {usage.total.total_tokens.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-2xl font-bold mt-1">
                    {usage.total.requests.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Input Tokens</p>
                  <p className="text-2xl font-bold mt-1">
                    {usage.total.input_tokens.toLocaleString()}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Output Tokens</p>
                  <p className="text-2xl font-bold mt-1">
                    {usage.total.output_tokens.toLocaleString()}
                  </p>
                </Card>
              </div>

              {/* Per-Agent Breakdown */}
              {usage.per_agent.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-4">Usage by Agent</h3>
                  <div className="space-y-3">
                    {usage.per_agent.map((agent, idx) => {
                      const pct =
                        usage.total.total_tokens > 0
                          ? (agent.tokens / usage.total.total_tokens) * 100
                          : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{agent.agent_name}</span>
                            <span className="text-muted-foreground">
                              {agent.tokens.toLocaleString()} tokens ({agent.requests} req)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ) : (
                <Card className="p-8">
                  <div className="text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No usage data yet.</p>
                    <p className="text-sm mt-1">
                      Token usage will appear here after agents complete tasks.
                    </p>
                  </div>
                </Card>
              )}

              {/* Daily Breakdown */}
              {usage.daily.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold mb-4">Daily Usage (Last 30 Days)</h3>
                  <div className="space-y-1">
                    {usage.daily.slice(-14).map((day, idx) => {
                      const maxTokens = Math.max(...usage.daily.map((d) => d.tokens), 1);
                      const pct = (day.tokens / maxTokens) * 100;
                      return (
                        <div key={idx} className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground w-20 text-right">
                            {new Date(day.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-sm"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground w-20">
                            {day.tokens.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="p-8 text-center text-muted-foreground">
              No usage data available.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
