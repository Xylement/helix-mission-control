"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  type: "agent" | "skill";
  resourceId: number;
  resourceName: string;
  onClose: () => void;
}

export function ExportTemplateModal({ type, resourceId, resourceName, onClose }: Props) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const manifest =
        type === "agent"
          ? await api.marketplaceExportAgent(resourceId)
          : await api.marketplaceExportSkill(resourceId);

      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = resourceName.toLowerCase().replace(/\s+/g, "-");
      a.download = `${safeName}-${type}-template.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`${type === "agent" ? "Agent" : "Skill"} exported as template`);
      onClose();
    } catch {
      toast.error("Failed to export template");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => !exporting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export &ldquo;{resourceName}&rdquo; as Template</DialogTitle>
          <DialogDescription>
            Generate a marketplace-compatible manifest JSON file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm text-muted-foreground">
          <p>This will generate a JSON file that you can:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Share with other HELIX users</li>
            <li>Submit to the HELIX Marketplace</li>
            <li>Import into another HELIX instance</li>
          </ul>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {type === "agent"
                ? "The system prompt will be included in the export. Review it before sharing publicly."
                : "The skill content will be included in the export. Review it before sharing publicly."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download JSON
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
