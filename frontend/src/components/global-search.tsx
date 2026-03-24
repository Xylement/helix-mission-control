"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, type Task } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Search, X, Bot, Archive } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  done: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.searchTasks(q);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Constrain dropdown to viewport
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const el = dropdownRef.current;
    const rect = el.getBoundingClientRect();
    const maxBottom = window.innerHeight - 16;
    if (rect.bottom > maxBottom) {
      el.style.maxHeight = `${maxBottom - rect.top}px`;
    }
  }, [open, results]);

  const handleSelect = (task: Task) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/boards/${task.board_id}`);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const hasResults = query.length >= 2;

  return (
    <div className="relative" ref={containerRef}>
      {/* Search input — always visible in sidebar */}
      <div
        className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-muted-foreground text-sm cursor-text hover:border-primary/50 transition-colors"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
            placeholder="Search tasks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          />
        ) : (
          <span className="flex-1 truncate">Search...</span>
        )}
        {open && query ? (
          <button onClick={close} className="shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground shrink-0">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        )}
      </div>

      {/* Results dropdown */}
      {open && hasResults && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border rounded-lg shadow-lg z-50 max-h-[60vh] flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
            )}
            {!loading && results.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No tasks found</div>
            )}
            {results.map((task) => (
              <button
                key={task.id}
                onClick={() => handleSelect(task)}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors border-b last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.archived && (
                      <Archive className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[task.status] || ""}`}>
                      {task.status.replace("_", " ")}
                    </Badge>
                    {task.assigned_agent && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        {task.assigned_agent.name}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
