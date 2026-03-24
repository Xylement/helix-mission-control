"use client";

import { useState, useEffect, useCallback } from "react";
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
import { api, type ProviderInfo, type ModelTestResult } from "@/lib/api";
import {
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  KeyRound,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

interface AIModelStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function AIModelStep({ onNext, onSkip }: AIModelStepProps) {
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [provider, setProvider] = useState("moonshot");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const loadProviders = useCallback(async () => {
    try {
      const data = await api.getModelProviders();
      setProviders(data);
      const firstProvider = data["moonshot"] || Object.values(data)[0];
      if (firstProvider) {
        setBaseUrl(firstProvider.base_url);
        setModelName(firstProvider.default_model);
      }
    } catch {
      // providers endpoint may need auth; just show manual fields
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const currentProvider = providers[provider];

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const p = providers[newProvider];
    if (p) {
      setBaseUrl(p.base_url);
      setModelName(p.default_model);
    }
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!apiKey) {
      toast.error("Enter an API key to test");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testModelConnection({
        provider,
        api_key: apiKey,
        base_url: baseUrl || undefined,
      });
      setTestResult(result);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      toast.error("API key is required");
      return;
    }
    setSaving(true);
    try {
      await api.onboardingStep3({
        provider,
        model_name: modelName,
        api_key: apiKey,
        base_url: baseUrl || undefined,
      });
      toast.success("AI model configured!");
      onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Configure AI Model</h2>
        <p className="text-muted-foreground text-sm">
          Connect your AI provider so agents can process tasks
        </p>
      </div>

      <Card className="p-6 space-y-5">
        {/* Provider */}
        <div>
          <label className="text-sm font-medium mb-2 block">Provider</label>
          {Object.keys(providers).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(providers).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-all ${
                    provider === key
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {info.name}
                </button>
              ))}
            </div>
          ) : (
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moonshot">Moonshot</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="text-sm font-medium mb-1 block">Model</label>
          {currentProvider?.models.length ? (
            <Select value={modelName} onValueChange={setModelName}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {currentProvider.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. gpt-4o"
              className="font-mono text-sm"
            />
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="text-sm font-medium mb-1 block">API Key</label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="text-sm font-medium mb-1 block">Base URL (optional)</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="font-mono text-sm"
          />
        </div>

        {/* Test */}
        <div>
          <Button variant="outline" onClick={handleTest} disabled={testing || !apiKey} className="w-full sm:w-auto">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
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
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {testResult.message}
              </div>
            </div>
          )}
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saving || !provider || !modelName || !apiKey}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save & Continue
        </Button>
      </Card>

      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <SkipForward className="h-3 w-3" />
          Skip for now
        </button>
      </div>
    </div>
  );
}
