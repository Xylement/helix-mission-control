"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type MarketplaceTemplateDetail,
  type MarketplaceCategory,
} from "@/lib/api";
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
  Store,
  Search,
  Star,
  Download,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { CommunitySection } from "@/components/marketplace/CommunitySection";
import { useBranding } from "@/contexts/BrandingContext";

const TYPE_OPTIONS = [
  { value: "_all", label: "All Types" },
  { value: "agent", label: "Agents" },
  { value: "skill", label: "Skills" },
  { value: "workflow", label: "Workflows" },
  { value: "plugin", label: "Plugins" },
  { value: "department_pack", label: "Department Packs" },
];

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "rated", label: "Highest Rated" },
  { value: "newest", label: "Newest" },
  { value: "alphabetical", label: "A-Z" },
];

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

function TemplateCard({
  template,
  installed,
  onClick,
}: {
  template: MarketplaceTemplateDetail;
  installed: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">{template.emoji || "📦"}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {template.name}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {template.author?.display_name || "Unknown"}
              {(template.is_official || template.author?.is_verified) && (
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
              )}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">
          {template.description}
        </p>

        <div className="flex items-center gap-3 mb-3">
          <StarRating rating={template.rating_avg} count={template.rating_count} />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="h-3 w-3" />
            {template.install_count}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {template.category_name || template.type}
            </Badge>
            <span className="text-[10px] text-muted-foreground">v{template.version}</span>
          </div>
          {installed ? (
            <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Installed
            </Badge>
          ) : (
            <Badge variant="default" className="text-[10px]">
              Install
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryCard({
  category,
  active,
  onClick,
}: {
  category: MarketplaceCategory;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center min-w-[100px] ${
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-border hover:border-primary/30 hover:bg-accent/50"
      }`}
    >
      <span className="text-xl">{category.icon || "📁"}</span>
      <span className="text-xs font-medium truncate w-full">{category.name}</span>
      <span className="text-[10px] text-muted-foreground">{category.template_count}</span>
    </button>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2 mb-3">
          <div className="h-3 w-full bg-muted rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-6 w-1/2 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const branding = useBranding();

  const [templates, setTemplates] = useState<MarketplaceTemplateDetail[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("_all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTemplates = useCallback(
    async (s?: string, type?: string, cat?: string, sortBy?: string, pg?: number) => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string | number> = {
          sort: sortBy || sort,
          page: pg || page,
          page_size: 20,
        };
        if (s) params.q = s;
        if (type && type !== "_all") params.type = type;
        if (cat) params.category = cat;

        const data = await api.marketplaceTemplates(params as Parameters<typeof api.marketplaceTemplates>[0]);
        setTemplates(data.items || []);
        setTotalPages(data.total_pages || 1);
        setTotal(data.total || 0);
      } catch {
        setError("Marketplace temporarily unavailable. Your installed templates continue to work normally.");
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    },
    [sort, page]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.marketplaceCategories();
      setCategories(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchInstalled = useCallback(async () => {
    try {
      const data = await api.marketplaceInstalled();
      setInstalledSlugs(new Set(data.map((t) => t.template_slug)));
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchInstalled();
  }, [fetchCategories, fetchInstalled]);

  useEffect(() => {
    fetchTemplates(search, typeFilter, categoryFilter, sort, page);
  }, [typeFilter, categoryFilter, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    fetchTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchTemplates(value, typeFilter, categoryFilter, sort, 1);
    }, 300);
  };

  const handleCategoryClick = (slug: string) => {
    const next = categoryFilter === slug ? "" : slug;
    setCategoryFilter(next);
    setPage(1);
    fetchTemplates(search, typeFilter, next, sort, 1);
  };

  if (!branding.marketplace_visible) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <Store className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Marketplace is not available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Store className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Marketplace</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Discover and install agent templates, skills, and more for your HELIX instance.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search agents, skills, workflows..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.slug}
              category={cat}
              active={categoryFilter === cat.slug}
              onClick={() => handleCategoryClick(cat.slug)}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
        </div>
      )}

      {/* Template grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : templates.length === 0 && !error ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm">Try a different search or filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.slug}
                template={template}
                installed={installedSlugs.has(template.slug)}
                onClick={() => router.push(`/marketplace/${template.slug}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Community Section */}
      <CommunitySection />
    </div>
  );
}
