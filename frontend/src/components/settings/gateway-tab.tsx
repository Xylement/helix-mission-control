"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

export function GatewayTab() {
  const [status, setStatus] = useState<{ connected: boolean; pending_tasks: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.gatewayStatus();
      setStatus(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load gateway status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Gateway Connection</h3>
          <Badge
            variant="outline"
            className={
              status?.connected
                ? "bg-green-500/10 text-green-600 border-green-500/30"
                : "bg-red-500/10 text-red-600 border-red-500/30"
            }
          >
            {status?.connected ? (
              <Wifi className="h-3 w-3 mr-1" />
            ) : (
              <WifiOff className="h-3 w-3 mr-1" />
            )}
            {status?.connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span>{status?.connected ? "Online" : "Offline"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending Tasks</span>
            <span>{status?.pending_tasks ?? 0}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Gateway configuration is managed via environment variables and Docker settings.
          Restart the container to apply changes.
        </p>

        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </Card>
    </div>
  );
}
