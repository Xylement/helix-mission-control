"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { api, type AppNotification } from "@/lib/api";
import { useWS } from "@/contexts/WebSocketContext";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CheckSquare,
  AlertTriangle,
  AtSign,
  ClipboardCheck,
  Bot,
  X,
} from "lucide-react";
import { toast } from "sonner";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case "task_assigned":
    case "task_completed":
      return <CheckSquare className="h-4 w-4 text-blue-500" />;
    case "task_review":
    case "approval_needed":
      return <ClipboardCheck className="h-4 w-4 text-yellow-500" />;
    case "agent_error":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "mention":
      return <AtSign className="h-4 w-4 text-purple-500" />;
    default:
      return <Bot className="h-4 w-4 text-muted-foreground" />;
  }
}

export function NotificationBell() {
  const { subscribe } = useWS();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await api.getUnreadCount();
      setUnreadCount(res.count);
    } catch {
      // silent
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({ per_page: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Subscribe to real-time notifications
  useEffect(() => {
    const unsub = subscribe("notification", (event) => {
      const data = event.data as Record<string, unknown>;
      setUnreadCount((c) => c + 1);

      // Prepend to list if dropdown is showing
      const newNotif: AppNotification = {
        id: Number(data.id) || Date.now(),
        type: (data.notification_type as string) || "info",
        title: (data.title as string) || "",
        message: (data.message as string) || "",
        target_type: (data.target_type as string) || null,
        target_id: data.target_id ? Number(data.target_id) : null,
        read: false,
        created_at: (data.created_at as string) || new Date().toISOString(),
      };
      setNotifications((prev) => [newNotif, ...prev].slice(0, 20));

      // Toast for critical notifications
      const critical = ["approval_needed", "task_review", "agent_error"];
      if (critical.includes(newNotif.type)) {
        toast(newNotif.title, { description: newNotif.message });
      }
    });
    return unsub;
  }, [subscribe]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedBell = bellRef.current?.contains(target);
      const clickedPanel = panelRef.current?.contains(target);
      if (!clickedBell && !clickedPanel) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (!open) {
      loadNotifications();
      // Calculate fixed position from the bell icon's bounding rect
      if (bellRef.current) {
        const rect = bellRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        if (isMobile) {
          setDropdownStyle({ top: rect.bottom + 4, left: 16, right: 16 });
        } else {
          // Position dropdown below the bell icon, aligned to its left edge
          // Clamp so it doesn't overflow the viewport
          const dropdownWidth = 320; // sm:w-80 = 320px
          let left = rect.left;
          if (left + dropdownWidth > window.innerWidth - 16) {
            left = window.innerWidth - dropdownWidth - 16;
          }
          if (left < 16) left = 16;
          setDropdownStyle({
            top: rect.bottom + 8,
            left,
          });
        }
      }
    }
    setOpen(!open);
  };

  const handleClick = async (notif: AppNotification) => {
    if (!notif.read) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // silent
      }
    }
    setOpen(false);
    if (notif.target_type === "task" && notif.target_id) {
      try {
        const task = await api.task(notif.target_id);
        router.push(`/boards/${task.board_id}?task=${task.id}`);
      } catch {
        // Task may have been deleted — silently ignore
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const dropdown = open ? (
    <div
      ref={panelRef}
      className="fixed z-[9999] flex flex-col border bg-white dark:bg-gray-900 shadow-xl w-[calc(100vw-2rem)] sm:w-80 rounded-lg max-h-[70vh]"
      style={dropdownStyle}
    >
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all as read
            </button>
          )}
          <button onClick={() => setOpen(false)}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent transition-colors border-b last:border-0 ${
                !notif.read ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
            >
              <div className="mt-0.5 shrink-0">
                <NotifIcon type={notif.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm ${
                    !notif.read ? "font-semibold" : "font-normal"
                  }`}
                >
                  {notif.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {notif.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {timeAgo(notif.created_at)}
                </p>
              </div>
              {!notif.read && (
                <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        ref={bellRef}
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={handleToggle}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </>
  );
}
