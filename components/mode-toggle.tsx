"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Star } from "lucide-react";

export default function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      <button
        type="button"
        className={`inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-l-md border ${
          theme === "light" 
            ? "bg-primary text-primary-foreground border-primary" 
            : "bg-transparent text-foreground border-border hover:bg-muted"
        }`}
        aria-label="Light Theme"
        onClick={() => setTheme("light")}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`inline-flex items-center justify-center px-3 py-2 text-sm font-medium border-y ${
          theme === "moonlight" 
            ? "bg-primary text-primary-foreground border-primary" 
            : "bg-transparent text-foreground border-border hover:bg-muted"
        }`}
        aria-label="Moonlight Theme"
        onClick={() => setTheme("moonlight")}
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-r-md border ${
          theme === "dark" 
            ? "bg-primary text-primary-foreground border-primary" 
            : "bg-transparent text-foreground border-border hover:bg-muted"
        }`}
        aria-label="Dark Theme"
        onClick={() => setTheme("dark")}
      >
        <Star className="h-4 w-4" />
      </button>
    </div>
  );
}
