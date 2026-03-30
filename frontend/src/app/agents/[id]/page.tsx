"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
import {
  api,
  type Agent,
  type Department,
  type AgentStats,
  type AgentStatusLog,
  type AgentTaskItem,
  type AgentSkill,
  type SkillSummary,
  type AIModel,
  type InstalledPlugin,
  type AgentPluginItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
  BarChart3,
  Clock,
  CheckCircle2,
  ListTodo,
  Save,
  Plus,
  Puzzle,
  X,
  Upload,
  Pencil,
  Plug,
  Trash2,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExportTemplateModal } from "@/components/marketplace/ExportTemplateModal";

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  online: { color: "bg-green-500 text-white", label: "Online" },
  offline: { color: "bg-gray-400 text-white", label: "Offline" },
  busy: { color: "bg-yellow-500 text-white", label: "Busy" },
  error: { color: "bg-red-500 text-white", label: "Error" },
};

const STATUS_DOTS: Record<string, string> = {
  online: "bg-green-500",
  offline: "bg-gray-400 dark:bg-gray-600",
  busy: "bg-yellow-500",
  error: "bg-red-500",
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

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

// ---------------------------------------------------------------------------
// Skills tab component
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, string> = {
  copywriting: "✍️", branding: "🎨", "social-media": "📱", email: "📧",
  "customer-service": "💬", advertising: "📢", seo: "🔍", reporting: "📊", development: "💻",
};

const ACTIVATION_DOT_COLORS: Record<string, string> = {
  always: "bg-green-500", board: "bg-blue-500", tag: "bg-amber-500",
};

const ACTIVATION_LABELS: Record<string, string> = {
  always: "Always", board: "Board", tag: "Tag",
};

function AgentSkillsTab({
  agentId,
  agentSkills,
  allSkills,
  isAdmin,
  onReload,
}: {
  agentId: number;
  agentSkills: AgentSkill[];
  allSkills: SkillSummary[];
  isAdmin: boolean;
  onReload: () => void;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const assignedIds = new Set(agentSkills.map((s) => s.skill_id));
  const available = allSkills.filter((s) => !assignedIds.has(s.id));
  const filtered = assignSearch
    ? available.filter((s) =>
        s.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
        (s.description || "").toLowerCase().includes(assignSearch.toLowerCase())
      )
    : available;

  const handleAssign = async () => {
    if (selectedIds.length === 0) return;
    setAssigning(true);
    try {
      await api.assignAgentSkills(agentId, selectedIds);
      toast.success(`${selectedIds.length} skill(s) assigned`);
      setAssignOpen(false);
      setSelectedIds([]);
      setAssignSearch("");
      onReload();
    } catch {
      toast.error("Failed to assign skills");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (skillId: number) => {
    setRemoving(skillId);
    try {
      await api.unassignAgentSkill(agentId, skillId);
      toast.success("Skill removed");
      onReload();
    } catch {
      toast.error("Failed to remove skill");
    } finally {
      setRemoving(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      {/* Assigned Skills */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              Assigned Skills ({agentSkills.length})
            </h3>
            {isAdmin && available.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Assign Skill
              </Button>
            )}
          </div>

          {agentSkills.length === 0 ? (
            <div className="text-center py-8">
              <Puzzle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No skills assigned yet</p>
              {isAdmin && available.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setAssignOpen(true)}
                >
                  Assign a skill
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {agentSkills.map((as) => {
                const icon = as.skill_category
                  ? CATEGORY_ICONS[as.skill_category] || "📝"
                  : "📝";
                return (
                  <div
                    key={as.skill_id}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/skills/${as.skill_id}`)}
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{as.skill_name}</span>
                        <Badge variant="outline" className="text-[10px] gap-1 h-5">
                          <span className={`h-1.5 w-1.5 rounded-full ${ACTIVATION_DOT_COLORS[as.activation_mode] || ACTIVATION_DOT_COLORS.always}`} />
                          {ACTIVATION_LABELS[as.activation_mode] || as.activation_mode}
                        </Badge>
                      </div>
                      {as.skill_description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {as.skill_description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {(as.skill_tags || []).slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {as.attachment_count > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            📎 {as.attachment_count}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                        disabled={removing === as.skill_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(as.skill_id);
                        }}
                      >
                        {removing === as.skill_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Skills (inline) */}
      {isAdmin && available.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Available Skills ({available.length} more)
            </h3>
            <div className="space-y-1.5">
              {available.slice(0, 8).map((skill) => {
                const icon = skill.category
                  ? CATEGORY_ICONS[skill.category] || "📝"
                  : "📝";
                return (
                  <div
                    key={skill.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-base">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{skill.name}</span>
                      {skill.description && (
                        <span className="text-xs text-muted-foreground ml-2 truncate">
                          {skill.description}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={async () => {
                        try {
                          await api.assignAgentSkills(agentId, [skill.id]);
                          toast.success(`${skill.name} assigned`);
                          onReload();
                        } catch {
                          toast.error("Failed to assign");
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Assign
                    </Button>
                  </div>
                );
              })}
              {available.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{available.length - 8} more — use the Assign Skill button above
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Skill Modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAssignOpen(false)}>
          <div
            className="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assign Skills</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAssignOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 border-b">
              <Input
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="Search skills..."
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {assignSearch ? "No matching skills" : "All skills are already assigned"}
                </p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((skill) => {
                    const checked = selectedIds.includes(skill.id);
                    const icon = skill.category
                      ? CATEGORY_ICONS[skill.category] || "📝"
                      : "📝";
                    return (
                      <button
                        key={skill.id}
                        onClick={() => toggleSelect(skill.id)}
                        className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                          checked ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        }`}>
                          {checked && (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-lg">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{skill.name}</div>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                          )}
                        </div>
                        {skill.category && (
                          <Badge variant="secondary" className="text-[10px] capitalize flex-shrink-0">
                            {skill.category}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAssign} disabled={assigning || selectedIds.length === 0}>
                  {assigning && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Assign Selected
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugins tab component
// ---------------------------------------------------------------------------

function AgentPluginsTab({
  agentId,
  agentPlugins,
  allPlugins,
  isAdmin,
  onReload,
}: {
  agentId: number;
  agentPlugins: AgentPluginItem[];
  allPlugins: InstalledPlugin[];
  isAdmin: boolean;
  onReload: () => void;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedPluginId, setSelectedPluginId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const assignedIds = new Set(agentPlugins.map((p) => p.plugin_id));
  const available = allPlugins.filter((p) => !assignedIds.has(p.id) && p.is_configured);

  const handleAssign = async () => {
    if (!selectedPluginId) return;
    setAssigning(true);
    try {
      await api.assignAgentPlugin(agentId, { plugin_id: selectedPluginId });
      toast.success("Plugin assigned");
      setAssignOpen(false);
      setSelectedPluginId(null);
      onReload();
    } catch {
      toast.error("Failed to assign plugin");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (pluginId: number) => {
    setRemoving(pluginId);
    try {
      await api.removeAgentPlugin(agentId, pluginId);
      toast.success("Plugin removed");
      onReload();
    } catch {
      toast.error("Failed to remove plugin");
    } finally {
      setRemoving(null);
    }
  };

  // Count total capabilities
  const totalCaps = agentPlugins.reduce(
    (sum, ap) => sum + (ap.capabilities?.length || ap.available_capabilities.length),
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">
                Assigned Plugins ({agentPlugins.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalCaps} capabilities from {agentPlugins.length} plugins
              </p>
            </div>
            {isAdmin && available.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Assign Plugin
              </Button>
            )}
          </div>

          {agentPlugins.length === 0 ? (
            <div className="text-center py-8">
              <Plug className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No plugins assigned yet</p>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() =>
                    available.length > 0
                      ? setAssignOpen(true)
                      : router.push("/settings/plugins")
                  }
                >
                  {available.length > 0 ? "Assign a plugin" : "Go to Plugins settings"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {agentPlugins.map((ap) => (
                <div
                  key={ap.plugin_id}
                  className="flex items-center gap-3 rounded-lg border p-3 group"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                    {ap.plugin_emoji || "🔌"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{ap.plugin_name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {ap.available_capabilities.length} capabilities
                      </Badge>
                      {!ap.is_configured && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          Not Configured
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ap.available_capabilities.slice(0, 4).map((cap) => (
                        <span
                          key={cap.id}
                          className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                        >
                          {cap.name}
                        </span>
                      ))}
                      {ap.available_capabilities.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{ap.available_capabilities.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(ap.plugin_id)}
                      disabled={removing === ap.plugin_id}
                    >
                      {removing === ap.plugin_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Plugin Modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAssignOpen(false)}>
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-md max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b font-semibold text-sm">Assign Plugin</div>
            <div className="flex-1 overflow-y-auto p-2">
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No configured plugins available
                </p>
              ) : (
                <div className="space-y-1">
                  {available.map((plugin) => (
                    <button
                      key={plugin.id}
                      onClick={() => setSelectedPluginId(plugin.id)}
                      className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                        selectedPluginId === plugin.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-accent"
                      }`}
                    >
                      <span className="text-lg">{plugin.emoji || "🔌"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{plugin.name}</div>
                        <p className="text-xs text-muted-foreground truncate">
                          {plugin.capabilities.length} capabilities
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAssign}
                disabled={assigning || !selectedPluginId}
              >
                {assigning && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Assign
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const { id } = useParams();
  const agentId = Number(id);
  const router = useRouter();
  const { user } = useAuth();
  const { subscribe } = useWS();
  const isAdmin = user?.role === "admin";

  const [agent, setAgent] = useState<Agent | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [statusLog, setStatusLog] = useState<AgentStatusLog | null>(null);
  const [loading, setLoading] = useState(true);

  // Active tasks
  const [activeTasks, setActiveTasks] = useState<AgentTaskItem[]>([]);
  // History tasks
  const [historyTasks, setHistoryTasks] = useState<AgentTaskItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(0);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // System prompt editing
  const [editPrompt, setEditPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);

  // Skills
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [allSkills, setAllSkills] = useState<SkillSummary[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);

  // AI Models
  const [aiModels, setAIModels] = useState<AIModel[]>([]);
  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Plugins
  const [agentPluginsList, setAgentPluginsList] = useState<AgentPluginItem[]>([]);
  const [allPlugins, setAllPlugins] = useState<InstalledPlugin[]>([]);

  // Budget
  const [budgetStatus, setBudgetStatus] = useState<import("@/lib/api").BudgetStatus | null>(null);
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetThreshold, setBudgetThreshold] = useState("80");
  const [budgetResetDay, setBudgetResetDay] = useState("1");
  const [savingBudget, setSavingBudget] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"active" | "history" | "skills" | "plugins">("active");

  const loadData = useCallback(async () => {
    try {
      const [agentData, depts, statsData, logData] = await Promise.all([
        api.agent(agentId),
        api.departments(),
        api.getAgentStats(agentId),
        api.getAgentStatusLog(agentId),
      ]);
      setAgent(agentData);
      setDepartment(depts.find((d) => d.id === agentData.department_id) || null);
      setStats(statsData);
      setStatusLog(logData);
      setEditPrompt(agentData.system_prompt || "");
      // Load budget
      api.getAgentBudget(agentId).then(setBudgetStatus).catch(() => {});
    } catch {
      toast.error("Failed to load agent data");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadActiveTasks = useCallback(async () => {
    // Load non-done, non-cancelled tasks
    const results = await Promise.all([
      api.getAgentTasks(agentId, { status: "todo", per_page: 100 }),
      api.getAgentTasks(agentId, { status: "in_progress", per_page: 100 }),
      api.getAgentTasks(agentId, { status: "review", per_page: 100 }),
    ]);
    const all = [...results[0].tasks, ...results[1].tasks, ...results[2].tasks];
    setActiveTasks(all);
  }, [agentId]);

  const loadHistoryTasks = useCallback(async (page: number) => {
    const result = await api.getAgentTasks(agentId, { status: "done", page, per_page: 20 });
    setHistoryTasks(result.tasks);
    setHistoryPages(result.pages);
    setHistoryPage(page);
  }, [agentId]);

  const loadSkills = useCallback(async () => {
    try {
      const [as, all] = await Promise.all([
        api.getAgentSkills(agentId),
        api.skills(),
      ]);
      setAgentSkills(as);
      setAllSkills(all);
    } catch { /* ignore */ }
  }, [agentId]);

  const loadModels = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const models = await api.aiModels();
      setAIModels(models);
    } catch { /* ignore */ }
  }, [isAdmin]);

  const loadAgentPlugins = useCallback(async () => {
    try {
      const [ap, all] = await Promise.all([
        api.agentPlugins(agentId),
        api.plugins(),
      ]);
      setAgentPluginsList(ap);
      setAllPlugins(all);
    } catch { /* ignore */ }
  }, [agentId]);

  useEffect(() => {
    loadData();
    loadActiveTasks();
    loadHistoryTasks(1);
    loadSkills();
    loadModels();
    loadAgentPlugins();
  }, [loadData, loadActiveTasks, loadHistoryTasks, loadSkills, loadModels, loadAgentPlugins]);

  // Real-time: agent status changes
  useEffect(() => {
    const unsubs = [
      subscribe("agent.status_changed", (event) => {
        const data = event.data as Record<string, unknown>;
        if (Number(data.agent_id) === agentId) {
          setAgent((prev) => prev ? { ...prev, status: data.status as string } : prev);
        }
      }),
      subscribe("task.created", () => { loadActiveTasks(); loadData(); }),
      subscribe("task.updated", () => { loadActiveTasks(); loadHistoryTasks(historyPage); loadData(); }),
      subscribe("task.completed", () => { loadActiveTasks(); loadHistoryTasks(historyPage); loadData(); }),
      subscribe("task.submitted_for_review", () => { loadActiveTasks(); loadData(); }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, agentId, loadActiveTasks, loadHistoryTasks, loadData, historyPage]);

  const handleToggleMode = async () => {
    if (!agent) return;
    const newMode = agent.execution_mode === "auto" ? "manual" : "auto";
    try {
      const updated = await api.updateAgent(agent.id, { execution_mode: newMode });
      setAgent(updated);
      toast.success(`Execution mode set to ${newMode}`);
    } catch {
      toast.error("Failed to toggle mode");
    }
  };

  const handleSavePrompt = async () => {
    if (!agent) return;
    setSavingPrompt(true);
    try {
      const updated = await api.updateAgent(agent.id, { system_prompt: editPrompt });
      setAgent(updated);
      toast.success("System prompt saved");
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agent) return;
    setDeleting(true);
    try {
      await api.deleteAgent(agent.id);
      toast.success(`Agent "${agent.name}" deleted`);
      router.push("/agents");
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const fmtTime = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-MY", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Agent not found.{" "}
        <Button variant="link" onClick={() => router.push("/agents")}>
          Back to agents
        </Button>
      </div>
    );
  }

  const statusBadge = STATUS_BADGE[agent.status] || STATUS_BADGE.offline;
  const activeCount = (stats?.tasks_assigned.todo || 0) +
    (stats?.tasks_assigned.in_progress || 0) +
    (stats?.tasks_assigned.review || 0);

  return (
    <div className="animate-in-page space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/agents")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Agents
      </Button>

      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-5">
          {/* Large gradient avatar */}
          <div className="relative flex-shrink-0">
            <div
              className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${getDeptGradient(department?.name || "")} flex items-center justify-center text-4xl shadow-lg`}
            >
              🤖
            </div>
            <div
              className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-card ${STATUS_DOTS[agent.status] || STATUS_DOTS.offline} ${
                agent.status === "online" ? "animate-[pulseDot_2s_ease-in-out_infinite]" : ""
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = editName.trim();
                  if (!trimmed || trimmed === agent.name) {
                    setEditingName(false);
                    return;
                  }
                  setSavingName(true);
                  try {
                    const updated = await api.updateAgent(agent.id, { name: trimmed } as Partial<Agent>);
                    setAgent(updated);
                    setEditingName(false);
                    toast.success("Agent renamed");
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Failed to rename agent");
                  } finally {
                    setSavingName(false);
                  }
                }}
              >
                <Input
                  autoFocus
                  className="text-2xl font-bold h-auto py-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={savingName}
                />
                <Button type="submit" size="sm" disabled={savingName || !editName.trim()}>
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingName(false)} disabled={savingName}>
                  <X className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                {agent.name}
                {isAdmin && (
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setEditName(agent.name); setEditingName(true); }}
                    title="Rename agent"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </h1>
            )}
            <p className="text-muted-foreground">
              {agent.role_title} · {department?.name || ""}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
              <Badge variant="outline">
                {agent.execution_mode === "auto" ? (
                  <><Zap className="h-3 w-3 mr-1 text-yellow-500" />Auto</>
                ) : "Manual"}
              </Badge>
              {statusLog?.events?.[0] && (
                <span className="text-xs text-muted-foreground">
                  {agent.status === "online"
                    ? `Active ${timeAgo(statusLog.events[0].timestamp)}`
                    : `Last seen ${timeAgo(statusLog.events[0].timestamp)}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {isAdmin && aiModels.length > 0 && (
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-xs"
              value={agent.ai_model_id ?? ""}
              onChange={async (e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                try {
                  const updated = await api.updateAgent(agent.id, { ai_model_id: val } as Partial<Agent>);
                  setAgent(updated);
                  toast.success(val ? "Model override set" : "Using default model");
                } catch { toast.error("Failed to update model"); }
              }}
            >
              <option value="">Default Model</option>
              {aiModels.filter((m) => m.is_active).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}{m.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleToggleMode}>
              <Zap className="h-4 w-4 mr-1" />
              Toggle {agent.execution_mode === "auto" ? "Manual" : "Auto"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowExportModal(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Export
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Budget Paused Banner */}
      {agent.budget_paused && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Agent Paused — Budget Exceeded</p>
              <p className="text-xs text-muted-foreground mt-0.5">{agent.budget_pause_reason}</p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/30 hover:bg-red-500/20"
              onClick={async () => {
                try {
                  await api.overrideAgentBudget(agentId);
                  toast.success("Budget override applied");
                  loadData();
                } catch { toast.error("Failed to override budget"); }
              }}
            >
              Override & Resume
            </Button>
          )}
        </div>
      )}

      {/* Budget Card */}
      {budgetStatus && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Token Budget
              </h3>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBudgetInput(budgetStatus.budget_usd?.toString() || "");
                    setBudgetThreshold(String(Math.round((budgetStatus.unlimited ? 80 : (budgetStatus.percentage > 0 ? 80 : 80)))));
                    setBudgetResetDay(String(budgetStatus.reset_day));
                    setShowBudgetDialog(true);
                  }}
                >
                  {budgetStatus.unlimited ? "Set Budget" : "Edit Budget"}
                </Button>
              )}
            </div>
            {budgetStatus.unlimited ? (
              <p className="text-sm text-muted-foreground">No budget set — unlimited spending</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    ${budgetStatus.spent_usd.toFixed(2)} / ${budgetStatus.budget_usd?.toFixed(2)}
                  </span>
                  <span className={
                    budgetStatus.exceeded ? "text-red-400 font-medium" :
                    budgetStatus.warning ? "text-amber-400 font-medium" :
                    "text-muted-foreground"
                  }>
                    {budgetStatus.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetStatus.exceeded ? "bg-red-500" :
                      budgetStatus.warning ? "bg-amber-500" :
                      "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min(100, budgetStatus.percentage)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>${budgetStatus.remaining_usd.toFixed(2)} remaining</span>
                  <span>Resets on day {budgetStatus.reset_day}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Budget Dialog */}
      <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Agent Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Monthly Budget (USD)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 10.00 (empty = unlimited)"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave empty to remove budget (unlimited).</p>
            </div>
            <div>
              <label className="text-sm font-medium">Warning Threshold (%)</label>
              <Input
                type="number"
                min="1"
                max="99"
                value={budgetThreshold}
                onChange={(e) => setBudgetThreshold(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reset Day of Month</label>
              <Input
                type="number"
                min="1"
                max="28"
                value={budgetResetDay}
                onChange={(e) => setBudgetResetDay(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBudgetDialog(false)}>Cancel</Button>
              <Button
                disabled={savingBudget}
                onClick={async () => {
                  setSavingBudget(true);
                  try {
                    await api.updateAgentBudget(agentId, {
                      monthly_budget_usd: budgetInput ? parseFloat(budgetInput) : null,
                      budget_warning_threshold: parseInt(budgetThreshold) / 100,
                      budget_reset_day: parseInt(budgetResetDay) || 1,
                    });
                    toast.success("Budget updated");
                    setShowBudgetDialog(false);
                    loadData();
                  } catch { toast.error("Failed to update budget"); }
                  finally { setSavingBudget(false); }
                }}
              >
                {savingBudget && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Budget
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Performance Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-t-2 border-t-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.tasks_completed.total}</div>
                  <div className="text-xs text-muted-foreground">Tasks Completed</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                {stats.tasks_completed.this_week} this week · {stats.tasks_completed.this_month} this month
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-2 border-t-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {stats.average_completion_time_minutes !== null
                      ? `${stats.average_completion_time_minutes}m`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Completion</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                per task average
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-2 border-t-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <ListTodo className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeCount}</div>
                  <div className="text-xs text-muted-foreground">Active Tasks</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                {stats.tasks_assigned.todo} todo · {stats.tasks_assigned.in_progress} in progress · {stats.tasks_assigned.review} review
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-2 border-t-teal-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{Math.round(stats.success_rate * 100)}%</div>
                  <div className="text-xs text-muted-foreground">Success Rate</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-teal-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round(stats.success_rate * 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task Tabs */}
      <div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit mb-4">
          <Button
            variant={activeTab === "active" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("active")}
            className="rounded-md"
          >
            Active Tasks ({activeTasks.length})
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("history")}
            className="rounded-md"
          >
            Task History
          </Button>
          <Button
            variant={activeTab === "skills" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("skills")}
            className="rounded-md"
          >
            <Puzzle className="mr-1 h-3.5 w-3.5" />
            Skills ({agentSkills.length})
          </Button>
          <Button
            variant={activeTab === "plugins" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("plugins")}
            className="rounded-md"
          >
            <Plug className="mr-1 h-3.5 w-3.5" />
            Plugins ({agentPluginsList.length})
          </Button>
        </div>

        {activeTab === "active" && (
          <Card>
            <CardContent className="p-0">
              {activeTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No active tasks</div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Board</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTasks.map((task) => (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/boards/${task.board_id}`)}
                      >
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell className="text-muted-foreground">{task.board_name}</TableCell>
                        <TableCell>
                          <Badge className={TASK_STATUS_COLORS[task.status] || "bg-gray-200"}>
                            {task.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${PRIORITY_COLORS[task.priority] || ""}`}>
                            {task.priority.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmt(task.created_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.due_date ? fmt(task.due_date) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "history" && (
          <Card>
            <CardContent className="p-0">
              {historyTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No completed tasks</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Board</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyTasks.map((task) => (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/boards/${task.board_id}`)}
                        >
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell className="text-muted-foreground">{task.board_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {fmt(task.updated_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {task.result_preview || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  {historyPages > 1 && (
                    <div className="flex items-center justify-center gap-2 py-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historyPage <= 1}
                        onClick={() => loadHistoryTasks(historyPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {historyPage} of {historyPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historyPage >= historyPages}
                        onClick={() => loadHistoryTasks(historyPage + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "skills" && (
          <AgentSkillsTab
            agentId={agentId}
            agentSkills={agentSkills}
            allSkills={allSkills}
            isAdmin={isAdmin}
            onReload={loadSkills}
          />
        )}

        {activeTab === "plugins" && (
          <AgentPluginsTab
            agentId={agentId}
            agentPlugins={agentPluginsList}
            allPlugins={allPlugins}
            isAdmin={isAdmin}
            onReload={loadAgentPlugins}
          />
        )}
      </div>

      {/* Status Timeline */}
      <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
        <Card>
          <CardContent className="p-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-muted-foreground">Status Timeline</h3>
              {timelineOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {!statusLog?.events?.length ? (
                <p className="text-sm text-muted-foreground">No status history available</p>
              ) : (
                <div className="space-y-2">
                  {statusLog.events.slice(0, 20).map((event, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div className={`h-2.5 w-2.5 rounded-full ${STATUS_DOTS[event.status] || "bg-gray-400"}`} />
                      <span className="font-medium capitalize w-16">{event.status}</span>
                      <span className="text-muted-foreground">{fmtTime(event.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* System Prompt */}
      <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
        <Card>
          <CardContent className="p-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Bot className="h-4 w-4" /> System Prompt
              </h3>
              {promptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {isAdmin ? (
                <div className="space-y-2">
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="Enter system prompt..."
                  />
                  <Button size="sm" onClick={handleSavePrompt} disabled={savingPrompt}>
                    {savingPrompt ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              ) : (
                <pre className="bg-muted rounded-md p-4 text-sm font-mono whitespace-pre-wrap overflow-auto max-h-96">
                  {agent.system_prompt || "No system prompt configured."}
                </pre>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Export Modal */}
      {showExportModal && agent && (
        <ExportTemplateModal
          type="agent"
          resourceId={agent.id}
          resourceName={agent.name}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteModal(false)}>
          <div
            className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete Agent</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm">
              Are you sure you want to delete <strong>{agent.name}</strong>? This will:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Unassign all tasks from this agent</li>
              <li>Remove all agent skills and plugins</li>
              <li>Delete all comments by this agent</li>
              <li>Remove the agent from the gateway</li>
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAgent} disabled={deleting}>
                {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete Agent
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
