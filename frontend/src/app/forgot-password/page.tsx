"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const branding = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch {
      setSent(true);
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
            Password Reset
          </p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardContent className="p-6">
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-400">
                  If an account with that email exists, a reset link has been sent.
                </div>
                <p className="text-xs text-muted-foreground">
                  If email is not configured on this instance, ask your admin to reset your password.
                </p>
                <a
                  href="/login"
                  className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to login
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  If email is not configured on this instance, ask your admin to reset your password.
                </p>
                <div className="text-center">
                  <a
                    href="/login"
                    className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to login
                  </a>
                </div>
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
