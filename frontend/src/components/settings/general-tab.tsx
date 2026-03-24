"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

const TIMEZONES = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export function GeneralTab() {
  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kuala_Lumpur");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getOrgGeneral();
      setOrgName(data.org_name);
      setTimezone(data.timezone);
      setLogoUrl(data.logo_url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateOrgGeneral({ org_name: orgName, timezone });
      toast.success("Settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await api.uploadOrgLogo(file);
      setLogoUrl(result.logo_url);
      toast.success("Logo uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-5">
        <div>
          <label className="text-sm font-medium mb-1 block">Organization Name</label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Logo</label>
          <div className="flex items-center gap-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Org logo"
                className="h-12 w-12 rounded-lg object-cover border border-border"
              />
            )}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload Logo
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, or SVG. Max 2MB.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Timezone</label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={saving || !orgName}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
