const getApiBase = (): string => {
  // 1. Explicit env variable (set at build time or in .env.local)
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  // 2. Server-side: use internal Docker network URL
  if (typeof window === 'undefined') {
    return 'http://backend:8000';
  }

  // 3. Client-side: use relative path (works behind Nginx reverse proxy)
  return '';
};

const API_BASE = getApiBase();

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Preserve structured error body for 403 (billing limit/feature errors)
    if (res.status === 403 && (body.error || body.detail?.error)) {
      throw body.detail?.error ? body.detail : body;
    }
    const detail = body.detail;
    throw new Error(
      typeof detail === "string" ? detail : detail?.message || detail?.error || res.statusText
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  updateProfile: (data: { name?: string; telegram_notifications?: boolean; telegram_user_id?: string | null }) =>
    request<User>("/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ ok: boolean; message: string }>("/auth/me/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  uploadAvatar: async (file: File): Promise<User> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/auth/me/avatar`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  },

  // Departments
  departments: () => request<Department[]>("/departments/"),
  createDepartment: (data: { name: string; emoji?: string; sort_order?: number }) =>
    request<Department>("/departments/", { method: "POST", body: JSON.stringify(data) }),
  updateDepartment: (id: number, data: { name?: string; emoji?: string }) =>
    request<Department>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDepartment: (id: number) =>
    request<{ deleted: boolean; boards_deleted: number; tasks_deleted: number }>(`/departments/${id}`, { method: "DELETE" }),

  // Boards
  boards: (departmentId?: number) =>
    request<Board[]>(`/boards/${departmentId ? `?department_id=${departmentId}` : ""}`),
  createBoard: (data: { name: string; description?: string; department_id: number; sort_order?: number }) =>
    request<Board>("/boards/", { method: "POST", body: JSON.stringify(data) }),
  updateBoard: (id: number, data: { name?: string; description?: string }) =>
    request<Board>(`/boards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBoard: (id: number) =>
    request<{ deleted: boolean; tasks_deleted: number }>(`/boards/${id}`, { method: "DELETE" }),

  // Agents
  agents: (params?: { department_id?: number; board_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.department_id) qs.set("department_id", String(params.department_id));
    if (params?.board_id) qs.set("board_id", String(params.board_id));
    const q = qs.toString();
    return request<Agent[]>(`/agents/${q ? `?${q}` : ""}`);
  },
  agent: (id: number) => request<Agent>(`/agents/${id}`),
  updateAgent: (id: number, data: Partial<Agent>) =>
    request<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAgent: (id: number) =>
    request<void>(`/agents/${id}`, { method: "DELETE" }),

  // Tasks
  tasks: (params?: { board_id?: number; status?: string; assigned_agent_id?: number; archived?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.board_id) qs.set("board_id", String(params.board_id));
    if (params?.status) qs.set("status", params.status);
    if (params?.assigned_agent_id) qs.set("assigned_agent_id", String(params.assigned_agent_id));
    if (params?.archived !== undefined) qs.set("archived", String(params.archived));
    const q = qs.toString();
    return request<Task[]>(`/tasks/${q ? `?${q}` : ""}`);
  },
  searchTasks: (query: string) =>
    request<Task[]>(`/tasks/search?q=${encodeURIComponent(query)}`),
  task: (id: number) => request<Task>(`/tasks/${id}`),
  createTask: (data: TaskCreate) =>
    request<Task>("/tasks/", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: number, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTask: (id: number) =>
    request<void>(`/tasks/${id}`, { method: "DELETE" }),

  // Comments
  comments: (taskId: number) => request<Comment[]>(`/tasks/${taskId}/comments/`),
  addComment: (taskId: number, content: string) =>
    request<Comment>(`/tasks/${taskId}/comments/`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // Mentions
  searchMentions: (query: string) =>
    request<MentionResult[]>(`/mentions/search?q=${encodeURIComponent(query)}`),

  // Gateway
  gatewayStatus: () => request<{ connected: boolean; pending_tasks: number }>("/gateway/status"),
  executeTask: (taskId: number) =>
    request<{ message: string; task_id: number; agent: string }>(`/gateway/tasks/${taskId}/execute`, {
      method: "POST",
    }),

  // Users (admin)
  users: () => request<UserFull[]>("/users"),
  createUser: (data: { name: string; email: string; password: string; role: string }) =>
    request<UserFull>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: { name?: string; email?: string; role?: string; password?: string; telegram_notifications?: boolean; telegram_user_id?: string | null }) =>
    request<UserFull>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),

  // Agents (create)
  createAgent: (data: AgentCreate) =>
    request<Agent>("/agents/", { method: "POST", body: JSON.stringify(data) }),

  // Gateways (admin)
  gateways: () => request<GatewayItem[]>("/gateways"),
  createGateway: (data: { name: string; websocket_url: string; token: string }) =>
    request<GatewayItem>("/gateways", { method: "POST", body: JSON.stringify(data) }),
  updateGateway: (id: number, data: { name?: string; websocket_url?: string; token?: string }) =>
    request<GatewayItem>(`/gateways/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteGateway: (id: number) =>
    request<void>(`/gateways/${id}`, { method: "DELETE" }),

  // Activity
  activity: (params?: { entity_type?: string; entity_id?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.entity_type) qs.set("entity_type", params.entity_type);
    if (params?.entity_id) qs.set("entity_id", String(params.entity_id));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<Activity[]>(`/activity/${q ? `?${q}` : ""}`);
  },
  activityPaginated: (params?: {
    department_id?: number;
    agent_id?: number;
    user_id?: number;
    action?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    per_page?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.department_id) qs.set("department_id", String(params.department_id));
    if (params?.agent_id) qs.set("agent_id", String(params.agent_id));
    if (params?.user_id) qs.set("user_id", String(params.user_id));
    if (params?.action) qs.set("action", params.action);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    const q = qs.toString();
    return request<ActivityPaginatedResponse>(`/activity/${q ? `?${q}` : ""}`);
  },

  // Dashboard
  dashboardStats: () => request<DashboardStats>("/dashboard/stats"),
  dashboardActivity: () => request<{ activities: DashboardActivity[] }>("/dashboard/activity"),

  // Notifications
  getNotifications: (params?: { read?: boolean; page?: number; per_page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.read !== undefined) qs.set("read", String(params.read));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    const q = qs.toString();
    return request<NotificationsResponse>(`/notifications/${q ? `?${q}` : ""}`);
  },
  getUnreadCount: () => request<{ count: number }>("/notifications/unread-count"),
  markNotificationRead: (id: number) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),

  // Agent stats & detail
  getAgentStats: (id: number) => request<AgentStats>(`/agents/${id}/stats`),
  getAgentStatusLog: (id: number) => request<AgentStatusLog>(`/agents/${id}/status-log`),
  getAgentTasks: (id: number, params?: { status?: string; page?: number; per_page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    const q = qs.toString();
    return request<AgentTasksResponse>(`/agents/${id}/tasks${q ? `?${q}` : ""}`);
  },

  // Attachments
  uploadAttachment: async (taskId: number, file: File): Promise<Attachment> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  },
  getAttachments: (taskId: number) =>
    request<AttachmentListResponse>(`/tasks/${taskId}/attachments`),
  downloadAttachmentUrl: (id: number): string => `${API_BASE}/api/attachments/${id}/download`,
  deleteAttachment: (id: number) =>
    request<void>(`/attachments/${id}`, { method: "DELETE" }),

  // Skills — CRUD
  skills: (params?: { search?: string; category?: string; tag?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category) qs.set("category", params.category);
    if (params?.tag) qs.set("tag", params.tag);
    const q = qs.toString();
    return request<SkillSummary[]>(`/skills${q ? `?${q}` : ""}`);
  },
  skill: (id: number) => request<Skill>(`/skills/${id}`),
  createSkill: (data: SkillCreate) =>
    request<Skill>("/skills", { method: "POST", body: JSON.stringify(data) }),
  updateSkill: (id: number, data: SkillUpdate) =>
    request<Skill>(`/skills/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSkill: (id: number) =>
    request<void>(`/skills/${id}`, { method: "DELETE" }),
  getSkillContent: (id: number) =>
    fetch(`${API_BASE}/api/skills/${id}/content`, {
      headers: { Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") : ""}` },
    }).then((r) => r.text()),
  exportSkillUrl: (id: number): string => `${API_BASE}/api/skills/${id}/export`,
  importSkill: async (file: File): Promise<Skill> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/skills/import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  },
  getSkillAgents: (skillId: number) =>
    request<SkillAgent[]>(`/skills/${skillId}/agents`),

  // Skills — Attachments
  getSkillAttachments: (skillId: number) =>
    request<SkillAttachment[]>(`/skills/${skillId}/attachments`),
  uploadSkillAttachment: async (skillId: number, file: File, description?: string): Promise<SkillAttachment> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    if (description) formData.append("description", description);
    const res = await fetch(`${API_BASE}/api/skills/${skillId}/attachments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  },
  downloadSkillAttachmentUrl: (attachmentId: number): string =>
    `${API_BASE}/api/skill-attachments/${attachmentId}/download`,
  deleteSkillAttachment: (attachmentId: number) =>
    request<void>(`/skill-attachments/${attachmentId}`, { method: "DELETE" }),

  // Skills — Agent assignments
  getAgentSkills: (agentId: number) =>
    request<AgentSkill[]>(`/agents/${agentId}/skills`),
  assignAgentSkills: (agentId: number, skillIds: number[]) =>
    request<AgentSkill[]>(`/agents/${agentId}/skills`, {
      method: "POST",
      body: JSON.stringify({ skill_ids: skillIds }),
    }),
  unassignAgentSkill: (agentId: number, skillId: number) =>
    request<void>(`/agents/${agentId}/skills/${skillId}`, { method: "DELETE" }),
  getAgentActiveSkills: (agentId: number, params?: { board_id?: number; task_tags?: string[] }) => {
    const qs = new URLSearchParams();
    if (params?.board_id) qs.set("board_id", String(params.board_id));
    if (params?.task_tags?.length) qs.set("task_tags", params.task_tags.join(","));
    const q = qs.toString();
    return request<ActiveSkillsResponse>(`/agents/${agentId}/active-skills${q ? `?${q}` : ""}`);
  },
  // AI Models
  aiModels: () => request<AIModel[]>("/models/"),
  createAIModel: (data: AIModelCreate) =>
    request<AIModel>("/models/", { method: "POST", body: JSON.stringify(data) }),
  updateAIModel: (id: number, data: Partial<AIModelCreate>) =>
    request<AIModel>(`/models/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAIModel: (id: number) =>
    request<void>(`/models/${id}`, { method: "DELETE" }),
  testAIModel: (id: number) =>
    request<{ success: boolean; message: string }>(`/models/${id}/test`, { method: "POST" }),
  setDefaultAIModel: (id: number) =>
    request<AIModel>(`/models/${id}/set-default`, { method: "POST" }),

  // BYOK Model Settings
  getModelConfig: () => request<ModelConfig>("/settings/model"),
  updateModelConfig: (data: ModelConfigUpdate) =>
    request<ModelConfig>("/settings/model", { method: "PUT", body: JSON.stringify(data) }),
  testModelConnection: (data: { provider: string; api_key: string; base_url?: string }) =>
    request<ModelTestResult>("/settings/model/test", { method: "POST", body: JSON.stringify(data) }),
  getModelProviders: () => request<Record<string, ProviderInfo>>("/settings/model/providers"),
  getModelUsage: (days?: number) =>
    request<ModelUsageResponse>(`/settings/model/usage${days ? `?days=${days}` : ""}`),

  // Onboarding
  onboardingStatus: () => request<OnboardingStatus>("/onboarding/status"),
  onboardingTemplates: () => request<OnboardingTemplates>("/onboarding/templates"),
  onboardingStep2: (data: { org_name: string; admin_email: string; admin_password: string; admin_name: string }) =>
    request<OnboardingStepResult & { token?: string; org_id?: number; admin_id?: number }>("/onboarding/step/2", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingStep3: (data: { provider: string; model_name: string; api_key: string; base_url?: string }) =>
    request<OnboardingStepResult>("/onboarding/step/3", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingStep4: (data: { templates: string[]; custom_departments?: Array<{ name: string; emoji?: string; boards: string[] }> }) =>
    request<OnboardingStepResult & { departments_created?: Array<{ name: string; board_count: number }> }>("/onboarding/step/4", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingAgentLimit: () =>
    request<{ max_agents: number; plan: string }>("/onboarding/agent-limit"),
  onboardingStep5: (data: { agent_packs: string[]; custom_agents?: Array<{ name: string; role_title?: string; system_prompt?: string }> }) =>
    request<OnboardingStepResult & { agents_created?: string[] }>("/onboarding/step/5", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingStep6: (data: { bot_token?: string; allowed_user_ids?: string }) =>
    request<OnboardingStepResult>("/onboarding/step/6", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingStep7: (data: { members: Array<{ email: string; name: string; role: string }> }) =>
    request<OnboardingStepResult & { members_created?: Array<{ name: string; email: string; temp_password: string }> }>("/onboarding/step/7", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  onboardingStep8: () =>
    request<OnboardingStepResult & { redirect?: string }>("/onboarding/step/8", { method: "POST" }),
  onboardingSkip: (step: number) =>
    request<OnboardingStepResult>(`/onboarding/skip/${step}`, { method: "POST" }),

  // Org Settings
  getOrgGeneral: () => request<OrgGeneralSettings>("/org-settings/general"),
  updateOrgGeneral: (data: { org_name: string; timezone: string }) =>
    request<{ success: boolean }>("/org-settings/general", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  uploadOrgLogo: async (file: File): Promise<{ success: boolean; logo_url: string }> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/org-settings/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  },
  getOrgTokens: () => request<{ tokens: OrgServiceToken[] }>("/org-settings/tokens"),
  createOrgToken: (name: string) =>
    request<{ id: number; name: string; token: string; prefix: string; message: string }>("/org-settings/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeOrgToken: (tokenId: number) =>
    request<{ success: boolean }>(`/org-settings/tokens/${tokenId}`, { method: "DELETE" }),
  getOrgNotificationPrefs: () =>
    request<{ email_notifications: boolean; telegram_notifications: boolean }>("/org-settings/notifications"),
  updateOrgNotificationPrefs: (data: { email_notifications: boolean; telegram_notifications: boolean }) =>
    request<{ success: boolean }>("/org-settings/notifications", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  exportOrgData: (): string => `${API_BASE}/api/org-settings/export`,

  // Board Permissions
  getBoardPermissions: (boardId: number) =>
    request<BoardPermission[]>(`/boards/${boardId}/permissions`),
  grantBoardPermission: (boardId: number, data: { user_id: number; permission_level: string }) =>
    request<BoardPermission>(`/boards/${boardId}/permissions`, { method: "POST", body: JSON.stringify(data) }),
  updateBoardPermission: (boardId: number, permId: number, data: { permission_level: string }) =>
    request<BoardPermission>(`/boards/${boardId}/permissions/${permId}`, { method: "PATCH", body: JSON.stringify(data) }),
  revokeBoardPermission: (boardId: number, permId: number) =>
    request<void>(`/boards/${boardId}/permissions/${permId}`, { method: "DELETE" }),

  // Marketplace
  marketplaceTemplates: (params?: { type?: string; category?: string; q?: string; sort?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.page_size) qs.set("page_size", String(params.page_size));
    const q = qs.toString();
    return request<MarketplacePaginatedResponse>(`/marketplace/templates${q ? `?${q}` : ""}`);
  },
  marketplaceTemplate: (slug: string) =>
    request<MarketplaceTemplateDetail>(`/marketplace/templates/${slug}`),
  marketplaceManifest: (slug: string) =>
    request<Record<string, unknown>>(`/marketplace/templates/${slug}/manifest`),
  marketplaceCategories: () =>
    request<MarketplaceCategory[]>("/marketplace/categories"),
  marketplaceFeatured: () =>
    request<MarketplaceTemplateDetail[]>("/marketplace/featured"),
  marketplaceReviews: (slug: string, page = 1, pageSize = 10) =>
    request<MarketplaceReviewsResponse>(`/marketplace/templates/${slug}/reviews?page=${page}&page_size=${pageSize}`),
  marketplaceSubmitReview: (slug: string, data: { rating: number; title?: string; body?: string }) =>
    request<MarketplaceReview>(`/marketplace/templates/${slug}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  marketplacePreInstallCheck: (templateSlug: string, customizations?: Record<string, unknown>) =>
    request<MarketplacePreInstallCheck>("/marketplace/pre-install-check", {
      method: "POST",
      body: JSON.stringify({ template_slug: templateSlug, customizations }),
    }),
  marketplaceInstall: (templateSlug: string, customizations?: Record<string, unknown>) =>
    request<MarketplaceInstallResult>("/marketplace/install", {
      method: "POST",
      body: JSON.stringify({ template_slug: templateSlug, customizations }),
    }),
  marketplaceUninstall: (installedTemplateId: number) =>
    request<{ success: boolean }>("/marketplace/uninstall", {
      method: "POST",
      body: JSON.stringify({ installed_template_id: installedTemplateId }),
    }),
  marketplaceInstalled: (type?: string) => {
    const qs = type ? `?type=${type}` : "";
    return request<InstalledTemplate[]>(`/marketplace/installed${qs}`);
  },
  marketplaceExportAgent: (agentId: number) =>
    request<Record<string, unknown>>(`/marketplace/export/agent/${agentId}`, { method: "POST" }),
  marketplaceExportSkill: (skillId: number) =>
    request<Record<string, unknown>>(`/marketplace/export/skill/${skillId}`, { method: "POST" }),
  // Review actions
  marketplaceUpvoteReview: (reviewId: string) =>
    request<Record<string, unknown>>(`/marketplace/reviews/${reviewId}/helpful`, { method: "POST" }),
  marketplaceFlagReview: (reviewId: string, reason: string) =>
    request<Record<string, unknown>>(`/marketplace/reviews/${reviewId}/flag`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  marketplaceRespondToReview: (reviewId: string, body: string) =>
    request<Record<string, unknown>>(`/marketplace/reviews/${reviewId}/respond`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  // Community
  marketplaceCommunityFeed: (limit = 20) =>
    request<MarketplaceFeedItem[]>(`/marketplace/community/feed?limit=${limit}`),
  marketplaceLeaderboard: (limit = 10) =>
    request<MarketplaceLeaderboardItem[]>(`/marketplace/community/leaderboard?limit=${limit}`),
  marketplaceCreators: (page = 1, pageSize = 20) =>
    request<MarketplaceCreatorsResponse>(`/marketplace/creators?page=${page}&page_size=${pageSize}`),
  marketplaceCreator: (username: string) =>
    request<MarketplaceCreatorProfile>(`/marketplace/creators/${username}`),
  marketplaceOwnProfile: () =>
    request<MarketplaceCreatorProfile>("/marketplace/profile"),
  marketplaceUpdateProfile: (data: { username?: string; display_name?: string; bio?: string; website?: string }) =>
    request<MarketplaceCreatorProfile>("/marketplace/profile", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // Submissions
  marketplaceSubmit: (data: MarketplaceSubmitRequest) =>
    request<MarketplaceSubmissionResponse>("/marketplace/submit", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  marketplaceSubmissions: (page = 1, pageSize = 20) =>
    request<MarketplaceSubmissionsResponse>(`/marketplace/submissions?page=${page}&page_size=${pageSize}`),
  marketplaceSubmission: (id: string) =>
    request<MarketplaceSubmissionDetail>(`/marketplace/submissions/${id}`),

  // Workflows
  workflows: (params?: { is_active?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
    const q = qs.toString();
    return request<WorkflowListItem[]>(`/workflows${q ? `?${q}` : ""}`);
  },
  workflow: (id: number) => request<WorkflowDetail>(`/workflows/${id}`),
  createWorkflow: (data: { name: string; description?: string; trigger_type?: string; steps?: WorkflowStepCreate[] }) =>
    request<WorkflowDetail>("/workflows", { method: "POST", body: JSON.stringify(data) }),
  updateWorkflow: (id: number, data: Partial<WorkflowListItem>) =>
    request<WorkflowListItem>(`/workflows/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkflow: (id: number) =>
    request<void>(`/workflows/${id}`, { method: "DELETE" }),
  workflowSteps: (wfId: number) =>
    request<WorkflowStepItem[]>(`/workflows/${wfId}/steps`),
  addWorkflowStep: (wfId: number, data: WorkflowStepCreate) =>
    request<WorkflowStepItem>(`/workflows/${wfId}/steps`, { method: "POST", body: JSON.stringify(data) }),
  updateWorkflowStep: (stepId: number, data: Partial<WorkflowStepCreate>) =>
    request<WorkflowStepItem>(`/workflow-steps/${stepId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkflowStep: (stepId: number) =>
    request<void>(`/workflow-steps/${stepId}`, { method: "DELETE" }),
  bulkUpdateWorkflowSteps: (wfId: number, steps: WorkflowStepCreate[]) =>
    request<WorkflowStepItem[]>(`/workflows/${wfId}/steps/bulk`, { method: "PUT", body: JSON.stringify(steps) }),
  startWorkflowExecution: (wfId: number, input_data?: Record<string, unknown>) =>
    request<WorkflowExecutionDetail>(`/workflows/${wfId}/execute`, { method: "POST", body: JSON.stringify({ input_data }) }),
  workflowExecutions: (wfId: number, status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return request<WorkflowExecutionListItem[]>(`/workflows/${wfId}/executions${qs}`);
  },
  workflowExecution: (execId: number) =>
    request<WorkflowExecutionDetail>(`/workflow-executions/${execId}`),
  cancelWorkflowExecution: (execId: number) =>
    request<{ ok: boolean }>(`/workflow-executions/${execId}/cancel`, { method: "POST" }),
  retryWorkflowExecution: (execId: number) =>
    request<WorkflowExecutionDetail>(`/workflow-executions/${execId}/retry`, { method: "POST" }),
  installWorkflow: (template_slug: string, agent_mapping?: Record<string, number>) =>
    request<Record<string, unknown>>("/workflows/install", { method: "POST", body: JSON.stringify({ template_slug, agent_mapping }) }),

  // Plugins
  plugins: () => request<InstalledPlugin[]>("/plugins"),
  plugin: (id: number) => request<InstalledPlugin>(`/plugins/${id}`),
  installPlugin: (template_slug: string) =>
    request<InstalledPlugin>("/plugins/install", { method: "POST", body: JSON.stringify({ template_slug }) }),
  updatePlugin: (id: number, data: { settings?: Record<string, unknown>; credentials?: Record<string, unknown> }) =>
    request<InstalledPlugin>(`/plugins/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  uninstallPlugin: (id: number) =>
    request<void>(`/plugins/${id}`, { method: "DELETE" }),
  testPluginConnection: (id: number) =>
    request<PluginTestResult>(`/plugins/${id}/test`, { method: "POST" }),
  executePluginCapability: (id: number, data: { capability_id: string; parameters?: Record<string, unknown>; agent_id?: number }) =>
    request<PluginExecutionResult>(`/plugins/${id}/execute`, { method: "POST", body: JSON.stringify(data) }),
  pluginExecutions: (id: number, limit?: number) =>
    request<PluginExecutionResult[]>(`/plugins/${id}/executions${limit ? `?limit=${limit}` : ""}`),

  // Backups
  getBackups: (page = 1, perPage = 20) =>
    request<BackupListResponse>(`/backups?page=${page}&per_page=${perPage}`),
  createBackup: () =>
    request<BackupItem>("/backups", { method: "POST" }),
  deleteBackup: (id: string) =>
    request<void>(`/backups/${id}`, { method: "DELETE" }),
  downloadBackupUrl: (id: string): string => `${API_BASE}/api/backups/${id}/download`,
  getBackupSettings: () =>
    request<BackupSettings>("/backups/settings"),
  updateBackupSettings: (data: Partial<BackupSettings>) =>
    request<BackupSettings>("/backups/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Agent Plugins
  agentPlugins: (agentId: number) =>
    request<AgentPluginItem[]>(`/agents/${agentId}/plugins`),
  assignAgentPlugin: (agentId: number, data: { plugin_id: number; capabilities?: string[] }) =>
    request<AgentPluginItem>(`/agents/${agentId}/plugins`, { method: "POST", body: JSON.stringify(data) }),
  removeAgentPlugin: (agentId: number, pluginId: number) =>
    request<void>(`/agents/${agentId}/plugins/${pluginId}`, { method: "DELETE" }),
  agentCapabilities: (agentId: number) =>
    request<AgentCapabilityItem[]>(`/agents/${agentId}/capabilities`),
};

// Types
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  telegram_notifications?: boolean;
  telegram_user_id?: string | null;
}

export interface Department {
  id: number;
  name: string;
  emoji?: string | null;
  sort_order: number;
  created_at: string;
}

export interface Board {
  id: number;
  name: string;
  description?: string | null;
  department_id: number;
  department?: Department;
  created_at: string;
  user_permission?: string | null; // "view" | "create" | "manage" | null (admin)
}

export interface Agent {
  id: number;
  name: string;
  role_title: string;
  department_id: number;
  primary_board_id: number;
  system_prompt: string | null;
  status: string;
  execution_mode: string;
  ai_model_id: number | null;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  board_id: number;
  assigned_agent_id: number | null;
  assigned_agent: Agent | null;
  created_by_user_id: number;
  created_by: User | null;
  due_date: string | null;
  requires_approval: boolean;
  result: string | null;
  tags: string[] | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  priority?: string;
  board_id: number;
  assigned_agent_id?: number;
  due_date?: string;
  requires_approval?: boolean;
  tags?: string[];
}

export interface Comment {
  id: number;
  task_id: number;
  author_type: string;
  author_id: number;
  author_name: string | null;
  content: string;
  mentions: { users?: number[]; agents?: number[] } | null;
  created_at: string;
}

export interface UserFull {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string | null;
  telegram_notifications?: boolean;
  telegram_user_id?: string | null;
}

export interface AgentCreate {
  name: string;
  role_title: string;
  department_id: number;
  primary_board_id: number;
  system_prompt: string;
  execution_mode: string;
}

export interface GatewayItem {
  id: number;
  name: string;
  websocket_url: string;
  connected?: boolean;
  created_at: string | null;
}

export interface Activity {
  id: number;
  actor_type: string;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardActivity {
  id: number;
  actor_type: string;
  actor_id: number | null;
  actor_name: string;
  actor_department: string | null;
  action: string;
  target_type: string;
  target_id: number;
  metadata: Record<string, unknown>;
  board_department: string | null;
  created_at: string;
}

export interface DashboardStats {
  agents: { total: number; online: number };
  tasks: {
    in_progress: number;
    awaiting_review: number;
    completed_today: number;
  };
  departments: DepartmentStats[];
}

export interface DepartmentStats {
  id: number;
  name: string;
  emoji: string;
  agent_count: number;
  tasks: { todo: number; in_progress: number; review: number; done: number };
}

export interface ActivityPaginatedResponse {
  activities: DashboardActivity[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  target_type: string | null;
  target_id: number | null;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unread_count: number;
  total: number;
  page: number;
  per_page: number;
}

export interface AgentStats {
  tasks_completed: {
    total: number;
    this_week: number;
    this_month: number;
  };
  average_completion_time_minutes: number | null;
  tasks_assigned: {
    todo: number;
    in_progress: number;
    review: number;
    done: number;
  };
  success_rate: number;
  total_tasks: number;
}

export interface AgentStatusLog {
  events: Array<{
    status: string;
    timestamp: string;
  }>;
}

export interface AgentTaskItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  board_id: number;
  board_name: string;
  created_at: string | null;
  updated_at: string | null;
  due_date: string | null;
  result_preview: string | null;
}

export interface AgentTasksResponse {
  tasks: AgentTaskItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface Attachment {
  id: number;
  filename: string;
  file_size: number;
  mime_type: string;
  uploaded_by: { type: string; name: string };
  created_at: string;
  download_url: string;
}

export interface AttachmentListResponse {
  attachments: Attachment[];
}

export interface MentionResult {
  id: string;
  name: string;
  type: "agent" | "user";
  role: string;
  department?: string;
}

// Skills types
export interface SkillSummary {
  id: number;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  activation_mode: string;
  is_system: boolean;
  created_at: string | null;
  updated_at: string | null;
  agent_count: number;
  attachment_count: number;
}

export interface SkillAttachment {
  id: number;
  filename: string;
  original_filename: string;
  description: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string | null;
  download_url: string | null;
}

export interface Skill extends SkillSummary {
  content: string | null;
  activation_boards: number[] | null;
  activation_tags: string[] | null;
  created_by: number | null;
  attachments: SkillAttachment[] | null;
}

export interface SkillCreate {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  tags?: string[];
  content?: string;
  activation_mode?: string;
  activation_boards?: number[];
  activation_tags?: string[];
}

export interface SkillUpdate {
  name?: string;
  slug?: string;
  description?: string;
  category?: string;
  tags?: string[];
  content?: string;
  activation_mode?: string;
  activation_boards?: number[];
  activation_tags?: string[];
}

export interface AgentSkill {
  id: number;
  agent_id: number;
  skill_id: number;
  skill_name: string;
  skill_slug: string;
  skill_description: string | null;
  skill_category: string | null;
  skill_tags: string[] | null;
  activation_mode: string;
  attachment_count: number;
  assigned_at: string | null;
}

export interface SkillAgent {
  id: number;
  name: string;
  role_title: string;
  status: string;
}

export interface ActiveSkillsResponse {
  agent_id: number;
  board_id: number | null;
  task_tags: string[] | null;
  active_skills: Array<{
    id: number;
    name: string;
    slug: string;
    activation_mode: string;
  }>;
  context_length: number;
  context: string;
}

// AI Model types
export interface AIModel {
  id: number;
  provider: string;
  model_name: string;
  display_name: string;
  base_url: string;
  is_default: boolean;
  is_active: boolean;
  has_api_key: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIModelCreate {
  provider: string;
  model_name: string;
  display_name: string;
  api_key?: string;
  base_url: string;
  is_default?: boolean;
}

// BYOK Model Settings types
export interface ModelConfig {
  provider: string | null;
  model_name: string | null;
  model_display_name: string | null;
  base_url: string | null;
  context_window: number | null;
  max_tokens: number | null;
  has_api_key: boolean;
  api_key_masked: string | null;
}

export interface ModelConfigUpdate {
  provider: string;
  model_name: string;
  api_key?: string;
  base_url?: string;
  display_name?: string;
  context_window?: number;
  max_tokens?: number;
}

export interface ModelTestResult {
  status: string;
  message: string;
  models?: Array<{ id: string; name: string }>;
}

export interface ProviderInfo {
  name: string;
  base_url: string;
  api_type: string;
  key_prefix: string;
  default_model: string;
  models: Array<{
    id: string;
    name: string;
    context_window: number;
    max_tokens: number;
  }>;
}

export interface ModelUsageResponse {
  period_days: number;
  total: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    requests: number;
  };
  daily: Array<{
    date: string;
    tokens: number;
    requests: number;
  }>;
  per_agent: Array<{
    agent_id: number | null;
    agent_name: string;
    tokens: number;
    requests: number;
  }>;
}

// Board Permission types
// Onboarding types
export interface OnboardingStatus {
  needs_onboarding: boolean;
  current_step: number;
  state_id?: number;
}

export interface OnboardingStepResult {
  success: boolean;
  next_step?: number;
  completed?: boolean;
}

export interface OnboardingTemplates {
  departments: Array<{
    key: string;
    name: string;
    emoji: string;
    boards: number;
    description: string;
  }>;
  agent_packs: Array<{
    key: string;
    name: string;
    agents: string[];
    count: number;
  }>;
}

// Org settings types
export interface OrgGeneralSettings {
  org_name: string;
  timezone: string;
  max_agents: number;
  logo_url: string | null;
}

export interface OrgServiceToken {
  id: number;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface BoardPermission {
  id: number;
  board_id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  permission_level: string;
  granted_by_user_id: number | null;
  created_at: string;
}

// Marketplace types
export interface MarketplaceAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_official: boolean;
}

export interface MarketplaceTemplateDetail {
  id: string;
  slug: string;
  type: string;
  name: string;
  emoji: string | null;
  version: string;
  author: MarketplaceAuthor;
  description: string;
  long_description: string | null;
  category_slug: string;
  category_name: string;
  tags: string[];
  icon_url: string | null;
  screenshots: string[];
  is_official: boolean;
  is_featured: boolean;
  install_count: number;
  rating_avg: number;
  rating_count: number;
  min_helix_version: string;
  min_plan: string;
  published_at: string | null;
}

export interface MarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  template_count: number;
}

export interface MarketplaceReview {
  id: string;
  reviewer_name: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  helpful_count: number;
  created_at: string;
  response?: {
    body: string;
    creator_username: string | null;
    created_at: string | null;
  } | null;
}

export interface MarketplacePaginatedResponse {
  items: MarketplaceTemplateDetail[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface MarketplaceReviewsResponse {
  items: MarketplaceReview[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface MarketplacePreInstallCheck {
  can_install: boolean;
  already_installed: boolean;
  agent_name_conflict: boolean;
  suggested_name: string;
  department_exists: boolean;
  department_name: string;
  board_exists: boolean;
  board_name: string;
  plan_limit_ok: boolean;
  current_installs: number;
  max_installs: number;
  reason: string | null;
}

export interface MarketplaceInstallResult {
  success: boolean;
  agent_id?: number;
  skill_id?: number;
  agent_name?: string;
  skill_name?: string;
  department_id?: number;
  board_id?: number;
  template_slug: string;
  skills_installed?: string[];
}

export interface InstalledTemplate {
  id: number;
  org_id: number;
  template_slug: string;
  template_type: string;
  template_name: string;
  template_version: string;
  local_resource_id: number;
  local_resource_type: string;
  installed_by: number | null;
  installed_at: string;
  is_active: boolean;
}

// Community / Creator types
export interface MarketplaceFeedItem {
  type: string;
  title: string;
  description: string | null;
  template_slug: string | null;
  creator_username: string | null;
  timestamp: string;
}

export interface MarketplaceLeaderboardItem {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_official: boolean;
  template_count: number;
  total_installs: number;
  average_rating: number;
}

export interface MarketplaceCreatorProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  is_verified: boolean;
  is_official: boolean;
  template_count: number;
  total_installs: number;
  created_at: string | null;
  templates: MarketplaceTemplateDetail[];
}

export interface MarketplaceCreatorsResponse {
  items: MarketplaceLeaderboardItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface MarketplaceSubmitRequest {
  name: string;
  template_type: string;
  description?: string;
  long_description?: string;
  category_slug: string;
  tags?: string[];
  emoji?: string;
  manifest: Record<string, unknown>;
  version?: string;
  min_helix_version?: string;
  creator_username?: string;
  creator_display_name?: string;
}

export interface MarketplaceSubmissionResponse {
  id: string;
  template_id: string;
  status: string;
  submitted_at: string | null;
}

export interface MarketplaceSubmissionDetail {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  reviewer_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface MarketplaceSubmissionsResponse {
  items: MarketplaceSubmissionDetail[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// Workflow types
export interface WorkflowStepItem {
  id: number;
  step_id: string;
  name: string;
  agent_id: number | null;
  agent_name: string | null;
  agent_emoji: string | null;
  action_prompt: string | null;
  depends_on: string[];
  timeout_minutes: number;
  requires_approval: boolean;
  step_order: number;
  position_x: number;
  position_y: number;
  config: Record<string, unknown> | null;
}

export interface WorkflowStepCreate {
  step_id: string;
  name: string;
  agent_id?: number | null;
  action_prompt?: string | null;
  depends_on?: string[];
  timeout_minutes?: number;
  requires_approval?: boolean;
  step_order?: number;
  position_x?: number;
  position_y?: number;
  config?: Record<string, unknown> | null;
}

export interface WorkflowListItem {
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean;
  marketplace_template_slug: string | null;
  step_count: number;
  agent_count: number;
  last_execution: { id: number; status: string; started_at: string } | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDetail extends WorkflowListItem {
  steps: WorkflowStepItem[];
}

export interface WorkflowStepExecution {
  id: number;
  step_id: string;
  step_name: string | null;
  task_id: number | null;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped";
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface WorkflowExecutionDetail {
  id: number;
  workflow_id: number;
  workflow_name: string | null;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  started_by: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  step_executions: WorkflowStepExecution[];
  progress: { completed: number; total: number } | null;
}

export interface WorkflowExecutionListItem {
  id: number;
  workflow_id: number;
  status: string;
  started_by: number | null;
  started_at: string;
  completed_at: string | null;
  progress: { completed: number; total: number } | null;
}

// Plugin types
export interface PluginCapability {
  id: string;
  name: string;
  description: string | null;
  method: string | null;
  parameters: Array<{
    key: string;
    label?: string;
    type?: string;
    required?: boolean;
    default?: string;
    description?: string;
  }> | null;
}

export interface PluginSettingDefinition {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description: string | null;
  default: string | null;
}

export interface InstalledPlugin {
  id: number;
  plugin_slug: string;
  name: string;
  emoji: string | null;
  description: string | null;
  plugin_type: string;
  is_active: boolean;
  is_configured: boolean;
  marketplace_template_slug: string | null;
  installed_by: number | null;
  installed_at: string;
  last_used_at: string | null;
  capabilities: PluginCapability[];
  setting_definitions: PluginSettingDefinition[];
  masked_credentials: Record<string, string> | null;
  settings: Record<string, unknown> | null;
  connected_agent_count: number;
}

export interface PluginTestResult {
  success: boolean;
  message: string;
  duration_ms: number;
}

export interface PluginExecutionResult {
  id: number;
  plugin_id: number | null;
  agent_id: number | null;
  capability_id: string;
  capability_name: string | null;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  executed_at: string;
  request_data: Record<string, unknown> | null;
  response_summary: Record<string, unknown> | null;
}

export interface AgentPluginItem {
  id: number;
  agent_id: number;
  plugin_id: number;
  plugin_name: string;
  plugin_emoji: string | null;
  plugin_slug: string;
  is_configured: boolean;
  capabilities: string[] | null;
  available_capabilities: PluginCapability[];
}

export interface AgentCapabilityItem {
  plugin_id: number;
  plugin_name: string;
  plugin_emoji: string | null;
  capability_id: string;
  capability_name: string;
  description: string | null;
  method: string | null;
}

// Backup types
export interface BackupItem {
  id: string;
  filename: string;
  file_size_bytes: number | null;
  backup_type: string;
  status: string;
  error_message: string | null;
  created_at: string | null;
}

export interface BackupListResponse {
  backups: BackupItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface BackupSettings {
  backup_enabled: boolean;
  backup_schedule: string;
  backup_time: string;
  backup_day: string;
  backup_retention_days: number;
}
