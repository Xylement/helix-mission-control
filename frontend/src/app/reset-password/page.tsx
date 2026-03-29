"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const branding = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/20 via-background to-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          {branding.logo_url ? (
            <div className="flex justify-center mb-2">
              <img src={branding.logo_url} alt={branding.product_name} className="h-10 w-auto" />
            </div>
          ) : (
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">
                {branding.product_short_name}
              </span>
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-1 tracking-[0.2em] uppercase">
            Reset Password
          </p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardContent className="p-6">
            {success ? (
              <div className="space-y-4 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <p className="text-sm font-medium">Password has been reset successfully.</p>
                <a
                  href="/login"
                  className="inline-block text-sm text-blue-400 hover:text-blue-300"
                >
                  Go to Login
                </a>
              </div>
            ) : !token ? (
              <div className="space-y-4 text-center">
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  Invalid reset link. No token provided.
                </div>
                <a
                  href="/forgot-password"
                  className="inline-block text-sm text-blue-400 hover:text-blue-300"
                >
                  Request a new reset link
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    New Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-11"
                    placeholder="Repeat password"
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Reset Password"
                  )}
                </Button>
                {error && error.includes("expired") && (
                  <div className="text-center">
                    <a
                      href="/forgot-password"
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Request a new reset link
                    </a>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground/50 mt-6">
          {branding.footer_text}
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
