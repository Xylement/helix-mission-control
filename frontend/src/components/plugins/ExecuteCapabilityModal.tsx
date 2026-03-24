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
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api, type PluginCapability, type PluginExecutionResult } from "@/lib/api";

export function ExecuteCapabilityModal({
  pluginId,
  capability,
  open,
  onOpenChange,
}: {
  pluginId: number;
  capability: PluginCapability;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const params = capability.parameters || [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of params) {
      initial[p.key] = p.default || "";
    }
    return initial;
  });
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<PluginExecutionResult | null>(null);

  const handleExecute = async () => {
    // Validate required
    for (const p of params) {
      if (p.required && !values[p.key]) {
        return;
      }
    }

    setExecuting(true);
    setResult(null);
    try {
      const parameters: Record<string, unknown> = {};
      for (const p of params) {
        if (values[p.key]) {
          parameters[p.key] =
            p.type === "integer" ? parseInt(values[p.key]) : values[p.key];
        }
      }
      const res = await api.executePluginCapability(pluginId, {
        capability_id: capability.id,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      });
      setResult(res);
    } catch (err) {
      setResult({
        id: 0,
        plugin_id: pluginId,
        agent_id: null,
        capability_id: capability.id,
        capability_name: capability.name,
        status: "error",
        error_message: err instanceof Error ? err.message : "Execution failed",
        duration_ms: 0,
        executed_at: new Date().toISOString(),
        request_data: null,
        response_summary: null,
      });
    } finally {
      setExecuting(false);
    }
  };

  const statusIcon =
    result?.status === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : result?.status === "timeout" ? (
      <Clock className="h-5 w-5 text-yellow-500" />
    ) : result ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Execute: {capability.name}
            {capability.method && (
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                {capability.method}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Parameters Form */}
        {params.length > 0 && (
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Parameters
            </p>
            {params.map((p) => (
              <div key={p.key}>
                <label className="text-sm font-medium mb-1 block">
                  {p.label || p.key}
                  {p.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {p.description && (
                  <p className="text-xs text-muted-foreground mb-1">{p.description}</p>
                )}
                <Input
                  type={p.type === "integer" ? "number" : "text"}
                  value={values[p.key] || ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [p.key]: e.target.value }))
                  }
                  placeholder={p.default || ""}
                />
              </div>
            ))}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2">
              {statusIcon}
              <span className="font-medium text-sm capitalize">{result.status}</span>
              {result.duration_ms != null && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {result.duration_ms}ms
                </span>
              )}
            </div>
            {result.error_message && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
                {result.error_message}
              </div>
            )}
            {result.response_summary && (
              <pre className="text-xs bg-muted rounded p-3 overflow-x-auto max-h-60">
                {JSON.stringify(result.response_summary, null, 2)}
              </pre>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleExecute} disabled={executing}>
            {executing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
