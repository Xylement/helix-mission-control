"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type MarketplaceCreatorProfile,
  type MarketplaceTemplateDetail,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Star,
  Download,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  Pencil,
  Loader2,
  User,
} from "lucide-react";
import { toast } from "sonner";

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
  onClick,
}: {
  template: MarketplaceTemplateDetail;
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
          <Badge variant="secondary" className="text-[10px]">
            {template.category_name || template.type}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-6">
        <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
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
        ))}
      </div>
    </div>
  );
}

export default function CreatorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [profile, setProfile] = useState<MarketplaceCreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: "",
    bio: "",
    website: "",
  });

  useEffect(() => {
    if (!username) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const creatorData = await api.marketplaceCreator(username);
        setProfile(creatorData);
        setEditForm({
          display_name: creatorData.display_name || "",
          bio: creatorData.bio || "",
          website: creatorData.website || "",
        });

        // Check if this is the current user's own profile
        try {
          const ownProfile = await api.marketplaceOwnProfile();
          if (ownProfile.username === username) {
            setIsOwnProfile(true);
          }
        } catch {
          // Not logged in or no profile - not own profile
        }
      } catch {
        setError("Creator profile not found.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [username]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await api.marketplaceUpdateProfile({
        display_name: editForm.display_name || undefined,
        bio: editForm.bio || undefined,
        website: editForm.website || undefined,
      });
      setProfile(updated);
      setEditing(false);
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{error || "Profile not found"}</p>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Profile header */}
      <div className="flex flex-col sm:flex-row items-start gap-6">
        {/* Avatar */}
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-20 w-20 rounded-full object-cover border-2 border-border"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">{initial}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {(profile.is_verified || profile.is_official) && (
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-2">@{profile.username}</p>

          {profile.bio && (
            <p className="text-sm text-foreground/80 mb-2 max-w-xl">{profile.bio}</p>
          )}

          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mb-3"
            >
              {profile.website.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <p className="text-xs text-muted-foreground">
            {profile.template_count} template{profile.template_count !== 1 ? "s" : ""}
            {" · "}
            {profile.total_installs} install{profile.total_installs !== 1 ? "s" : ""}
            {" · "}
            Member since {formatDate(profile.created_at)}
          </p>
        </div>

        {isOwnProfile && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold">Edit Profile</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Display Name
                </label>
                <Input
                  value={editForm.display_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, display_name: e.target.value })
                  }
                  placeholder="Your display name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Bio
                </label>
                <Input
                  value={editForm.bio}
                  onChange={(e) =>
                    setEditForm({ ...editForm, bio: e.target.value })
                  }
                  placeholder="A short bio about yourself"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Website
                </label>
                <Input
                  value={editForm.website}
                  onChange={(e) =>
                    setEditForm({ ...editForm, website: e.target.value })
                  }
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSaveProfile} disabled={saving} size="sm">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditForm({
                    display_name: profile.display_name || "",
                    bio: profile.bio || "",
                    website: profile.website || "",
                  });
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates section */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Templates by {displayName}
        </h2>

        {profile.templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No templates published yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profile.templates.map((template) => (
              <TemplateCard
                key={template.slug}
                template={template}
                onClick={() => router.push(`/marketplace/${template.slug}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
