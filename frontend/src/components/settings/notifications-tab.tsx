"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NotificationsTab() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [telegramNotifs, setTelegramNotifs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getOrgNotificationPrefs();
      setEmailNotifs(data.email_notifications);
      setTelegramNotifs(data.telegram_notifications);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateOrgNotificationPrefs({
        email_notifications: emailNotifs,
        telegram_notifications: telegramNotifs,
      });
      toast.success("Notification preferences saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Notification Preferences</h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs text-muted-foreground">
                Receive email alerts for important events
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailNotifs}
              onClick={() => setEmailNotifs(!emailNotifs)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                emailNotifs ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emailNotifs ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Telegram Notifications</p>
              <p className="text-xs text-muted-foreground">
                Receive Telegram alerts (requires bot configuration)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={telegramNotifs}
              onClick={() => setTelegramNotifs(!telegramNotifs)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                telegramNotifs ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  telegramNotifs ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Preferences
          </Button>
        </div>
      </Card>
    </div>
  );
}
