"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Download, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function DangerZoneTab() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleExport = () => {
    const url = api.exportOrgData();
    const token = localStorage.getItem("token");
    // Open in new tab with auth
    window.open(`${url}?token=${token || ""}`, "_blank");
    toast.success("Export started");
  };

  const handleDelete = () => {
    toast.error("Organization deletion is not yet implemented. Contact support.");
    setDeleteOpen(false);
    setConfirmText("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Export */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Export Data</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Download all organization data as JSON
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </Card>

      {/* Delete */}
      <Card className="p-6 border-destructive/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-destructive">Delete Organization</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Permanently delete all data. This action cannot be undone.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Organization
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all departments, boards, tasks, agents, and users.
              This action <strong>cannot be undone</strong>.
            </p>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Type <strong>DELETE</strong> to confirm
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={confirmText !== "DELETE"}
                onClick={handleDelete}
              >
                Delete Everything
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
