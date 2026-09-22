import { cn } from "@/lib/utils";

/**
 * The library's button shapes, factored out of the original components so
 * every card uses the same three:
 *   solid  — the white pill CTA (as on the insight card's "Read more")
 *   ghost  — a translucent chip (as on the ask bar's control chips)
 *   quiet  — a bare label button for low-priority rows
 * The bolder gradient CTA lives in `GradientButton`.
 */
const variants = {
  solid:
    "bg-white text-sunk font-semibold hover:bg-white/90",
  ghost:
    "border border-white/[0.07] bg-white/[0.05] text-fg-secondary hover:bg-white/[0.08] hover:text-fg",
  quiet: "text-fg-secondary hover:text-fg",
};

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-5 text-sm",
};

export function PillButton({
  children,
  variant = "solid",
  size = "md",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill leading-none interactive",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
