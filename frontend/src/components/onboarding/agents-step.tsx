"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, type OnboardingTemplates } from "@/lib/api";
import { Loader2, Check, Plus, X, SkipForward, Bot } from "lucide-react";
import { toast } from "sonner";

interface AgentsStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function AgentsStep({ onNext, onSkip }: AgentsStepProps) {
  const [templates, setTemplates] = useState<OnboardingTemplates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customAgents, setCustomAgents] = useState<
    Array<{ name: string; role_title: string; system_prompt: string }>
  >([]);
  const [maxAgents, setMaxAgents] = useState<number>(5);
  const [planName, setPlanName] = useState<string>("trial");

  const loadTemplates = useCallback(async () => {
    try {
      const [data, limit] = await Promise.all([
        api.onboardingTemplates(),
        api.onboardingAgentLimit(),
      ]);
      setTemplates(data);
      setMaxAgents(limit.max_agents);
      setPlanName(limit.plan);
      setSelected(new Set(data.agent_packs.map((p) => p.key)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Count total selected agents
  const selectedAgentCount = (() => {
    let count = customAgents.filter((a) => a.name.trim()).length;
    templates?.agent_packs.forEach((pack) => {
      if (selected.has(pack.key)) count += pack.count;
    });
    return count;
  })();

  const atLimit = selectedAgentCount >= maxAgents;

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Check if adding this pack would exceed the limit
        const pack = templates?.agent_packs.find((p) => p.key === key);
        const packCount = pack?.count || 0;
        const currentWithout = selectedAgentCount - (prev.has(key) ? packCount : 0);
        if (currentWithout + packCount > maxAgents) {
          toast.error(`Agent limit reached (${maxAgents} max for ${planName} plan)`);
          return prev;
        }
        next.add(key);
      }
      return next;
    });
  };

  const addCustom = () => {
    setCustomAgents((prev) => [...prev, { name: "", role_title: "", system_prompt: "" }]);
  };

  const removeCustom = (idx: number) => {
    setCustomAgents((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (selected.size === 0 && customAgents.length === 0) {
      toast.error("Select at least one agent pack or add a custom agent");
      return;
    }

    setSaving(true);
    try {
      const custom = customAgents
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          role_title: a.role_title.trim() || "Agent",
          system_prompt: a.system_prompt.trim(),
        }));

      const result = await api.onboardingStep5({
        agent_packs: Array.from(selected),
        custom_agents: custom.length > 0 ? custom : undefined,
      });

      toast.success(`${result.agents_created?.length || 0} agents created!`);
      onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create agents");
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Add AI Agents</h2>
        <p className="text-muted-foreground text-sm">
          Choose agent packs for each department. Agents handle tasks autonomously.
        </p>
        <div className={`inline-flex items-center gap-1.5 text-sm font-medium mt-1 px-3 py-1 rounded-full ${
          atLimit
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-primary/10 text-primary"
        }`}>
          {selectedAgentCount}/{maxAgents} agents selected
          {atLimit && <span className="text-xs"> — limit reached for {planName} plan</span>}
        </div>
      </div>

      <div className="grid gap-3">
        {templates?.agent_packs.map((pack) => (
          <Card
            key={pack.key}
            className={`p-4 cursor-pointer transition-all ${
              selected.has(pack.key)
                ? "border-primary ring-1 ring-primary/20"
                : "hover:border-primary/50"
            }`}
            onClick={() => toggleSelect(pack.key)}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selected.has(pack.key) ? "bg-primary/10" : "bg-muted"
                }`}
              >
                {selected.has(pack.key) ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Bot className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{pack.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {pack.count} agent{pack.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {pack.agents.join(", ")}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(expanded === pack.key ? null : pack.key);
                }}
              >
                {expanded === pack.key ? "Hide" : "Details"}
              </button>
            </div>
            {expanded === pack.key && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="grid gap-1">
                  {pack.agents.map((name) => (
                    <div key={name} className="text-xs flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Custom agents */}
      {customAgents.map((agent, idx) => (
        <Card key={idx} className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Agent name"
              value={agent.name}
              onChange={(e) => {
                const next = [...customAgents];
                next[idx].name = e.target.value;
                setCustomAgents(next);
              }}
              className="flex-1"
            />
            <Input
              placeholder="Role title"
              value={agent.role_title}
              onChange={(e) => {
                const next = [...customAgents];
                next[idx].role_title = e.target.value;
                setCustomAgents(next);
              }}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeCustom(idx)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            placeholder="System prompt (optional)"
            value={agent.system_prompt}
            onChange={(e) => {
              const next = [...customAgents];
              next[idx].system_prompt = e.target.value;
              setCustomAgents(next);
            }}
            rows={2}
          />
        </Card>
      ))}

      <Button variant="outline" onClick={addCustom} className="w-full" disabled={atLimit}>
        <Plus className="h-4 w-4 mr-2" /> Add Custom Agent
      </Button>

      <Button className="w-full" onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Create Agents & Continue
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
    </div>
  );
}
