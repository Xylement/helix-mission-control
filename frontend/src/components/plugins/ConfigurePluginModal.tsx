"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api, type InstalledPlugin } from "@/lib/api";

export function ConfigurePluginModal({
  plugin,
  open,
  onOpenChange,
  onSaved,
}: {
  plugin: InstalledPlugin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const def of plugin.setting_definitions) {
      const existing =
        def.type === "password"
          ? plugin.masked_credentials?.[def.key] || ""
          : String((plugin.settings as Record<string, unknown>)?.[def.key] ?? def.default ?? "");
      initial[def.key] = existing;
    }
    return initial;
  });
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async (andTest = false) => {
    setSaving(true);
    try {
      const credentials: Record<string, unknown> = {};
      const settings: Record<string, unknown> = {};

      for (const def of plugin.setting_definitions) {
        const val = values[def.key];
        if (!val && def.required) {
          toast.error(`${def.label} is required`);
          setSaving(false);
          return;
        }
        if (def.type === "password") {
          // Skip if it looks like masked value (contains ****)
          if (val && !val.includes("****")) {
            credentials[def.key] = val;
          }
        } else if (def.type === "boolean") {
          settings[def.key] = val === "true";
        } else if (def.type === "integer") {
          settings[def.key] = parseInt(val) || 0;
        } else {
          settings[def.key] = val;
        }
      }

      await api.updatePlugin(plugin.id, {
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        settings: Object.keys(settings).length > 0 ? settings : undefined,
      });
      toast.success("Plugin configured");

      if (andTest) {
        setTesting(true);
        try {
          const result = await api.testPluginConnection(plugin.id);
          if (result.success) {
            toast.success(`Connection successful (${result.duration_ms}ms)`);
          } else {
            toast.error(result.message || "Connection test failed");
          }
        } catch {
          toast.error("Connection test failed");
        } finally {
          setTesting(false);
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{plugin.emoji || "🔌"}</span>
            Configure {plugin.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {plugin.setting_definitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This plugin has no configuration settings.
            </p>
          ) : (
            plugin.setting_definitions.map((def) => (
              <div key={def.key}>
                <label className="text-sm font-medium mb-1.5 block">
                  {def.label}
                  {def.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {def.description && (
                  <p className="text-xs text-muted-foreground mb-1.5">{def.description}</p>
                )}
                {def.type === "boolean" ? (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={values[def.key] || "false"}
                    onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : (
                  <div className="relative">
                    <Input
                      type={
                        def.type === "password" && !showPassword[def.key]
                          ? "password"
                          : def.type === "integer"
                          ? "number"
                          : "text"
                      }
                      value={values[def.key] || ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [def.key]: e.target.value }))
                      }
                      placeholder={def.default || `Enter ${def.label.toLowerCase()}`}
                    />
                    {def.type === "password" && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setShowPassword((p) => ({
                            ...p,
                            [def.key]: !p[def.key],
                          }))
                        }
                      >
                        {showPassword[def.key] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleSave(false)} disabled={saving || testing}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSave(true)}
            disabled={saving || testing}
          >
            {testing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save & Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
