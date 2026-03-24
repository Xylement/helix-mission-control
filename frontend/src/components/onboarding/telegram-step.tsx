"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Loader2, SkipForward, Send } from "lucide-react";
import { toast } from "sonner";

interface TelegramStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function TelegramStep({ onNext, onSkip }: TelegramStepProps) {
  const [botToken, setBotToken] = useState("");
  const [allowedUserIds, setAllowedUserIds] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.onboardingStep6({
        bot_token: botToken || undefined,
        allowed_user_ids: allowedUserIds || undefined,
      });
      toast.success(botToken ? "Telegram configured!" : "Telegram skipped");
      onNext();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <Send className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Telegram Integration</h2>
        <p className="text-muted-foreground text-sm">
          Optional: Connect a Telegram bot for notifications and commands
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Bot Token</label>
          <Input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Get this from @BotFather on Telegram
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Allowed User IDs</label>
          <Input
            value={allowedUserIds}
            onChange={(e) => setAllowedUserIds(e.target.value)}
            placeholder="Comma-separated Telegram user IDs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Only these users can interact with the bot
          </p>
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {botToken ? "Save & Continue" : "Continue Without Telegram"}
        </Button>
      </Card>

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
