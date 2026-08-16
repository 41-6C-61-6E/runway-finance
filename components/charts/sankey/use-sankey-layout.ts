'use client';

import { useMemo, useState, useEffect } from 'react';

export interface SankeyColumnMetrics {
  columns: number[];
  columnHeights: number[];
  numColumns: number;
}

/**
 * Calculates topological column index for each node via BFS or link structure.
 */
export function calculateSankeyColumns(
  nodes: Array<{ id: string; isHub?: boolean; type?: string }>,
  links: Array<{ source: string | number; target: string | number; value: number }>
): SankeyColumnMetrics {
  const nodeCount = nodes.length;
  if (nodeCount === 0) {
    return { columns: [], columnHeights: [], numColumns: 0 };
  }

  const idToIndex = new Map<string, number>();
  nodes.forEach((n, idx) => idToIndex.set(n.id, idx));

  // Determine incoming & outgoing links for each node
  const inDegree = new Array(nodeCount).fill(0);
  const outDegree = new Array(nodeCount).fill(0);
  const adj = Array.from({ length: nodeCount }, () => [] as number[]);

  links.forEach((l) => {
    const sIdx = typeof l.source === 'number' ? l.source : idToIndex.get(l.source);
    const tIdx = typeof l.target === 'number' ? l.target : idToIndex.get(l.target);
    if (sIdx !== undefined && tIdx !== undefined && sIdx >= 0 && tIdx >= 0) {
      outDegree[sIdx]++;
      inDegree[tIdx]++;
      adj[sIdx].push(tIdx);
    }
  });

  const columns = new Array(nodeCount).fill(0);

  // Sources (no in-degree) are col 0
  // Hubs are typically col 2 in a 5-column layout (or col 1 in 3-column)
  nodes.forEach((n, idx) => {
    if (n.isHub || n.type === 'hub') {
      columns[idx] = 2;
    } else if (inDegree[idx] === 0) {
      columns[idx] = 0;
    } else if (outDegree[idx] === 0) {
      columns[idx] = 4;
    } else {
      columns[idx] = 1;
    }
  });

  // Adjust columns based on links to hub
  links.forEach((l) => {
    const sIdx = typeof l.source === 'number' ? l.source : idToIndex.get(l.source);
    const tIdx = typeof l.target === 'number' ? l.target : idToIndex.get(l.target);
    if (sIdx !== undefined && tIdx !== undefined) {
      const sNode = nodes[sIdx];
      const tNode = nodes[tIdx];
      if (tNode?.isHub || tNode?.type === 'hub') {
        if (inDegree[sIdx] > 0) {
          columns[sIdx] = 1; // Parent category before hub
        }
      }
      if (sNode?.isHub || sNode?.type === 'hub') {
        if (outDegree[tIdx] > 0) {
          columns[tIdx] = 3; // Parent category after hub
        }
      }
    }
  });

  const maxCol = Math.max(...columns, 0);

  return {
    columns,
    columnHeights: [],
    numColumns: maxCol + 1,
  };
}

/**
 * Hook to dynamically observe app theme color changes for canvas/SVG elements.
 */
export function useThemeColors() {
  const [themeColors, setThemeColors] = useState({
    chart1: '#3b82f6',
    chart2: '#10b981',
    chart3: '#f59e0b',
    chart4: '#8b5cf6',
    chart5: '#ec4899',
    card: '#ffffff',
    primary: '#6366f1',
    border: '#e2e8f0',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateColors = () => {
      const computed = getComputedStyle(document.documentElement);
      setThemeColors({
        chart1: computed.getPropertyValue('--chart-1').trim() || '#3b82f6',
        chart2: computed.getPropertyValue('--chart-2').trim() || '#10b981',
        chart3: computed.getPropertyValue('--chart-3').trim() || '#f59e0b',
        chart4: computed.getPropertyValue('--chart-4').trim() || '#8b5cf6',
        chart5: computed.getPropertyValue('--chart-5').trim() || '#ec4899',
        card: computed.getPropertyValue('--card').trim() || '#ffffff',
        primary: computed.getPropertyValue('--primary').trim() || '#6366f1',
        border: computed.getPropertyValue('--border').trim() || '#e2e8f0',
      });
    };

    updateColors();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')
        ) {
          updateColors();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return themeColors;
}
