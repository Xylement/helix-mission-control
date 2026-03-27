"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api, type BackupItem, type BackupSettings } from "@/lib/api";
import { useBillingPlan, isFeatureAvailable } from "@/lib/billing";
import { FeatureGateModal } from "@/components/billing/FeatureGateModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  HardDrive,
  Download,
  Trash2,
  Plus,
  Lock,
  Save,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + ":00");
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function BackupsSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { plan } = useBillingPlan();

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<BackupSettings>({
    backup_enabled: false,
    backup_schedule: "daily",
    backup_time: "02:00",
    backup_day: "monday",
    backup_retention_days: 7,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasFeature =
    !plan || plan.plan === "unlicensed" || isFeatureAvailable("backups", plan.plan);

  const loadBackups = useCallback(async () => {
    try {
      const data = await api.getBackups();
      setBackups(data.backups);
      setTotal(data.total);
    } catch {
      // Feature not available — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getBackupSettings();
      setSettings(data);
    } catch {
      // ignore
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFeature && user?.role === "admin") {
      loadBackups();
      loadSettings();
    } else {
      setLoading(false);
      setSettingsLoading(false);
    }
  }, [hasFeature, user, loadBackups, loadSettings]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const backup = await api.createBackup();
      if (backup.status === "completed") {
        toast.success("Backup created successfully");
      } else if (backup.status === "failed") {
        toast.error(`Backup failed: ${backup.error_message || "Unknown error"}`);
      }
      await loadBackups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this backup? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await api.deleteBackup(id);
      toast.success("Backup deleted");
      await loadBackups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete backup");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (id: string) => {
    const token = localStorage.getItem("token");
    const url = api.downloadBackupUrl(id);
    // Use fetch with auth header then trigger download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const backup = backups.find((b) => b.id === id);
        a.download = backup?.filename || "helix-backup.tar.gz";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Failed to download backup"));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updated = await api.updateBackupSettings(settings);
      setSettings(updated);
      toast.success("Backup settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-bold mb-4">Backups</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Only administrators can manage backups.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Plan gate
  if (plan && !hasFeature) {
    return (
      <div className="animate-in-page p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Backups</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Automated Backups</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Automated backups are available on Pro plan and above. Back up your database,
              config, and agent workspace files with scheduled or manual backups.
            </p>
            <Button onClick={() => setShowUpgrade(true)}>Upgrade Plan</Button>
          </CardContent>
        </Card>
        <FeatureGateModal
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          feature="backups"
          requiredPlan="pro"
        />
      </div>
    );
  }

  return (
    <div className="animate-in-page p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Backups</h1>

      {/* Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Backup Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Enable automated backups</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically back up database, config, and workspace files
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.backup_enabled}
                  onClick={() =>
                    setSettings((s) => ({ ...s, backup_enabled: !s.backup_enabled }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.backup_enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.backup_enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {settings.backup_enabled && (
                <>
                  {/* Schedule */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Schedule</label>
                      <select
                        value={settings.backup_schedule}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, backup_schedule: e.target.value }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Time (UTC)</label>
                      <select
                        value={settings.backup_time}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, backup_time: e.target.value }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Day picker (weekly only) */}
                  {settings.backup_schedule === "weekly" && (
                    <div>
                      <label className="text-sm font-medium block mb-1">Day of week</label>
                      <select
                        value={settings.backup_day}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, backup_day: e.target.value }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {DAYS.map((d) => (
                          <option key={d} value={d}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Retention */}
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Retention period (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={settings.backup_retention_days}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          backup_retention_days: Math.min(90, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Backups older than this will be automatically deleted (1–90 days)
                    </p>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Settings
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Backup History Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4" />
              Backup History
              {total > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {total}
                </Badge>
              )}
            </CardTitle>
            <Button onClick={handleCreateBackup} disabled={creating} size="sm">
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {creating ? "Creating..." : "Create Backup Now"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <HardDrive className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                No backups yet. Enable automated backups or create one manually.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {fmtDate(backup.created_at)}
                        </span>
                        <Badge
                          variant={backup.backup_type === "auto" ? "secondary" : "outline"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {backup.backup_type === "auto" ? "Auto" : "Manual"}
                        </Badge>
                        <Badge
                          variant={backup.status === "completed" ? "secondary" : "destructive"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {backup.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fmtSize(backup.file_size_bytes)}
                        {backup.error_message && (
                          <span className="text-destructive ml-2">
                            {backup.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {backup.status === "completed" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(backup.id)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(backup.id)}
                      disabled={deleting === backup.id}
                      title="Delete"
                    >
                      {deleting === backup.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
