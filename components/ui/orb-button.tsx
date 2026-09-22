import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * The Figma "Action — Request" pill (156:13383 / 156:13354): a dark lit body
 * with the aurora orb seated in the leading slot. Two sizes and a muted twin
 * — the muted one swaps the sphere for a flat chip and drops the label to
 * 71% so a pair reads as one selected / one unselected side.
 */
const sizes = {
  sm: {
    pill: "h-[47px] gap-2.5 rounded-2xl py-[5px] pl-[5px] pr-4",
    orb: "size-[37px] rounded-xl",
    icon: "size-3",
    label: "text-sm tracking-[0.01em]",
  },
  lg: {
    pill: "h-[76px] gap-4 rounded-pill py-2 pl-2 pr-[26px]",
    orb: "size-[60px] rounded-full",
    icon: "size-5",
    label: "text-[22px] tracking-[0.01em]",
  },
};

export function OrbButton({
  label,
  icon: Glyph = ArrowUpRightIcon,
  size = "sm",
  muted = false,
  className,
  ...props
}: {
  label: string;
  /** Defaults to the arrow in the Figma source. */
  icon?: Icon;
  size?: keyof typeof sizes;
  muted?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const s = sizes[size];

  return (
    <button
      type="button"
      className={cn(
        "stroke-lit fill-action inline-flex shrink-0 items-center interactive hover:brightness-110",
        s.pill,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center",
          s.orb,
          muted
            ? "bg-white/[0.05]"
            : "bg-orb-tilt shadow-[0_1px_26px_rgba(100,123,176,0.5)]",
        )}
      >
        <Glyph
          className={cn(s.icon, muted ? "text-fg/70" : "text-white")}
          weight="bold"
        />
      </span>
      <span
        className={cn(
          "font-semibold leading-none",
          s.label,
          muted ? "text-fg/70" : "text-fg",
        )}
      >
        {label}
      </span>
    </button>
  );
}
