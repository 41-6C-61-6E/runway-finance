import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** The heading text. Keep it in sentence case. */
  children: React.ReactNode;
  /**
   * Tier.
   * - `"md"` (default) → page/section title: `text-[15px] font-semibold`, rendered as `<h2>`
   * - `"sm"`           → sub-section title: `text-[13px] font-semibold text-muted-foreground`, rendered as `<h3>`
   */
  size?: "md" | "sm";
  /**
   * Micro-caps variant for true column / field labels only (e.g. a metric caption
   * above a number). Renders a non-heading `<div>` in `text-xs uppercase tracking-wider`.
   * Use sparingly.
   */
  label?: boolean;
  /** Optional leading glyph (size controlled by the caller's own class). */
  icon?: React.ReactNode;
  className?: string;
}

const TIER: Record<"md" | "sm", string> = {
  md: "text-[15px] font-semibold text-foreground leading-snug",
  sm: "text-[13px] font-semibold text-muted-foreground leading-snug",
};

/**
 * Canonical section heading.
 *
 * Before this component existed, the "section title" role appeared in five or
 * more ad-hoc styles across the app (`text-lg font-semibold` h2,
 * `text-base font-semibold` h2, `text-xs uppercase tracking-wider` p,
 * `text-base font-normal`, `text-sm font-bold`). This consolidates them into
 * two real tiers plus a spare micro-caps label, with a correct `h2`/`h3` DOM
 * outline for screen readers.
 *
 * ```tsx
 * <SectionHeading>Chart Defaults</SectionHeading>              // h2
 * <SectionHeading size="sm" icon={<Flag className="h-4 w-4" />}>
 *   Primary Profile
 * </SectionHeading>                                             // h3
 * <SectionHeading label icon={<Home className="h-3 w-3" />}>
 *   Total Equity
 * </SectionHeading>                                             // field/metric label
 * ```
 */
function SectionHeading({
  children,
  size = "md",
  label = false,
  icon,
  className,
  ...props
}: SectionHeadingProps) {
  const textClass = label
    ? "text-xs font-semibold text-muted-foreground uppercase tracking-wider"
    : TIER[size];

  const rowClass = cn(
    "flex items-center min-w-0",
    label ? "gap-1.5" : "gap-2",
    textClass,
    className,
  );

  const content = (
    <>
      {icon != null && (
        <span className="inline-flex shrink-0 items-center">{icon}</span>
      )}
      <span className="min-w-0">{children}</span>
    </>
  );

  if (label) {
    return (
      <div className={rowClass} {...props}>
        {content}
      </div>
    );
  }

  if (size === "sm") {
    return (
      <h3 className={rowClass} {...props}>
        {content}
      </h3>
    );
  }

  return (
    <h2 className={rowClass} {...props}>
      {content}
    </h2>
  );
}

export { SectionHeading };
export type { SectionHeadingProps };
