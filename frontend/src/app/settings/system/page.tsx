"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { api, type VersionInfo, type UpdateHistoryItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Monitor,
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    case "rolled_back":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Rolled Back
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "in_progress":
      return (
        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function SystemSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [history, setHistory] = useState<UpdateHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const loadVersion = useCallback(async () => {
    try {
      const data = await api.getVersion();
      setVersionInfo(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getUpdateHistory();
      setHistory(data.updates);
    } catch {
      // ignore — non-admin or no history
    }
  }, []);

  useEffect(() => {
    loadVersion();
    loadHistory();
  }, [loadVersion, loadHistory]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const data = await api.checkForUpdates();
      setVersionInfo(data);
      toast.success(data.update_available ? `Update available: v${data.latest_version}` : "Already up to date");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to check for updates");
    } finally {
      setChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (!password) return;
    setUpdating(true);
    setUpdateMessage("Initiating update...");

    try {
      const resp = await api.triggerUpdate(password);
      setShowUpdateDialog(false);
      setPassword("");
      setUpdateMessage(resp.message);

      // Start polling
      pollStartRef.current = Date.now();
      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - pollStartRef.current;

        try {
          const data = await api.getVersion();
          setVersionInfo(data);

          // Check if update completed
          const lastStatus = data.last_update_status;
          if (lastStatus?.status === "success") {
            setUpdateMessage(`Update successful! Now running v${data.current_version}`);
            clearInterval(pollRef.current!);
            pollRef.current = null;
            loadHistory();
          } else if (lastStatus?.status === "rolled_back") {
            setUpdateMessage(
              `Update failed and was automatically rolled back to v${data.current_version}. ${lastStatus.message || "Check the changelog for compatibility notes."}`
            );
            clearInterval(pollRef.current!);
            pollRef.current = null;
            loadHistory();
          } else if (lastStatus?.status === "failed") {
            setUpdateMessage(`Update failed: ${lastStatus.error || lastStatus.message || "Unknown error"}`);
            clearInterval(pollRef.current!);
            pollRef.current = null;
            loadHistory();
          }
        } catch {
          // Backend might be restarting
          if (elapsed > 5 * 60 * 1000) {
            setUpdateMessage(
              "Update is taking longer than expected. The system may be restarting. Please refresh in a few minutes."
            );
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        }
      }, 15000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "detail" in err ? String((err as Record<string, unknown>).detail) : "Failed to start update";
      toast.error(msg);
      setUpdateMessage(null);
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="animate-in-page p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">System</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Only administrators can manage system updates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-in-page p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">System</h1>

      {/* Version Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            Version
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versionInfo ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Current Version</div>
                  <div className="text-lg font-mono font-semibold">v{versionInfo.current_version}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Latest Version</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-semibold">v{versionInfo.latest_version}</span>
                    {versionInfo.update_available ? (
                      <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                        Update Available
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        Up to Date
                      </Badge>
                    )}
                  </div>
                  {versionInfo.release_date && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Released {versionInfo.release_date}
                    </div>
                  )}
                </div>
              </div>

              {/* Update message */}
              {updateMessage && (
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    {pollRef.current ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    )}
                    <p className="text-sm">{updateMessage}</p>
                  </div>
                </div>
              )}

              {/* Last update status */}
              {versionInfo.last_update_status && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Last update:</span>
                  <StatusBadge status={versionInfo.last_update_status.status} />
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(versionInfo.last_update_status.timestamp)}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Check for Updates
                </Button>
                {versionInfo.update_available && (
                  <Button
                    size="sm"
                    onClick={() => setShowUpdateDialog(true)}
                    disabled={!!pollRef.current}
                  >
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Update to v{versionInfo.latest_version}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load version info.</p>
          )}
        </CardContent>
      </Card>

      {/* Update History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Update History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={item.status} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {item.previous_version && `v${item.previous_version} → `}v{item.version}
                      </div>
                      {item.message && (
                        <div className="text-xs text-muted-foreground truncate max-w-md">
                          {item.message}
                        </div>
                      )}
                      {item.error && (
                        <div className="text-xs text-destructive truncate max-w-md">
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 ml-2">
                    {fmtDate(item.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Confirmation Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update to v{versionInfo?.latest_version}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  The system will be unavailable for ~2 minutes during the update.
                  A rollback will happen automatically if the update fails.
                </p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Confirm your password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                placeholder="Enter your password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updating || !password}>
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                )}
                Update Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
