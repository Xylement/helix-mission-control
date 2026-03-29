"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { invalidateBranding } from "@/lib/branding";
import { Loader2, Palette, SkipForward, Upload } from "lucide-react";
import { toast } from "sonner";

interface BrandingStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function BrandingStep({ onNext, onSkip }: BrandingStepProps) {
  const [productName, setProductName] = useState("HELIX Mission Control");
  const [shortName, setShortName] = useState("HELIX");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (logoFile) {
        await api.uploadWhiteLabelLogo(logoFile);
      }
      await api.updateWhiteLabelSettings({
        product_name: productName,
        product_short_name: shortName,
        accent_color: accentColor,
      });
      invalidateBranding();
      toast.success("Branding saved!");
      onNext();
    } catch {
      // 403 expected if license doesn't actually have white_label yet
      toast.error("Could not save branding. You can configure it later in Settings > White Label.");
      onNext();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto">
          <Palette className="h-6 w-6 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold">Customize Your Brand</h2>
        <p className="text-muted-foreground text-sm">
          Make this platform yours. You can always change these later in Settings &gt; White Label.
        </p>
      </div>

      <div className="space-y-4">
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
          <p className="text-xs text-muted-foreground mt-1">Shown in the sidebar</p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Logo</label>
          <div className="flex items-center gap-4">
            {logoPreview && (
              <img src={logoPreview} alt="Logo preview" className="h-10 w-auto rounded" />
            )}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {logoPreview ? "Change Logo" : "Upload Logo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or SVG. Max 2MB.</p>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Accent Color</label>
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
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Continue
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={saving}>
          <SkipForward className="h-4 w-4 mr-1" />
          Skip
        </Button>
      </div>
    </div>
  );
}
