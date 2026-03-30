"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { api, type WhiteLabelConfig } from "@/lib/api";
import { invalidateBranding } from "@/lib/branding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Lock,
  Save,
  Palette,
  Type,
  LogIn,
  Sparkles,
  Link2,
  Store,
  Code,
  AlertTriangle,
  Upload,
  Image,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

export default function WhiteLabelSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);

  // Form state
  const [productName, setProductName] = useState("HELIX Mission Control");
  const [shortName, setShortName] = useState("HELIX");
  const [companyName, setCompanyName] = useState("HelixNode");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [accentColorSecondary, setAccentColorSecondary] = useState("#8b5cf6");
  const [loginTitle, setLoginTitle] = useState("Sign in to Mission Control");
  const [loginSubtitle, setLoginSubtitle] = useState("");
  const [loadingAnimEnabled, setLoadingAnimEnabled] = useState(true);
  const [loadingAnimText, setLoadingAnimText] = useState("HELIX");
  const [footerText, setFooterText] = useState("Powered by HelixNode");
  const [docsUrl, setDocsUrl] = useState("https://docs.helixnode.tech");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [marketplaceVisible, setMarketplaceVisible] = useState(true);
  const [customCss, setCustomCss] = useState("");

  useEffect(() => {
    if (user?.role === "admin") {
      api
        .getWhiteLabelSettings()
        .then((data) => {
          setConfig(data);
          setProductName(data.product_name);
          setShortName(data.product_short_name);
          setCompanyName(data.company_name);
          setAccentColor(data.accent_color);
          setAccentColorSecondary(data.accent_color_secondary);
          setLoginTitle(data.login_title);
          setLoginSubtitle(data.login_subtitle || "");
          setLoadingAnimEnabled(data.loading_animation_enabled);
          setLoadingAnimText(data.loading_animation_text);
          setFooterText(data.footer_text);
          setDocsUrl(data.docs_url);
          setSupportEmail(data.support_email || "");
          setSupportUrl(data.support_url || "");
          setMarketplaceVisible(data.marketplace_visible);
          setCustomCss(data.custom_css || "");
        })
        .catch(() => {
          toast.error("Failed to load white label settings");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateWhiteLabelSettings({
        product_name: productName,
        product_short_name: shortName,
        company_name: companyName,
        accent_color: accentColor,
        accent_color_secondary: accentColorSecondary,
        login_title: loginTitle,
        login_subtitle: loginSubtitle || null,
        loading_animation_enabled: loadingAnimEnabled,
        loading_animation_text: loadingAnimText,
        footer_text: footerText,
        docs_url: docsUrl,
        support_email: supportEmail || null,
        support_url: supportUrl || null,
        marketplace_visible: marketplaceVisible,
        custom_css: customCss || null,
      });
      setConfig(updated);
      invalidateBranding();
      toast.success("White label settings saved");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "detail" in err
          ? String((err as Record<string, unknown>).detail)
          : "Failed to save";
      if (message.includes("Agency") || message.includes("Partner")) {
        toast.error("White label requires an Agency or Partner plan");
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const result = await api.uploadWhiteLabelLogo(file);
      setConfig((prev) => (prev ? { ...prev, logo_url: result.logo_url } : prev));
      invalidateBranding();
      toast.success("Logo uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    try {
      const result = await api.uploadWhiteLabelFavicon(file);
      setConfig((prev) => (prev ? { ...prev, favicon_url: result.favicon_url } : prev));
      invalidateBranding();
      toast.success("Favicon uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload favicon");
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetWhiteLabelSettings();
      invalidateBranding();
      toast.success("Branding reset to defaults");
      setShowResetDialog(false);
      window.location.reload();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "detail" in err
          ? String((err as Record<string, unknown>).detail)
          : "Failed to reset";
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="animate-in-page p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">White Label</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Only administrators can manage white label settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-in-page p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">White Label</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize branding for your instance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-500 hover:bg-red-500/10"
          onClick={() => setShowResetDialog(true)}
        >
          <RefreshCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-amber-500">Preview Mode</div>
          <div className="text-xs text-amber-500/80 mt-0.5">
            White label editing requires an Agency or Partner plan. Settings shown in preview mode.
          </div>
        </div>
      </div>

      {/* Section 1: Brand Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="h-4 w-4" />
            Brand Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Product Name</label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="HELIX Mission Control"
              maxLength={100}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Short Name</label>
            <Input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="HELIX"
              maxLength={30}
            />
            <p className="text-xs text-muted-foreground mt-1">Used in sidebar and loading animation</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Company Name</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="HelixNode"
              maxLength={100}
            />
          </div>

          {/* Logo */}
          <div>
            <label className="text-sm font-medium block mb-1">Logo</label>
            <div className="flex items-center gap-4">
              {config?.logo_url && (
                <div className="h-12 w-auto flex items-center">
                  <img src={config.logo_url} alt="Logo" className="h-10 w-auto rounded" />
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {config?.logo_url ? "Replace Logo" : "Upload Logo"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG. Max 2MB.</p>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div>
            <label className="text-sm font-medium block mb-1">Favicon</label>
            <div className="flex items-center gap-4">
              {config?.favicon_url && (
                <div className="h-8 w-8 flex items-center justify-center">
                  <img src={config.favicon_url} alt="Favicon" className="h-6 w-6" />
                </div>
              )}
              <div>
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/x-icon,image/svg+xml,image/vnd.microsoft.icon"
                  onChange={handleFaviconUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploadingFavicon}
                >
                  {uploadingFavicon ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Image className="h-4 w-4 mr-2" />
                  )}
                  {config?.favicon_url ? "Replace Favicon" : "Upload Favicon"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, ICO, or SVG. Max 500KB.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            Colors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Primary Accent</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input cursor-pointer"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#3b82f6"
                  maxLength={7}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Secondary Accent</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColorSecondary}
                  onChange={(e) => setAccentColorSecondary(e.target.value)}
                  className="h-9 w-12 rounded border border-input cursor-pointer"
                />
                <Input
                  value={accentColorSecondary}
                  onChange={(e) => setAccentColorSecondary(e.target.value)}
                  placeholder="#8b5cf6"
                  maxLength={7}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Login Page */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4" />
            Login Page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Login Title</label>
            <Input
              value={loginTitle}
              onChange={(e) => setLoginTitle(e.target.value)}
              placeholder="Sign in to Mission Control"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Login Subtitle</label>
            <textarea
              value={loginSubtitle}
              onChange={(e) => setLoginSubtitle(e.target.value)}
              placeholder="Optional subtitle shown below the title"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Loading & Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Loading &amp; Footer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Loading Animation</div>
              <div className="text-xs text-muted-foreground">Show branded animation after login</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={loadingAnimEnabled}
              onClick={() => setLoadingAnimEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                loadingAnimEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  loadingAnimEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Loading Text</label>
            <Input
              value={loadingAnimText}
              onChange={(e) => setLoadingAnimText(e.target.value)}
              placeholder="HELIX"
              maxLength={30}
              disabled={!loadingAnimEnabled}
              className={!loadingAnimEnabled ? "opacity-50" : ""}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Footer Text</label>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Powered by HelixNode"
              maxLength={200}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Links & Support */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Links &amp; Support
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Documentation URL</label>
            <Input
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              placeholder="https://docs.helixnode.tech"
              type="url"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Support Email</label>
            <Input
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@company.com"
              type="email"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Support URL</label>
            <Input
              value={supportUrl}
              onChange={(e) => setSupportUrl(e.target.value)}
              placeholder="https://support.company.com"
              type="url"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 6: Marketplace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4" />
            Marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show Marketplace</div>
              <div className="text-xs text-muted-foreground">
                Display the Marketplace link in the sidebar navigation
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={marketplaceVisible}
              onClick={() => setMarketplaceVisible((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                marketplaceVisible ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  marketplaceVisible ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Section 7: Advanced */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Code className="h-4 w-4" />
            Advanced
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium block mb-1">Custom CSS</label>
            <textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              placeholder="/* Custom styles applied globally */"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[150px] resize-y"
              rows={6}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Injected as a global stylesheet. Use with caution.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset to Defaults</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Reset all branding to HELIX defaults? This will remove your custom product name, logo, colors, and all other branding customizations.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowResetDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCcw className="h-4 w-4 mr-2" />
                )}
                Reset to Defaults
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
