"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api, type OnboardingTemplates } from "@/lib/api";
import { Loader2, Check, Plus, X, SkipForward, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

interface DepartmentsStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function DepartmentsStep({ onNext, onSkip }: DepartmentsStepProps) {
  const [templates, setTemplates] = useState<OnboardingTemplates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customDepts, setCustomDepts] = useState<Array<{ name: string; boards: string }>>([]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.onboardingTemplates();
      setTemplates(data);
      // Pre-select all
      setSelected(new Set(data.departments.map((d) => d.key)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addCustom = () => {
    setCustomDepts((prev) => [...prev, { name: "", boards: "" }]);
  };

  const removeCustom = (idx: number) => {
    setCustomDepts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (selected.size === 0 && customDepts.length === 0) {
      toast.error("Select at least one department or add a custom one");
      return;
    }

    setSaving(true);
    try {
      const custom = customDepts
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          boards: d.boards
            .split(",")
            .map((b) => b.trim())
            .filter(Boolean),
        }));

      await api.onboardingStep4({
        templates: Array.from(selected),
        custom_departments: custom.length > 0 ? custom : undefined,
      });

      toast.success("Departments created!");
      onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create departments");
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
          <LayoutGrid className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Set Up Departments</h2>
        <p className="text-muted-foreground text-sm">
          Choose department templates or create custom ones. Each comes with pre-configured boards.
        </p>
      </div>

      <div className="grid gap-3">
        {templates?.departments.map((dept) => (
          <Card
            key={dept.key}
            className={`p-4 cursor-pointer transition-all ${
              selected.has(dept.key)
                ? "border-primary ring-1 ring-primary/20"
                : "hover:border-primary/50"
            }`}
            onClick={() => toggleSelect(dept.key)}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                  selected.has(dept.key) ? "bg-primary/10" : "bg-muted"
                }`}
              >
                {selected.has(dept.key) ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  dept.emoji
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{dept.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {dept.boards} board{dept.boards !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{dept.description}</p>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(expanded === dept.key ? null : dept.key);
                }}
              >
                {expanded === dept.key ? "Hide" : "Preview"}
              </button>
            </div>
            {expanded === dept.key && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Boards:</p>
                <div className="flex flex-wrap gap-1">
                  {/* Show board names from template data */}
                  {Array.from({ length: dept.boards }).map((_, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      Board {i + 1}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Custom departments */}
      {customDepts.map((custom, idx) => (
        <Card key={idx} className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Department name"
              value={custom.name}
              onChange={(e) => {
                const next = [...customDepts];
                next[idx].name = e.target.value;
                setCustomDepts(next);
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
          <Input
            placeholder="Board names (comma-separated)"
            value={custom.boards}
            onChange={(e) => {
              const next = [...customDepts];
              next[idx].boards = e.target.value;
              setCustomDepts(next);
            }}
          />
        </Card>
      ))}

      <Button variant="outline" onClick={addCustom} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Add Custom Department
      </Button>

      <Button className="w-full" onClick={handleSubmit} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Create Departments & Continue
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
