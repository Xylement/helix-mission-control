"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, type SkillSummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Search,
  Plus,
  Users,
  Paperclip,
  Eye,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  { value: "_all", label: "All Categories" },
  { value: "copywriting", label: "Copywriting" },
  { value: "branding", label: "Branding" },
  { value: "social-media", label: "Social Media" },
  { value: "email", label: "Email" },
  { value: "customer-service", label: "Customer Service" },
  { value: "advertising", label: "Advertising" },
  { value: "seo", label: "SEO" },
  { value: "reporting", label: "Reporting" },
  { value: "development", label: "Development" },
];

const CATEGORY_ICONS: Record<string, string> = {
  copywriting: "✍️",
  branding: "🎨",
  "social-media": "📱",
  email: "📧",
  "customer-service": "💬",
  advertising: "📢",
  seo: "🔍",
  reporting: "📊",
  development: "💻",
};

const ACTIVATION_DOT: Record<string, string> = {
  always: "bg-green-500",
  board: "bg-blue-500",
  tag: "bg-amber-500",
};

const ACTIVATION_LABEL: Record<string, string> = {
  always: "Always active",
  board: "Board-specific",
  tag: "Tag-specific",
};

export default function SkillsPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const isAdmin = currentUser?.role === "admin";

  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("_all");
  const [tagFilter, setTagFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSkills = useCallback(
    async (s?: string, cat?: string, tag?: string) => {
      try {
        const params: { search?: string; category?: string; tag?: string } = {};
        if (s) params.search = s;
        if (cat && cat !== "_all") params.category = cat;
        if (tag) params.tag = tag;
        const data = await api.skills(
          Object.keys(params).length > 0 ? params : undefined
        );
        setSkills(data);
      } catch (err: unknown) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load skills"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSkills(value, category, tagFilter);
    }, 300);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    fetchSkills(search, value, tagFilter);
  };

  const handleTagFilter = (value: string) => {
    setTagFilter(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSkills(search, category, value);
    }, 300);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("_all");
    setTagFilter("");
    fetchSkills();
  };

  const hasFilters = search || category !== "_all" || tagFilter;

  // Collect all unique tags for display
  const allTags = Array.from(
    new Set(skills.flatMap((s) => s.tags || []))
  ).sort();

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="animate-in-page space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-9 w-36 rounded-lg skeleton-shimmer" />
            <div className="h-5 w-52 rounded-md skeleton-shimmer mt-2" />
          </div>
          <div className="h-10 w-32 rounded-md skeleton-shimmer" />
        </div>
        {/* Filter skeleton */}
        <div className="flex gap-3">
          <div className="h-10 w-64 rounded-md skeleton-shimmer" />
          <div className="h-10 w-44 rounded-md skeleton-shimmer" />
        </div>
        {/* Card skeletons */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl skeleton-shimmer flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-40 rounded-md skeleton-shimmer" />
                      <div className="h-4 w-full rounded-md skeleton-shimmer" />
                      <div className="h-4 w-3/4 rounded-md skeleton-shimmer" />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-5 w-20 rounded-full skeleton-shimmer" />
                    <div className="h-5 w-16 rounded-full skeleton-shimmer" />
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/50">
                    <div className="h-4 w-20 rounded-md skeleton-shimmer" />
                    <div className="h-4 w-20 rounded-md skeleton-shimmer" />
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skills Library</h1>
          <p className="text-muted-foreground">
            {skills.length} skill{skills.length !== 1 ? "s" : ""} available
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => router.push("/skills/new")}>
            <Plus className="h-4 w-4 mr-2" /> Create Skill
          </Button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search skills..."
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.value !== "_all" && CATEGORY_ICONS[opt.value]
                  ? `${CATEGORY_ICONS[opt.value]} `
                  : ""}
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative max-w-[180px]">
          <Input
            value={tagFilter}
            onChange={(e) => handleTagFilter(e.target.value)}
            placeholder="Filter by tag..."
            className="pr-8"
          />
          {tagFilter && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => handleTagFilter("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Tag quick-filter chips */}
      {allTags.length > 0 && !tagFilter && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.slice(0, 12).map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagFilter(tag)}
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {tag}
            </button>
          ))}
          {allTags.length > 12 && (
            <span className="text-xs text-muted-foreground py-0.5">
              +{allTags.length - 12} more
            </span>
          )}
        </div>
      )}

      {/* Skills Grid */}
      {skills.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Card
              key={skill.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group overflow-hidden"
              onClick={() => router.push(`/skills/${skill.id}`)}
            >
              <CardContent className="p-5">
                {/* Title row */}
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors text-lg">
                    {skill.category && CATEGORY_ICONS[skill.category]
                      ? CATEGORY_ICONS[skill.category]
                      : "📝"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate">{skill.name}</h3>
                      <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                        v{skill.version}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Category + Tags */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {skill.category && (
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {skill.category}
                    </Badge>
                  )}
                  {(skill.tags || []).slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {(skill.tags || []).length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{(skill.tags || []).length - 3} more
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {skill.agent_count} agent
                      {skill.agent_count !== 1 ? "s" : ""}
                    </span>
                    {skill.attachment_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {skill.attachment_count} file
                        {skill.attachment_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        ACTIVATION_DOT[skill.activation_mode] || ACTIVATION_DOT.always
                      }`}
                    />
                    <span className="capitalize">
                      {ACTIVATION_LABEL[skill.activation_mode] || skill.activation_mode}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/skills/${skill.id}`);
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1" /> View
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/skills/${skill.id}/edit`);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <BookOpen className="h-10 w-10 text-primary/60" />
          </div>
          {hasFilters ? (
            <>
              <h3 className="text-lg font-semibold mb-1">No skills match your filters</h3>
              <p className="text-muted-foreground text-sm max-w-md mb-4">
                Try adjusting your search or clearing the filters.
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-1">
                No skills yet
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mb-6">
                Skills are markdown-based knowledge documents that teach your
                agents how to perform specific types of work. Create your first
                skill to get started.
              </p>
              {isAdmin && (
                <Button onClick={() => router.push("/skills/new")}>
                  <Sparkles className="h-4 w-4 mr-2" /> Create your first skill
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
