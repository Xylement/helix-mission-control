"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type OrgServiceToken } from "@/lib/api";
import { Loader2, Plus, Trash2, Copy, Check, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export function TokensTab() {
  const [tokens, setTokens] = useState<OrgServiceToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getOrgTokens();
      setTokens(data.tokens);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    setCreating(true);
    try {
      const result = await api.createOrgToken(tokenName);
      setNewToken(result.token);
      setTokenName("");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId: number) => {
    try {
      await api.revokeOrgToken(tokenId);
      toast.success("Token revoked");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token");
    }
  };

  const copyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <Card className="p-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tokens provide full API access to your organization. Keep them secure and
            revoke any that are no longer needed.
          </p>
        </div>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Service Tokens</h3>
        <Button
          size="sm"
          onClick={() => {
            setCreateOpen(true);
            setNewToken(null);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Create Token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p>No service tokens yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <Card key={token.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{token.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{token.prefix}...</span>
                    {" | "}
                    Created {new Date(token.created_at).toLocaleDateString()}
                    {token.last_used_at && (
                      <> | Last used {new Date(token.last_used_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleRevoke(token.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newToken ? "Token Created" : "Create Service Token"}</DialogTitle>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <Card className="p-4 border-amber-500/30 bg-amber-500/5">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Copy this token now. It cannot be retrieved again.
                </p>
              </Card>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                  {newToken}
                </code>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={() => setCreateOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Token Name</label>
                <Input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g. Production API"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating || !tokenName.trim()}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
