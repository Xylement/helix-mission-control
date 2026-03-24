"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
import { api, type Agent, type Department, type Board } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isLimitError, type LimitError } from "@/lib/billing";
import { UpgradeModal } from "@/components/billing/UpgradeModal";

const STATUS_COLORS: Record<string, string> = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  offline: "bg-gray-400 dark:bg-gray-600",
};

const DEPT_GRADIENTS: Record<string, string> = {
  Marketing: "from-pink-500 to-rose-400",
  Technology: "from-blue-500 to-cyan-400",
  Operations: "from-amber-500 to-orange-400",
  Finance: "from-emerald-500 to-teal-400",
  "Human Resources": "from-purple-500 to-violet-400",
};

function getDeptGradient(dept: string): string {
  if (DEPT_GRADIENTS[dept]) return DEPT_GRADIENTS[dept];
  let hash = 0;
  for (let i = 0; i < dept.length; i++) hash = dept.charCodeAt(i) + ((hash << 5) - hash);
  const gradients = Object.values(DEPT_GRADIENTS);
  return gradients[Math.abs(hash) % gradients.length] || "from-gray-500 to-slate-400";
}

export default function AgentsPage() {
  const { user: currentUser } = useAuth();
  const { subscribe } = useWS();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editMode, setEditMode] = useState<string>("");
  const [editPrompt, setEditPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Delete agent state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create agent dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newBoard, setNewBoard] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newExecMode, setNewExecMode] = useState("manual");

  const [loading, setLoading] = useState(true);

  // Upgrade modal state
  const [upgradeModal, setUpgradeModal] = useState<LimitError | null>(null);

  useEffect(() => {
    Promise.all([api.agents(), api.departments(), api.boards()]).then(([a, d, b]) => {
      setAgents(a);
      setDepartments(d);
      setBoards(b);
      setLoading(false);
    });
  }, []);

  // Real-time agent status updates
  useEffect(() => {
    const unsub = subscribe("agent.status_changed", (event) => {
      const data = event.data as Record<string, unknown>;
      const agentId = Number(data.agent_id);
      const newStatus = data.status as string;
      if (agentId && newStatus) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, status: newStatus } : a))
        );
        if (selected?.id === agentId) {
          setSelected((s) => s ? { ...s, status: newStatus } : s);
        }
      }
    });
    return unsub;
  }, [subscribe, selected?.id]);

  const handleUpdate = async (id: number, data: Partial<Agent>) => {
    const updated = await api.updateAgent(id, data);
    setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
    if (selected?.id === id) setSelected(updated);
    return updated;
  };

  const handleSavePrompt = async () => {
    if (!selected) return;
    setSaving(true);
    setSuccessMessage("");
    try {
      await handleUpdate(selected.id, { system_prompt: editPrompt });
      setSuccessMessage("Saved!");
      toast.success("Agent saved!");

      // Close dialog after brief delay so user sees success
      setTimeout(() => {
        setSelected(null);
        setSuccessMessage("");
      }, 600);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAgent = async () => {
    setCreateSaving(true);
    try {
      const created = await api.createAgent({
        name: newName,
        role_title: newRole,
        department_id: Number(newDept),
        primary_board_id: Number(newBoard),
        system_prompt: newPrompt,
        execution_mode: newExecMode,
      });
      setAgents((prev) => [...prev, created]);
      setCreateOpen(false);
      setNewName("");
      setNewRole("");
      setNewDept("");
      setNewBoard("");
      setNewPrompt("");
      setNewExecMode("manual");
      toast.success("Agent created!");
    } catch (err: unknown) {
      if (isLimitError(err)) {
        setCreateOpen(false);
        setUpgradeModal(err);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to create agent");
      }
    } finally {
      setCreateSaving(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.deleteAgent(selected.id);
      setAgents((prev) => prev.filter((a) => a.id !== selected.id));
      setDeleteOpen(false);
      setSelected(null);
      toast.success("Agent deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setDeleting(false);
    }
  };

  const deptName = (id: number) => departments.find((d) => d.id === id)?.name || "";
  const boardName = (id: number) => boards.find((b) => b.id === id)?.name || "";

  if (loading) {
    return (
      <div className="animate-in-page space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-9 w-28 rounded-lg skeleton-shimmer" />
            <div className="h-5 w-52 rounded-md skeleton-shimmer mt-2" />
          </div>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full skeleton-shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-28 rounded-md skeleton-shimmer" />
                    <div className="h-4 w-36 rounded-md skeleton-shimmer" />
                    <div className="flex gap-1.5">
                      <div className="h-5 w-20 rounded-full skeleton-shimmer" />
                      <div className="h-5 w-16 rounded-full skeleton-shimmer" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">{agents.length} AI agents across all departments</p>
        </div>
        {currentUser?.role === "admin" && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Agent
          </Button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const dept = deptName(agent.department_id);
          return (
            <Card
              key={agent.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group overflow-hidden"
              onClick={() => router.push(`/agents/${agent.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  {/* Gradient avatar */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={`h-14 w-14 rounded-full bg-gradient-to-br ${getDeptGradient(dept)} flex items-center justify-center text-2xl shadow-lg group-hover:scale-105 transition-transform`}
                    >
                      🤖
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card ${STATUS_COLORS[agent.status] || STATUS_COLORS.offline} ${
                        agent.status === "online" ? "animate-[pulseDot_2s_ease-in-out_infinite]" : ""
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{agent.role_title}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                        {dept}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                        {agent.execution_mode === "auto" ? "⚡ Auto" : "Manual"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Agent Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name" />
            </div>
            <div>
              <label className="text-sm font-medium">Role Title</label>
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Content Writer" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Department</label>
                <Select value={newDept} onValueChange={setNewDept}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Board</label>
                <Select value={newBoard} onValueChange={setNewBoard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">System Prompt</label>
              <Textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={4}
                placeholder="System prompt for this agent..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Execution Mode</label>
              <Select value={newExecMode} onValueChange={setNewExecMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreateAgent}
                disabled={createSaving || !newName || !newRole || !newDept || !newBoard}
              >
                {createSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Agent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setSuccessMessage(""); } }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${STATUS_COLORS[selected.status]}`} />
                  {selected.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Role:</span>
                    <div className="font-medium">{selected.role_title}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department:</span>
                    <div className="font-medium">{deptName(selected.department_id)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Board:</span>
                    <div className="font-medium">{boardName(selected.primary_board_id)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="font-medium capitalize">{selected.status}</div>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">Execution Mode</label>
                  <Select
                    value={editMode || selected.execution_mode}
                    onValueChange={(v) => {
                      setEditMode(v);
                      handleUpdate(selected.id, { execution_mode: v });
                      toast.success(`Execution mode set to ${v}`);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">System Prompt</label>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={4}
                    placeholder="System prompt for this agent..."
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={handleSavePrompt}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      Save Prompt
                    </Button>
                    {successMessage && (
                      <div className="flex items-center gap-1 text-green-600 text-sm">
                        <Check className="h-4 w-4" /> {successMessage}
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete button (admin only) */}
                {currentUser?.role === "admin" && (
                  <div className="border-t pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete Agent
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Agent Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{selected?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAgent} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal */}
      {upgradeModal && (
        <UpgradeModal
          open={!!upgradeModal}
          onClose={() => setUpgradeModal(null)}
          type="agent"
          current={upgradeModal.current}
          limit={upgradeModal.limit}
          upgradeTo={upgradeModal.upgrade_to}
        />
      )}
    </div>
  );
}
