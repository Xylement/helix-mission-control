"use client";

import { useEffect, useState } from "react";
import { useBranding } from "@/contexts/BrandingContext";

export function HelixLoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"letters" | "line" | "tagline" | "fadeout">("letters");
  const branding = useBranding();

  useEffect(() => {
    if (!branding.loading_animation_enabled) {
      onComplete();
      return;
    }
    const timers = [
      setTimeout(() => setPhase("line"), 800),
      setTimeout(() => setPhase("tagline"), 1400),
      setTimeout(() => setPhase("fadeout"), 2200),
      setTimeout(() => onComplete(), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete, branding.loading_animation_enabled]);

  if (!branding.loading_animation_enabled) return null;

  const letters = branding.loading_animation_text.split("");

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        phase === "fadeout" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Letters */}
      <div className="flex gap-1">
        {letters.map((letter, i) => (
          <span
            key={i}
            className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent"
            style={{
              opacity: 0,
              animation: `helixLetterIn 0.4s ease-out ${i * 0.1}s forwards`,
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      {/* Expanding line */}
      <div
        className="h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full mt-4"
        style={{
          width: 0,
          opacity: 0,
          animation:
            phase !== "letters"
              ? "helixLineExpand 0.5s ease-out forwards"
              : "none",
        }}
      />

      {/* Tagline */}
      <p
        className="text-sm text-muted-foreground mt-3 tracking-[0.3em] uppercase"
        style={{
          opacity: 0,
          animation:
            phase === "tagline" || phase === "fadeout"
              ? "helixTaglineIn 0.4s ease-out forwards"
              : "none",
        }}
      >
        {branding.product_name.replace(branding.loading_animation_text, "").trim() || "Mission Control"}
      </p>
    </div>
  );
}
