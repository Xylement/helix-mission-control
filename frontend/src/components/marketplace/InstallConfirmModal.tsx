"use client";

import { useEffect, useState } from "react";
import { api, type MarketplacePreInstallCheck } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Info,
  Loader2,
  Bot,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  slug: string;
  templateName: string;
  templateType: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function InstallConfirmModal({ slug, templateName, templateType, onClose, onSuccess }: Props) {
  const [check, setCheck] = useState<MarketplacePreInstallCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.marketplacePreInstallCheck(slug);
        setCheck(data);
      } catch {
        toast.error("Failed to check install requirements");
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, onClose]);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await api.marketplaceInstall(slug);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Installation failed";
      toast.error(message);
    } finally {
      setInstalling(false);
    }
  };

  const isAgent = templateType === "agent_template" || templateType === "agent";
  const Icon = isAgent ? Bot : BookOpen;

  return (
    <Dialog open onOpenChange={() => !installing && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install &ldquo;{templateName}&rdquo;?</DialogTitle>
          <DialogDescription>
            {isAgent
              ? "This will create an agent with its department, board, and skills."
              : "This will create a new skill in your workspace."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : check ? (
          <div className="space-y-3 py-2">
            {!check.can_install && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{check.reason}</p>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <p className="font-medium flex items-center gap-2">
                <Icon className="h-4 w-4" />
                This will create:
              </p>

              {isAgent && (
                <div className="ml-6 space-y-1 text-muted-foreground">
                  <p>
                    Agent: <span className="text-foreground font-medium">{check.suggested_name || templateName}</span>
                    {check.agent_name_conflict && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">renamed</Badge>
                    )}
                  </p>
                  <p>
                    Department: <span className="text-foreground">{check.department_name}</span>
                    {check.department_exists && (
                      <span className="text-xs ml-1">(existing)</span>
                    )}
                  </p>
                  <p>
                    Board: <span className="text-foreground">{check.board_name}</span>
                    {check.board_exists && (
                      <span className="text-xs ml-1">(existing)</span>
                    )}
                  </p>
                </div>
              )}

              {!isAgent && (
                <div className="ml-6 space-y-1 text-muted-foreground">
                  <p>
                    Skill: <span className="text-foreground font-medium">{templateName}</span>
                  </p>
                  <p className="text-xs">
                    You can assign this skill to agents after installation.
                  </p>
                </div>
              )}

              {check.agent_name_conflict && (
                <div className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Agent name already exists. Will create as &ldquo;{check.suggested_name}&rdquo;.
                  </p>
                </div>
              )}

              {check.department_exists && isAgent && (
                <div className="flex items-start gap-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Department &ldquo;{check.department_name}&rdquo; already exists. Agent will be added to it.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={installing}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={loading || installing || (check !== null && !check.can_install)}
          >
            {installing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Installing...
              </>
            ) : (
              "Confirm Install"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
