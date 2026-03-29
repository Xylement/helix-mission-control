"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalSearch } from "@/components/global-search";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Columns3,
  Bot,
  Activity,
  LogOut,
  Users,
  Radio,
  Menu,
  BookOpen,
  Brain,
  UserCircle,
  Store,
  ChevronRight,
  Settings2,
  CreditCard,
  GitBranch,
  Plug,
  HardDrive,
  Monitor,
  Palette,
} from "lucide-react";
import { api, type VersionInfo } from "@/lib/api";
import { useBranding } from "@/contexts/BrandingContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/boards", label: "Boards", icon: Columns3 },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/skills", label: "Skills", icon: BookOpen },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/activity", label: "Activity", icon: Activity },
];

const adminNavItems = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/gateways", label: "Gateways", icon: Radio },
  { href: "/settings/models", label: "AI Models", icon: Brain },
  { href: "/settings/model-config", label: "Model Config", icon: Settings2 },
  { href: "/settings/plugins", label: "Plugins", icon: Plug },
  { href: "/settings/organization", label: "Organization", icon: Settings2 },
  { href: "/settings/backups", label: "Backups", icon: HardDrive },
  { href: "/settings/white-label", label: "White Label", icon: Palette },
  { href: "/settings/system", label: "System", icon: Monitor },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isConnected, isReconnecting } = useWS();
  const branding = useBranding();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    api.getVersion().then(setVersionInfo).catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col bg-card dark:bg-[hsl(240,17%,7%)]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/50 px-5">
        {branding.logo_url ? (
          <img src={branding.logo_url} alt={branding.product_short_name} className="h-8 w-auto" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-bold text-sm shadow-md shadow-blue-500/20">
            {branding.product_short_name.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm tracking-tight">{branding.product_short_name}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Mission Control</div>
        </div>
        <ThemeToggle />
        <NotificationBell />
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 pt-2 overflow-y-auto">
        {navItems.filter((item) => item.href !== "/marketplace" || branding.marketplace_visible).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary/10 text-primary dark:bg-primary/15"
                  : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
              )}
              <item.icon className={cn("h-[18px] w-[18px] transition-colors", active && "text-primary")} />
              {item.label}
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />}
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <>
            <div className="pt-5 pb-1.5 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Administration
            </div>
            {adminNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-primary dark:bg-primary/15"
                      : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                  )}
                  <item.icon className={cn("h-[18px] w-[18px] transition-colors", active && "text-primary")} />
                  {item.label}
                  {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Update banner */}
      {user?.role === "admin" && versionInfo?.update_available && (
        <div className="mx-3 mb-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
          <div className="text-xs font-medium text-blue-400">Update available</div>
          <div className="text-[10px] text-blue-400/70 mt-0.5">v{versionInfo.latest_version} is ready</div>
          <Link
            href="/settings/system"
            onClick={onNavigate}
            className="text-[10px] font-medium text-blue-400 hover:text-blue-300 mt-1 inline-block"
          >
            Update Now &rarr;
          </Link>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-border/50 p-3">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/80 transition-colors group"
        >
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-semibold text-sm border border-primary/20">
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card dark:border-[hsl(240,17%,7%)]",
                isConnected
                  ? "bg-emerald-500 pulse-dot"
                  : isReconnecting
                  ? "bg-amber-400 animate-pulse"
                  : "bg-gray-400"
              )}
              title={isConnected ? "Live updates active" : isReconnecting ? "Reconnecting..." : "Disconnected"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {user?.role}
              </Badge>
            </div>
          </div>
          <UserCircle className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
        {versionInfo && (
          <div className="flex items-center gap-1.5 px-3 mt-2">
            <span className="text-[10px] text-muted-foreground/60">v{versionInfo.current_version}</span>
            {versionInfo.update_available && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" title="Update available" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const branding = useBranding();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-border/50 bg-card dark:bg-[hsl(240,17%,7%)]">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 border-b border-border/50 bg-card/95 backdrop-blur-md dark:bg-[hsl(240,17%,7%)]/95 lg:hidden">
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex items-center justify-center gap-2">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.product_short_name} className="h-7 w-auto" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-bold text-xs shadow-sm">
              {branding.product_short_name.charAt(0)}
            </div>
          )}
          <span className="font-semibold text-sm tracking-tight">{branding.product_short_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 border-r-0">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { href: "/boards", icon: Columns3, label: "Boards" },
    { href: "/agents", icon: Bot, label: "Agents" },
    { href: "/activity", icon: Activity, label: "Activity" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md dark:bg-[hsl(240,17%,7%)]/95 border-t border-border/50 lg:hidden safe-area-bottom">
      <div className="flex justify-around py-1.5 pb-safe">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[56px] min-h-[44px] justify-center rounded-lg transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <tab.icon className={cn("h-5 w-5", active && "drop-shadow-sm")} />
              <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
