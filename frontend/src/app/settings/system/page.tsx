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
  Ban,
  ChevronDown,
  ChevronRight,
  Coins,
  CalendarClock,
  Target,
  ScanSearch,
  Users,
  RotateCw,
  Paintbrush,
  Globe,
  Shuffle,
  Wrench,
  Plug,
  Shield,
  Settings,
  Camera,
  BookOpen,
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

const STAGE_LABELS: Record<string, { step: number; label: string }> = {
  pulling_code: { step: 1, label: "Pulling latest code..." },
  building: { step: 2, label: "Building containers..." },
  starting: { step: 3, label: "Starting services..." },
  rolling_back: { step: 0, label: "Rolling back..." },
};

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
    case "cancelled":
      return (
        <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">
          <Ban className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

const CHANGELOG_131_ITEMS = [
  { icon: Globe, label: "Google Gemini", desc: "Native provider with Gemini 2.5 Pro, Flash, and Flash Lite models. Free API keys from Google AI Studio." },
  { icon: Shuffle, label: "OpenRouter", desc: "Access 300+ models from all major providers through one API key." },
  { icon: Wrench, label: "License Management", desc: "Admin dashboard: extend trials, edit expiry, change status, delete licenses, event history." },
  { icon: Plug, label: "API Proxy", desc: "Fresh installs work without Nginx. Docker Desktop installs just work out of the box." },
  { icon: Shield, label: "Install Hardening", desc: "macOS root guard, user-writable logs, pre-created directories." },
  { icon: Settings, label: "Update Daemon", desc: "systemd service auto-created on Linux installs." },
  { icon: Camera, label: "Landing Page", desc: "Real product screenshots, tabbed demo, feature showcase with v1.3.0 highlights." },
  { icon: BookOpen, label: "Knowledge Base", desc: "14 feature docs pages with screenshots at docs.helixnode.tech/features/." },
];

const CHANGELOG_130_ITEMS = [
  { icon: Coins, label: "Token Budgets", desc: "Per-agent monthly USD spending limits with auto-pause. Cost dashboard at /costs." },
  { icon: CalendarClock, label: "Scheduled Tasks", desc: "Cron-like recurring task schedules. Overview at /schedules." },
  { icon: Target, label: "Goal Hierarchy", desc: "Organization mission, objectives, key results linked to tasks. /goals page." },
  { icon: ScanSearch, label: "Execution Tracing", desc: "View every LLM reasoning step and tool call on completed tasks." },
  { icon: Users, label: "Agent Delegation", desc: "Agents can delegate sub-tasks to specialists. Human-approved." },
  { icon: RotateCw, label: "Update Daemon", desc: "Build timeout, progress stages, cancel button." },
  { icon: Paintbrush, label: "White Label Reset", desc: "Reset branding to defaults with one click." },
];

function ChangelogSection({ title, items, defaultOpen }: { title: string; items: typeof CHANGELOG_131_ITEMS; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpCircle className="h-4 w-4" />
            {title}
            {open ? (
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0">
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <item.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-muted-foreground"> — {item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

export default function SystemSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [history, setHistory] = useState<UpdateHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [cancelPassword, setCancelPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateTakingLong, setUpdateTakingLong] = useState(false);
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

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setUpdateTakingLong(false);
  };

  const handleUpdate = async () => {
    if (!password) return;
    setUpdating(true);
    setUpdateMessage("Initiating update...");
    setUpdateTakingLong(false);

    try {
      const resp = await api.triggerUpdate(password);
      setShowUpdateDialog(false);
      setPassword("");
      setUpdateMessage(resp.message);

      // Start polling
      pollStartRef.current = Date.now();
      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - pollStartRef.current;

        // Show warning after 5 minutes
        if (elapsed > 5 * 60 * 1000) {
          setUpdateTakingLong(true);
        }

        try {
          const data = await api.getVersion();
          setVersionInfo(data);

          const lastStatus = data.last_update_status;
          if (lastStatus?.status === "success") {
            setUpdateMessage(`Update successful! Now running v${data.current_version}`);
            stopPolling();
            loadHistory();
          } else if (lastStatus?.status === "rolled_back") {
            setUpdateMessage(
              `Update failed and was automatically rolled back to v${data.current_version}. ${lastStatus.message || "Check the changelog for compatibility notes."}`
            );
            stopPolling();
            loadHistory();
          } else if (lastStatus?.status === "failed") {
            setUpdateMessage(`Update failed: ${lastStatus.error || lastStatus.message || "Unknown error"}`);
            stopPolling();
            loadHistory();
          } else if (lastStatus?.status === "cancelled") {
            setUpdateMessage("Update was cancelled.");
            stopPolling();
            loadHistory();
          } else if (lastStatus?.status === "in_progress" && lastStatus.message) {
            const stageInfo = lastStatus.stage ? STAGE_LABELS[lastStatus.stage] : null;
            if (stageInfo) {
              setUpdateMessage(`Step ${stageInfo.step}/3: ${stageInfo.label}`);
            } else {
              setUpdateMessage(lastStatus.message);
            }
          }
        } catch {
          // Backend might be restarting
          if (elapsed > 5 * 60 * 1000) {
            setUpdateMessage(
              "Update is taking longer than expected. The system may be restarting. Please refresh in a few minutes."
            );
            stopPolling();
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

  const handleCancel = async () => {
    if (!cancelPassword) return;
    setCancelling(true);
    try {
      await api.cancelUpdate(cancelPassword);
      setShowCancelDialog(false);
      setCancelPassword("");
      toast.success("Cancel signal sent to update daemon");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel update";
      toast.error(msg);
    } finally {
      setCancelling(false);
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

  const isPolling = !!pollRef.current;

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

              {/* Update progress message */}
              {updateMessage && (
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    {isPolling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    )}
                    <p className="text-sm">{updateMessage}</p>
                  </div>
                </div>
              )}

              {/* Timeout warning */}
              {updateTakingLong && isPolling && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Update is taking longer than expected. You can cancel and try again.
                    </p>
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
                    disabled={isPolling}
                  >
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Update to v{versionInfo.latest_version}
                  </Button>
                )}
                {isPolling && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel Update
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load version info.</p>
          )}
        </CardContent>
      </Card>

      {/* What's New */}
      <ChangelogSection title="What's New in v1.3.1" items={CHANGELOG_131_ITEMS} defaultOpen={false} />
      <ChangelogSection title="What's New in v1.3.0" items={CHANGELOG_130_ITEMS} defaultOpen={false} />

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
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
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

      {/* Cancel Update Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  This will attempt to cancel the in-progress update. The system may be left in a partially updated state.
                </p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Confirm your password
              </label>
              <input
                type="password"
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCancel()}
                placeholder="Enter your password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelling || !cancelPassword}
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Cancel Update
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
