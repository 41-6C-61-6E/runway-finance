"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function PWARegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    let cancelled = false;
    let intervalId: any;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                fetch(`/version-info.json?t=${Date.now()}`)
                  .then((res) => {
                    if (!res.ok) throw new Error("Failed to fetch version info");
                    return res.json();
                  })
                  .then((data) => {
                    if (cancelled) return;
                    toast.info("A new version of Personal Finance is available!", {
                      id: "pwa-update",
                      description: (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <span>Click update to load the latest changes.</span>
                          {data.commits && data.commits.length > 0 && (
                            <div className="border-t border-border/50 pt-1.5 mt-1.5">
                              <span className="font-semibold text-xs text-muted-foreground block mb-1">
                                What's new:
                              </span>
                              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                                {data.commits.map((commit: string, index: number) => (
                                  <li key={index}>{commit}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ),
                      action: {
                        label: "Update",
                        onClick: () => window.location.reload(),
                      },
                      duration: Infinity,
                    });
                  })
                  .catch(() => {
                    if (cancelled) return;
                    toast.info("A new version of Personal Finance is available!", {
                      id: "pwa-update",
                      description: "Click update to load the latest changes.",
                      action: {
                        label: "Update",
                        onClick: () => window.location.reload(),
                      },
                      duration: Infinity,
                    });
                  });
              }
            });
          }
        });

        // Check for updates every hour (3600000ms)
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
