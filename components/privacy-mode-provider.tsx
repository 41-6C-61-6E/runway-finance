'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { applyAccent } from '@/lib/utils/apply-accent';

// Apply saved accent immediately at module scope, before React renders,
// so there is no flash of the default violet on page navigation.
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('finance-accent');
    if (saved) {
      applyAccent(saved);
    }
  } catch { /* localStorage unavailable */ }
}

type PrivacyModeContextType = {
  privacyMode: boolean;
  togglePrivacyMode: () => Promise<void>;
  loading: boolean;
  shortcutLabel: string;
};

const PrivacyModeContext = createContext<PrivacyModeContextType | null>(null);

export function PrivacyModeProvider({ children }: { children: React.ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl+Shift+P');

  useEffect(() => {
    const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || '');
    setShortcutLabel(isMac ? 'Cmd+Shift+P' : 'Ctrl+Shift+P');
  }, []);

  const fetchPrivacyMode = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPrivacyMode(data.privacyMode || false);
        if (data.accentColor) {
          applyAccent(data.accentColor);
        }
      }
    } catch {
      setPrivacyMode(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrivacyMode();
  }, [fetchPrivacyMode]);

  useEffect(() => {
    if (loading) return;
    if (privacyMode) {
      document.documentElement.classList.add('privacy-mode-active');
    } else {
      document.documentElement.classList.remove('privacy-mode-active');
    }
  }, [privacyMode, loading]);

  // Canvas-based pixelation: renders text on a tiny canvas and scales up
  // with nearest-neighbor interpolation to create blocky pixel blocks.
  // Trivial change to trigger workflow run.
  useEffect(() => {
    if (loading) return;

    function cleanupPixelation() {
      // Remove canvas overlays from HTML elements
      document.querySelectorAll('canvas[data-privacy-overlay]').forEach(c => c.remove());
      // Remove fixed-position SVG overlay wrappers
      document.querySelectorAll('[data-privacy-svg-overlay]').forEach(c => c.remove());
      // Restore original fills on SVG text elements
      document.querySelectorAll('[data-privacy-uid]').forEach(el => {
        const origFill = el.getAttribute('data-privacy-fill');
        if (origFill !== null) {
          (el as SVGElement).style.fill = '';
          el.setAttribute('fill', origFill);
        }
        el.removeAttribute('data-privacy-uid');
        el.removeAttribute('data-privacy-fill');
      });
    }

    if (!privacyMode) {
      cleanupPixelation();
      return;
    }

    const PIXEL_SIZE = 8;

    /** Create a pixelated canvas from text content */
    function createPixelCanvas(
      text: string, width: number, height: number,
      color: string, fontWeight: string, fontFamily: string, fontSize: number
    ): HTMLCanvasElement | null {
      const smallW = Math.max(1, Math.ceil(width / PIXEL_SIZE));
      const smallH = Math.max(1, Math.ceil(height / PIXEL_SIZE));

      const small = document.createElement('canvas');
      small.width = smallW;
      small.height = smallH;
      const sCtx = small.getContext('2d');
      if (!sCtx) return null;

      const scaledFontSize = Math.max(1, fontSize / PIXEL_SIZE);
      sCtx.font = `${fontWeight} ${scaledFontSize}px ${fontFamily}`;
      sCtx.fillStyle = color;
      sCtx.textBaseline = 'middle';
      sCtx.fillText(text, 0, smallH / 2);

      const dpr = window.devicePixelRatio || 1;
      const display = document.createElement('canvas');
      display.width = Math.ceil(width * dpr);
      display.height = Math.ceil(height * dpr);
      const dCtx = display.getContext('2d');
      if (!dCtx) return null;
      dCtx.imageSmoothingEnabled = false;
      dCtx.drawImage(small, 0, 0, display.width, display.height);

      return display;
    }

    /** Pixelate a regular HTML element by appending a canvas child */
    function pixelateHtmlElement(el: Element) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.querySelector('canvas[data-privacy-overlay]')) return;

      const text = htmlEl.textContent?.trim();
      if (!text) return;

      const rect = htmlEl.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      if (width === 0 || height === 0) return;

      const computed = window.getComputedStyle(htmlEl);
      const canvas = createPixelCanvas(
        text, width, height,
        computed.color, computed.fontWeight, computed.fontFamily,
        parseFloat(computed.fontSize)
      );
      if (!canvas) return;

      canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;`;
      canvas.setAttribute('data-privacy-overlay', 'true');
      canvas.setAttribute('aria-hidden', 'true');
      htmlEl.appendChild(canvas);
    }

    /** Pixelate an SVG <text> element using a fixed-position overlay div.
     *  Reads the fill color FIRST, then hides the text, then overlays. */
    function pixelateSvgText(el: SVGTextElement) {
      // Skip if already processed
      if (el.hasAttribute('data-privacy-uid')) return;

      const text = el.textContent?.trim();
      if (!text) return;

      const rect = el.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      if (width === 0 || height === 0) return;

      // ── Read fill color BEFORE hiding ──
      const computed = window.getComputedStyle(el);
      const rawFill = computed.fill || computed.color || 'rgb(0,0,0)';
      const color = rawFill === 'currentColor' || rawFill === 'none' || rawFill === 'transparent'
        ? computed.color
        : rawFill;

      // Save original fill and hide the text
      const origFill = el.getAttribute('fill') || '';
      el.setAttribute('data-privacy-fill', origFill);
      el.style.fill = 'transparent';

      // Create pixelated canvas
      const canvas = createPixelCanvas(
        text, width, height, color,
        computed.fontWeight, computed.fontFamily, parseFloat(computed.fontSize)
      );
      if (!canvas) return;

      // Create a fixed-position wrapper to overlay the SVG text
      const wrapper = document.createElement('div');
      const id = `svg-${Math.random().toString(36).slice(2, 9)}`;
      el.setAttribute('data-privacy-uid', id);
      wrapper.setAttribute('data-privacy-svg-overlay', id);
      wrapper.style.cssText = `position:fixed;pointer-events:none;z-index:50;`;
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;

      canvas.style.cssText = `width:100%;height:100%;display:block;`;
      canvas.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(canvas);
      document.body.appendChild(wrapper);
    }

    /** Reposition all fixed SVG overlays (e.g. after scroll) */
    function repositionSvgOverlays() {
      document.querySelectorAll('[data-privacy-uid]').forEach(el => {
        const uid = el.getAttribute('data-privacy-uid');
        if (!uid) return;
        const wrapper = document.querySelector(`[data-privacy-svg-overlay="${uid}"]`) as HTMLElement;
        if (!wrapper) return;
        const rect = el.getBoundingClientRect();
        wrapper.style.left = `${rect.left}px`;
        wrapper.style.top = `${rect.top}px`;
        wrapper.style.width = `${Math.ceil(rect.width)}px`;
        wrapper.style.height = `${Math.ceil(rect.height)}px`;
      });
    }

    function pixelateAll() {
      // HTML and SVG elements with privacy classes
      document.querySelectorAll('.financial-value, .blur-number').forEach(el => {
        if (el instanceof SVGElement) {
          if (el.tagName === 'text') pixelateSvgText(el as unknown as SVGTextElement);
        } else {
          pixelateHtmlElement(el);
        }
      });

      // Recharts axis tick values (SVG <text> without blur-number class)
      document.querySelectorAll('.recharts-cartesian-axis-tick-value').forEach(el => {
        if (el.tagName === 'text') pixelateSvgText(el as unknown as SVGTextElement);
      });

      // Recharts legend text (HTML elements — CSS handles hiding)
      document.querySelectorAll('.recharts-legend-item-text').forEach(el => {
        pixelateHtmlElement(el);
      });
    }

    // Initial pass (after paint so dimensions are available)
    requestAnimationFrame(() => {
      pixelateAll();
    });

    // Re-pixelate when new DOM nodes appear (lazy-loaded content, route changes)
    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(pixelateAll);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Reposition fixed SVG overlays on scroll
    function handleScroll() {
      repositionSvgOverlays();
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Handle window resize — re-create canvases at new dimensions
    function handleResize() {
      cleanupPixelation();
      requestAnimationFrame(pixelateAll);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (rafId) cancelAnimationFrame(rafId);
      cleanupPixelation();
    };
  }, [privacyMode, loading]);

  const togglePrivacyMode = useCallback(async () => {
    const newMode = !privacyMode;
    setPrivacyMode(newMode);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ privacyMode: newMode }),
      });
    } catch {
      setPrivacyMode(privacyMode);
    }
  }, [privacyMode]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isKeyP = e.key === 'p' || e.key === 'P';
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && isKeyP) {
        e.preventDefault();
        togglePrivacyMode();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacyMode]);

  return (
    <PrivacyModeContext.Provider value={{ privacyMode, togglePrivacyMode, loading, shortcutLabel }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext);
  if (!context) {
    throw new Error('usePrivacyMode must be used within a PrivacyModeProvider');
  }
  return context;
}
