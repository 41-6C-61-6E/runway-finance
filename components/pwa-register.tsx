"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "pwa-update";
const UPDATE_TOAST_PREF_KEY = "pf_update_toast_enabled";

/** Synchronous local mirror of the `notifyAppUpdates` user setting (default ON). */
function isUpdateToastEnabledLocal(): boolean {
  try {
    return localStorage.getItem(UPDATE_TOAST_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Server-confirmed check of the `notifyAppUpdates` user setting.
 * Falls back to the local mirror when the settings fetch fails
 * (e.g. logged out) so the toast still works with the last known pref.
 */
async function isUpdateToastEnabled(): Promise<boolean> {
  if (!isUpdateToastEnabledLocal()) return false;
  try {
    const res = await fetch("/api/user-settings", { credentials: "include" });
    if (!res.ok) return isUpdateToastEnabledLocal();
    const data = await res.json();
    const enabled = data?.notifyAppUpdates !== false;
    try {
      localStorage.setItem(UPDATE_TOAST_PREF_KEY, enabled ? "true" : "false");
    } catch {}
    return enabled;
  } catch {
    return isUpdateToastEnabledLocal();
  }
}

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

    const handleControllerChange = () => {
      window.location.reload();
    };

    if (navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    }

    let activeRegistration: ServiceWorkerRegistration | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRegistration) {
        activeRegistration.update().catch(() => {});
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        activeRegistration = registration;

        const triggerUpdateToast = async (waitingWorker: ServiceWorker | null) => {
          // Respect the user's update-notification preference (default ON).
          if (!isUpdateToastEnabledLocal()) return;
          if (!(await isUpdateToastEnabled())) return;
          if (cancelled) return;

          let data: any;
          try {
            const res = await fetch(`/version-info.json?t=${Date.now()}`);
            if (!res.ok) throw new Error("Failed to fetch version info");
            data = await res.json();
          } catch {
            // Never advertise an update we could not confirm — a failed
            // version fetch is not evidence of a new version.
            return;
          }
          if (cancelled) return;

          const currentBuild = typeof window !== 'undefined'
            ? localStorage.getItem('pf_installed_build') || process.env.NEXT_PUBLIC_BUILD_NUMBER
            : null;
          const currentHash = typeof window !== 'undefined'
            ? localStorage.getItem('pf_installed_hash') || process.env.NEXT_PUBLIC_COMMIT_HASH
            : null;

          // Already on the advertised build/hash → nothing to announce.
          if (
            (data.buildNumber && currentBuild && data.buildNumber === currentBuild) ||
            (data.hash && currentHash && data.hash === currentHash)
          ) {
            return;
          }

          let deltaCommits: string[] = [];
          if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            const matchedIndex = data.history.findIndex(
              (item: any) =>
                (currentHash && (item.hash === currentHash || item.fullHash === currentHash)) ||
                (currentBuild && (
                  item.hash === currentBuild ||
                  item.fullHash === currentBuild ||
                  item.buildNumber === currentBuild ||
                  item.message === currentBuild
                ))
            );

            if (matchedIndex === 0) {
              // Installed version is already the latest entry — no update.
              return;
            } else if (matchedIndex > 0) {
              deltaCommits = data.history.slice(0, matchedIndex).map((item: any) => item.message);
            } else {
              const topMsg = data.history[0]?.message || (Array.isArray(data.commits) ? data.commits[0] : null);
              if (topMsg) deltaCommits = [topMsg];
            }
          } else if (Array.isArray(data.commits) && data.commits.length > 0) {
            deltaCommits = [data.commits[0]];
          }

          const applyUpdate = () => {
            toast.dismiss(UPDATE_TOAST_ID);
            if (data.buildNumber) {
              localStorage.setItem('pf_installed_build', data.buildNumber);
            }
            const newHash = data.hash || (data.history && data.history[0]?.hash);
            if (newHash) {
              localStorage.setItem('pf_installed_hash', newHash);
            }

            if (waitingWorker) {
              waitingWorker.postMessage({ type: "SKIP_WAITING" });
              // Fallback reload if controllerchange does not trigger within 1s
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } else {
              window.location.reload();
            }
          };

          toast.info("A new version of Personal Finance is available!", {
            id: UPDATE_TOAST_ID,
            description: (
              <div className="flex flex-col gap-1.5 mt-1">
                <span>Click update to load the latest changes.</span>
                {deltaCommits.length > 0 && (
                  <div className="border-t border-border/50 pt-1.5 mt-1.5">
                    <span className="font-semibold text-xs text-muted-foreground block mb-1">
                      New changes ({deltaCommits.length}):
                    </span>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5 max-h-36 overflow-y-auto">
                      {deltaCommits.map((commit: string, index: number) => (
                        <li key={index}>{commit}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ),
            action: {
              label: "Update",
              onClick: applyUpdate,
            },
            duration: Infinity,
          });
        };

        if (registration.waiting) {
          triggerUpdateToast(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                triggerUpdateToast(installing);
              }
            });
          }
        });

        // Check for updates periodically (every hour)
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      })
      .catch(() => {});


    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (navigator.serviceWorker.removeEventListener) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
