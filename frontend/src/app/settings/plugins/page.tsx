"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  api,
  type InstalledPlugin,
  type PluginCapability,
  type PluginExecutionResult,
} from "@/lib/api";
import { useBillingPlan, isFeatureAvailable } from "@/lib/billing";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Plus,
  Settings2,
  Plug,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  XCircle,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { ConfigurePluginModal } from "@/components/plugins/ConfigurePluginModal";
import { ExecuteCapabilityModal } from "@/components/plugins/ExecuteCapabilityModal";
import { FeatureGateModal } from "@/components/billing/FeatureGateModal";

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PluginsSettingsPage() {
  const router = useRouter();
  useAuth();
  const { plan } = useBillingPlan();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [configPlugin, setConfigPlugin] = useState<InstalledPlugin | null>(null);
  const [execCap, setExecCap] = useState<{ pluginId: number; cap: PluginCapability } | null>(null);
  const [executions, setExecutions] = useState<Record<number, PluginExecutionResult[]>>({});
  const [testing, setTesting] = useState<number | null>(null);
  const [uninstalling, setUninstalling] = useState<number | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const hasPluginFeature =
    !plan || plan.plan === "unlicensed" || isFeatureAvailable("plugins", plan.plan);

  const loadPlugins = useCallback(async () => {
    try {
      const data = await api.plugins();
      setPlugins(data);
    } catch {
      toast.error("Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const loadExecutions = async (pluginId: number) => {
    try {
      const data = await api.pluginExecutions(pluginId, 10);
      setExecutions((prev) => ({ ...prev, [pluginId]: data }));
    } catch {
      /* ignore */
    }
  };

  const handleToggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadExecutions(id);
    }
  };

  const handleTest = async (pluginId: number) => {
    setTesting(pluginId);
    try {
      const result = await api.testPluginConnection(pluginId);
      if (result.success) {
        toast.success(`Connection successful (${result.duration_ms}ms)`);
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTesting(null);
    }
  };

  const handleUninstall = async (pluginId: number) => {
    if (!confirm("Uninstall this plugin? Agent assignments will be removed.")) return;
    setUninstalling(pluginId);
    try {
      await api.uninstallPlugin(pluginId);
      toast.success("Plugin uninstalled");
      loadPlugins();
    } catch {
      toast.error("Failed to uninstall");
    } finally {
      setUninstalling(null);
    }
  };

  if (!hasPluginFeature) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Plugins</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Plugins require Pro plan</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Connect agents to external APIs and services with plugins.
            </p>
            <Button onClick={() => setShowUpgrade(true)}>Upgrade to Pro</Button>
            <FeatureGateModal
              open={showUpgrade}
              onClose={() => setShowUpgrade(false)}
              feature="plugins"
              requiredPlan="pro"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Plugins</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect agents to external APIs and services
          </p>
        </div>
        <Button onClick={() => router.push("/marketplace?type=plugin")}>
          <Plus className="h-4 w-4 mr-1.5" /> Browse Plugins
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No plugins installed</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Browse the marketplace to find plugins for your agents.
            </p>
            <Button
              variant="outline"
              onClick={() => router.push("/marketplace?type=plugin")}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Browse Plugins
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => {
            const isExpanded = expandedId === plugin.id;
            const pluginExecs = executions[plugin.id] || [];

            return (
              <Card key={plugin.id}>
                <CardContent className="p-4">
                  {/* Plugin header */}
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
                      {plugin.emoji || "🔌"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm">{plugin.name}</span>
                        <Badge
                          variant={plugin.is_configured ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {plugin.is_configured ? (
                            <>
                              <Wifi className="h-3 w-3 mr-1" /> Active
                            </>
                          ) : (
                            <>
                              <WifiOff className="h-3 w-3 mr-1" /> Not Configured
                            </>
                          )}
                        </Badge>
                      </div>
                      {plugin.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {plugin.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span>{plugin.capabilities.length} capabilities</span>
                        <span className="flex items-center gap-1">
                          <Bot className="h-3 w-3" /> {plugin.connected_agent_count} agents
                        </span>
                        <span>Last used: {fmtDate(plugin.last_used_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigPlugin(plugin)}
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" /> Configure
                      </Button>
                      {plugin.is_configured && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(plugin.id)}
                          disabled={testing === plugin.id}
                        >
                          {testing === plugin.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wifi className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleUninstall(plugin.id)}
                        disabled={uninstalling === plugin.id}
                      >
                        {uninstalling === plugin.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expandable section */}
                  <Collapsible open={isExpanded} onOpenChange={() => handleToggleExpand(plugin.id)}>
                    <CollapsibleTrigger className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {isExpanded ? "Hide details" : "Show capabilities & history"}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-4">
                      {/* Capabilities */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Capabilities
                        </h4>
                        {plugin.capabilities.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No capabilities</p>
                        ) : (
                          <div className="space-y-1.5">
                            {plugin.capabilities.map((cap) => (
                              <div
                                key={cap.id}
                                className="flex items-center justify-between rounded-lg border p-2.5"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{cap.name}</span>
                                    {cap.method && (
                                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                        {cap.method}
                                      </span>
                                    )}
                                  </div>
                                  {cap.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {cap.description}
                                    </p>
                                  )}
                                </div>
                                {plugin.is_configured && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setExecCap({ pluginId: plugin.id, cap })
                                    }
                                  >
                                    <Play className="h-3.5 w-3.5 mr-1" /> Run
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recent Executions */}
                      {pluginExecs.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Recent Executions
                          </h4>
                          <div className="space-y-1">
                            {pluginExecs.map((exec) => (
                              <div
                                key={exec.id}
                                className="flex items-center gap-3 text-xs py-1.5"
                              >
                                {exec.status === "success" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                ) : exec.status === "timeout" ? (
                                  <Clock className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                )}
                                <span className="font-medium">
                                  {exec.capability_name || exec.capability_id}
                                </span>
                                <span className="text-muted-foreground">
                                  {exec.duration_ms != null ? `${exec.duration_ms}ms` : ""}
                                </span>
                                <span className="text-muted-foreground ml-auto">
                                  {fmtDate(exec.executed_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Configure Modal */}
      {configPlugin && (
        <ConfigurePluginModal
          plugin={configPlugin}
          open={!!configPlugin}
          onOpenChange={(open) => {
            if (!open) setConfigPlugin(null);
          }}
          onSaved={loadPlugins}
        />
      )}

      {/* Execute Modal */}
      {execCap && (
        <ExecuteCapabilityModal
          pluginId={execCap.pluginId}
          capability={execCap.cap}
          open={!!execCap}
          onOpenChange={(open) => {
            if (!open) setExecCap(null);
          }}
        />
      )}
    </div>
  );
}
