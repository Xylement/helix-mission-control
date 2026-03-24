"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Upload, User as UserIcon, Lock, Send, Camera } from "lucide-react";
import { toast } from "sonner";

export default function ProfileSettingsPage() {
  const { user, loading: authLoading } = useAuth();

  // Profile
  const [name, setName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Telegram
  const [telegramNotifications, setTelegramNotifications] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState("");

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Initialize fields from user once loaded
  useEffect(() => {
    if (user && !nameLoaded) {
      setName(user.name);
      setTelegramNotifications(user.telegram_notifications ?? false);
      setTelegramUserId(user.telegram_user_id ?? "");
      setNameLoaded(true);
    }
  }, [user, nameLoaded]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Not authenticated.</p>
      </div>
    );
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateProfile({
        name: name.trim(),
        telegram_notifications: telegramNotifications,
        telegram_user_id: telegramUserId.trim() || null,
      });
      toast.success("Profile updated successfully");
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      await api.uploadAvatar(file);
      toast.success("Avatar updated successfully");
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!newPassword) {
      toast.error("Please enter a new password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const avatarLetter = user.name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="animate-in-page p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile Settings</h1>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Display Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <Input
              value={user.email}
              readOnly
              disabled
              className="mt-1 bg-muted"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Role</label>
            <div className="mt-1">
              <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                {user.role}
              </Badge>
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Avatar Section */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="h-24 w-24 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center text-3xl font-bold text-primary">
                  {avatarLetter}
                </div>
              )}
              {/* Camera overlay */}
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload Avatar
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or GIF. Max 2MB recommended.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Current Password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-1"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive mt-1">Passwords do not match</p>
            )}
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Telegram Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Telegram Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Enable Telegram Notifications</label>
              <p className="text-xs text-muted-foreground">Receive task updates via Telegram</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={telegramNotifications}
              onClick={() => setTelegramNotifications(!telegramNotifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                telegramNotifications ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  telegramNotifications ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium">Telegram User ID</label>
            <Input
              value={telegramUserId}
              onChange={(e) => setTelegramUserId(e.target.value)}
              placeholder="Enter your Telegram User ID"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your Telegram ID by messaging @userinfobot on Telegram
            </p>
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Telegram Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
