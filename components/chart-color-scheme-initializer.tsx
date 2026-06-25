'use client';

import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

export function ChartColorSchemeInitializer() {
  useChartColorScheme();
  const { theme } = useTheme();

  useEffect(() => {
    if (!theme) return;

    const updateThemeColor = () => {
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      if (metas.length > 0) {
        const temp = document.createElement('div');
        temp.style.color = 'var(--background)';
        document.body.appendChild(temp);
        const computedColor = getComputedStyle(temp).color;
        document.body.removeChild(temp);

        metas.forEach((meta) => {
          meta.setAttribute('content', computedColor);
        });
      }
    };

    updateThemeColor();
    const rafId = requestAnimationFrame(updateThemeColor);
    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  return null;
}
