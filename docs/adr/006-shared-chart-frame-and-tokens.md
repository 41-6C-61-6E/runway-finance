# ADR 006: Shared ChartFrame Wrapper and Semantic Token Standardization

## Status
Accepted

## Context
Over 100 Recharts charts used raw `<ResponsiveContainer>` wrappers with inconsistent heights, causing layout shifts during resize, unstyled tooltips with clipping issues, and duplicate Sankey diagram implementations. Font sizes and colors frequently relied on arbitrary pixel values (`text-[10px]`) and hex literals.

## Decision
1. Wrap all Recharts visualizations in `ChartFrame` (`components/charts/chart-frame.tsx`) with consistent aspect ratios and empty/loading states.
2. Unify Sankey node and link rendering in `components/charts/sankey/`.
3. Normalize all typography to semantic tokens (`text-caption`, `text-micro`) and map hex codes to CSS custom properties.

## Consequences
Consistent visual aesthetics, elimination of layout shifts and tooltip clipping bugs, and full WCAG AA contrast compliance across all chart palettes.

