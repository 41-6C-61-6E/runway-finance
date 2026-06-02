"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Sun, Moon, Star } from "lucide-react";
import { applyAccent, THEME_ACCENT_MAP } from "@/lib/utils/apply-accent";

export default function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    const pairedAccent = THEME_ACCENT_MAP[newTheme];
    if (pairedAccent) {
      applyAccent(pairedAccent);
      fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accentColor: pairedAccent }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent('accent-changed', { detail: pairedAccent }));
    }
  };

  const baseClass = "inline-flex items-center justify-center px-3 py-2 text-sm font-medium";
  const activeClass = "bg-primary text-primary-foreground border-primary";
  const inactiveClass = "bg-transparent text-foreground border-border hover:bg-muted";

  if (!mounted) {
    return (
      <div className="inline-flex rounded-md shadow-sm" role="group">
        <button
          type="button"
          className={`${baseClass} rounded-l-md border ${inactiveClass}`}
          aria-label="Daylight Theme"
          title="Daylight Theme"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${baseClass} border-y ${inactiveClass}`}
          aria-label="Moonlight Theme"
          title="Moonlight Theme"
        >
          <Moon className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${baseClass} rounded-r-md border ${inactiveClass}`}
          aria-label="Starlight Theme"
          title="Starlight Theme"
        >
          <Star className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      <button
        type="button"
        className={`${baseClass} rounded-l-md border ${theme === "light" ? activeClass : inactiveClass}`}
        aria-label="Daylight Theme"
        title="Daylight Theme"
        onClick={() => handleThemeChange("light")}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${baseClass} border-y ${theme === "moonlight" ? activeClass : inactiveClass}`}
        aria-label="Moonlight Theme"
        title="Moonlight Theme"
        onClick={() => handleThemeChange("moonlight")}
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${baseClass} rounded-r-md border ${theme === "dark" ? activeClass : inactiveClass}`}
        aria-label="Starlight Theme"
        title="Starlight Theme"
        onClick={() => handleThemeChange("dark")}
      >
        <Star className="h-4 w-4" />
      </button>
    </div>
  );
}
