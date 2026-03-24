"use client";

import { useState, useEffect } from "react";
import { api, type GatewayItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<GatewayItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGw, setEditingGw] = useState<GatewayItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<GatewayItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formToken, setFormToken] = useState("");

  const fetchGateways = async () => {
    setLoading(true);
    try {
      const data = await api.gateways();
      setGateways(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load gateways");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGateways();
  }, []);

  const openCreate = () => {
    setEditingGw(null);
    setFormName("");
    setFormUrl("ws://gateway:18789");
    setFormToken("");
    setDialogOpen(true);
  };

  const openEdit = (gw: GatewayItem) => {
    setEditingGw(gw);
    setFormName(gw.name);
    setFormUrl(gw.websocket_url);
    setFormToken("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingGw) {
        const updates: Record<string, string> = {};
        if (formName !== editingGw.name) updates.name = formName;
        if (formUrl !== editingGw.websocket_url) updates.websocket_url = formUrl;
        if (formToken) updates.token = formToken;
        await api.updateGateway(editingGw.id, updates);
        toast.success("Gateway updated");
      } else {
        await api.createGateway({
          name: formName,
          websocket_url: formUrl,
          token: formToken,
        });
        toast.success("Gateway created");
      }
      setDialogOpen(false);
      fetchGateways();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteGateway(deleteConfirm.id);
      toast.success("Gateway deleted");
      setDeleteConfirm(null);
      fetchGateways();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="animate-in-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gateway Management</h1>
          <p className="text-muted-foreground">{gateways.length} gateway{gateways.length !== 1 ? "s" : ""} configured</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchGateways} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Gateway
          </Button>
        </div>
      </div>

      {loading && gateways.length === 0 ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>WebSocket URL</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gateways.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No gateways configured. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                gateways.map((gw) => (
                  <TableRow key={gw.id}>
                    <TableCell>
                      <div
                        className={`h-3 w-3 rounded-full ${gw.connected ? "bg-green-500" : "bg-red-500"}`}
                        title={gw.connected ? "Connected" : "Disconnected"}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{gw.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {gw.websocket_url}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {gw.created_at
                        ? new Date(gw.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(gw)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(gw)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGw ? "Edit Gateway" : "Add Gateway"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="OpenClaw Gateway"
              />
            </div>
            <div>
              <label className="text-sm font-medium">WebSocket URL</label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="ws://gateway:18789"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {editingGw ? "Token (leave blank to keep)" : "Token"}
              </label>
              <Input
                type="password"
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder={editingGw ? "Leave blank to keep current" : "Gateway auth token"}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formName || !formUrl || (!editingGw && !formToken)}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingGw ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Gateway</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This will remove the gateway configuration.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
