"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type MarketplaceLeaderboardItem,
  type MarketplaceFeedItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Activity, Sparkles, Download, ChevronRight } from "lucide-react";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function InitialsAvatar({ name }: { name: string }) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
      {initials}
    </div>
  );
}

export function CommunitySection() {
  const router = useRouter();
  const [leaders, setLeaders] = useState<MarketplaceLeaderboardItem[]>([]);
  const [feed, setFeed] = useState<MarketplaceFeedItem[]>([]);

  useEffect(() => {
    api.marketplaceLeaderboard(5).then(setLeaders).catch(() => {});
    api.marketplaceCommunityFeed(5).then(setFeed).catch(() => {});
  }, []);

  if (leaders.length === 0 && feed.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        Community
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Creators */}
        {leaders.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top Creators
              </h3>
              <div className="space-y-3">
                {leaders.map((creator) => (
                  <button
                    key={creator.username}
                    onClick={() => router.push(`/marketplace/creators/${creator.username}`)}
                    className="flex items-center gap-3 w-full text-left hover:bg-accent/50 rounded-lg p-2 -mx-2 transition-colors"
                  >
                    <InitialsAvatar name={creator.display_name || creator.username} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {creator.display_name || creator.username}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-3">
                        <span>{creator.template_count} templates</span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {creator.total_installs} installs
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        {feed.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-primary" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                {feed.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (item.template_slug) router.push(`/marketplace/${item.template_slug}`);
                    }}
                    className={`flex items-start gap-3 w-full text-left rounded-lg p-2 -mx-2 transition-colors ${
                      item.template_slug ? "hover:bg-accent/50 cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">New:</span>{" "}
                        <span className="font-medium">{item.title}</span>
                        {item.creator_username && (
                          <span className="text-muted-foreground"> by {item.creator_username}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(item.timestamp)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Become a Creator CTA */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-base mb-1">Become a Creator</h3>
            <p className="text-sm text-muted-foreground">
              Share your templates with the HELIX community
            </p>
          </div>
          <Button onClick={() => router.push("/marketplace/submit")}>
            Get Started
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
