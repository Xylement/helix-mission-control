"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type MarketplaceTemplateDetail,
  type MarketplaceReview,
  type MarketplaceReviewsResponse,
  type InstalledTemplate,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Star,
  Download,
  CheckCircle2,
  Loader2,
  Shield,
  ThumbsUp,
  Flag,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { InstallConfirmModal } from "@/components/marketplace/InstallConfirmModal";

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

export default function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [template, setTemplate] = useState<MarketplaceTemplateDetail | null>(null);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [installed, setInstalled] = useState<InstalledTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  // Review form state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchTemplate = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [tmpl, installedList] = await Promise.all([
        api.marketplaceTemplate(slug),
        api.marketplaceInstalled(),
      ]);
      setTemplate(tmpl);
      const match = installedList.find((t) => t.template_slug === slug && t.is_active);
      setInstalled(match || null);
    } catch {
      toast.error("Failed to load template details");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const fetchReviews = useCallback(async (page = 1, append = false) => {
    if (!slug) return;
    try {
      const data: MarketplaceReviewsResponse = await api.marketplaceReviews(slug, page);
      setReviews((prev) => append ? [...prev, ...(data.items || [])] : (data.items || []));
      setReviewsPage(data.page || 1);
      setReviewsTotalPages(data.total_pages || 1);
    } catch {
      // Non-critical
    }
  }, [slug]);

  useEffect(() => {
    fetchTemplate();
    fetchReviews();
  }, [fetchTemplate, fetchReviews]);

  const handleLoadMoreReviews = async () => {
    setLoadingMoreReviews(true);
    await fetchReviews(reviewsPage + 1, true);
    setLoadingMoreReviews(false);
  };

  const handleSubmitReview = async () => {
    if (!slug || reviewRating < 1) {
      toast.error("Please select a star rating");
      return;
    }
    setSubmittingReview(true);
    try {
      await api.marketplaceSubmitReview(slug, {
        rating: reviewRating,
        title: reviewTitle || undefined,
        body: reviewBody || undefined,
      });
      toast.success("Review submitted!");
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewTitle("");
      setReviewBody("");
      fetchReviews();
      fetchTemplate();
    } catch {
      toast.error("Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleUpvoteReview = async (reviewId: string) => {
    try {
      await api.marketplaceUpvoteReview(reviewId);
      toast.success("Marked as helpful");
      fetchReviews(1, false);
    } catch {
      toast.error("Failed to upvote");
    }
  };

  const handleFlagReview = async (reviewId: string) => {
    const reason = window.prompt("Why are you flagging this review?");
    if (!reason) return;
    try {
      await api.marketplaceFlagReview(reviewId, reason);
      toast.success("Review flagged for moderation");
    } catch {
      toast.error("Failed to flag review");
    }
  };

  const handleInstallSuccess = () => {
    setShowInstallModal(false);
    fetchTemplate();
    toast.success(`Installed ${template?.name}`);
  };

  const handleUninstall = async () => {
    if (!installed) return;
    setUninstalling(true);
    try {
      await api.marketplaceUninstall(installed.id);
      toast.success("Template uninstalled");
      setInstalled(null);
      fetchTemplate();
    } catch {
      toast.error("Failed to uninstall");
    } finally {
      setUninstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Template not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/marketplace")}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Marketplace
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <span className="text-5xl">{template.emoji || "📦"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{template.name}</h1>
            <Badge variant="secondary">v{template.version}</Badge>
            {template.is_official && (
              <Badge variant="outline" className="text-blue-600 border-blue-300">
                <Shield className="h-3 w-3 mr-1" />
                Official
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            by {template.author?.display_name || "Unknown"}
            {(template.is_official || template.author?.is_verified) && (
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            <Badge variant="secondary" className="text-[10px] mr-2">
              {template.category_name || template.type}
            </Badge>
          </p>
          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <StarDisplay rating={template.rating_avg} />
              <span className="ml-1">
                {template.rating_avg.toFixed(1)} ({template.rating_count} reviews)
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              {template.install_count} installs
            </span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          {installed ? (
            <>
              <Badge variant="outline" className="border-green-500 text-green-600 py-1 px-3 text-sm">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Installed
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={handleUninstall}
                disabled={uninstalling}
              >
                {uninstalling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Uninstall
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowInstallModal(true)}>Install</Button>
          )}
          {template.min_plan !== "starter" && (
            <Badge variant="secondary" className="text-xs">
              Requires {template.min_plan} plan
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({template.rating_count})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          {/* Description */}
          {template.long_description && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{template.long_description}</p>
            </div>
          )}
          {!template.long_description && template.description && (
            <p className="text-muted-foreground">{template.description}</p>
          )}

          {/* Screenshots */}
          {template.screenshots.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Screenshots</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {template.screenshots.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Screenshot ${i + 1}`}
                    className="rounded-lg border"
                  />
                ))}
              </div>
            </div>
          )}

          {/* What's included */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-3">What&apos;s Included</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Type:</span>{" "}
                  {template.type === "agent_template" ? "Agent Template" : template.type}
                </p>
                {template.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">Tags:</span>
                    {template.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-3">Requirements</h3>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p>Min HELIX version: {template.min_helix_version}</p>
                <p>Min plan: {template.min_plan}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="pt-4 space-y-6">
          {/* Rating Summary Bar Chart */}
          {template.rating_count > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold">{template.rating_avg.toFixed(1)}</div>
                    <StarDisplay rating={template.rating_avg} />
                    <p className="text-xs text-muted-foreground mt-1">{template.rating_count} reviews</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                      const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-sm">
                          <span className="w-8 text-right text-muted-foreground">{star} <Star className="h-3 w-3 inline fill-amber-400 text-amber-400" /></span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-amber-400 h-full rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-xs text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Write a Review */}
          {!showReviewForm ? (
            <Button variant="outline" onClick={() => setShowReviewForm(true)}>
              Write a Review
            </Button>
          ) : (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-sm">Write a Review</h3>
                {/* Star selector */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReviewRating(i)}
                      onMouseEnter={() => setReviewHoverRating(i)}
                      onMouseLeave={() => setReviewHoverRating(0)}
                      className="p-0.5"
                    >
                      <Star
                        className={`h-6 w-6 transition-colors ${
                          i <= (reviewHoverRating || reviewRating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                  {reviewRating > 0 && (
                    <span className="text-sm text-muted-foreground ml-2">{reviewRating}/5</span>
                  )}
                </div>
                <Input
                  placeholder="Title (optional)"
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                />
                <textarea
                  placeholder="Share your experience with this template..."
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <Button onClick={handleSubmitReview} disabled={submittingReview || reviewRating < 1}>
                    {submittingReview && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Submit Review
                  </Button>
                  <Button variant="ghost" onClick={() => setShowReviewForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reviews list */}
          {reviews.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reviews yet. Be the first to review!</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <StarDisplay rating={review.rating} />
                      {review.title && (
                        <span className="font-medium text-sm">{review.title}</span>
                      )}
                    </div>
                    {review.body && (
                      <p className="text-sm text-muted-foreground">{review.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {review.reviewer_name || "Anonymous"} &middot;{" "}
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>

                    {/* Creator response */}
                    {review.response && (
                      <div className="mt-3 ml-4 pl-4 border-l-2 border-primary/20">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-medium">
                            {review.response.creator_username || "Creator"}
                          </span>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Creator</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{review.response.body}</p>
                        {review.response.created_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(review.response.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => handleUpvoteReview(review.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Helpful ({review.helpful_count})
                      </button>
                      <button
                        onClick={() => handleFlagReview(review.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Flag
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Load more */}
              {reviewsTotalPages > 1 && reviewsPage < reviewsTotalPages && (
                <div className="text-center pt-2">
                  <Button
                    variant="outline"
                    onClick={handleLoadMoreReviews}
                    disabled={loadingMoreReviews}
                  >
                    {loadingMoreReviews && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Load more reviews
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Install Modal */}
      {showInstallModal && template && (
        <InstallConfirmModal
          slug={template.slug}
          templateName={template.name}
          templateType={template.type}
          onClose={() => setShowInstallModal(false)}
          onSuccess={handleInstallSuccess}
        />
      )}
    </div>
  );
}
