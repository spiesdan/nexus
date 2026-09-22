import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/**
 * Step navigation pair. On hover the chevron slides 4px toward its own edge
 * while the label drifts 2px the other way, so the gap between glyph and word
 * opens up rather than the whole row sliding. Glyph and label are transitioned
 * separately (not `.hover-nudge`, which only moves the icon) but share the
 * house 200ms ease-snap so the two halves separate as one gesture.
 */
function StepPill({
  label,
  direction,
  hint,
}: {
  label: string;
  direction: "back" | "next";
  hint: string;
}) {
  const back = direction === "back";
  const Chevron = back ? CaretLeftIcon : CaretRightIcon;

  return (
    <button
      type="button"
      aria-label={hint}
      className={cn(
        // brightness rather than a background swap: the hairline is a masked
        // ::before ring, so one filter lifts fill and stroke together.
        "group flex h-10 min-w-[132px] items-center justify-center gap-3 rounded-pill fill-action stroke-lit px-5 text-sm font-medium text-fg select-none interactive hover:brightness-[1.22]",
        back ? "flex-row" : "flex-row-reverse",
      )}
    >
      <Chevron
        aria-hidden
        weight="bold"
        className={cn(
          "size-3.5 shrink-0 text-fg-muted transition-[transform,color] duration-200 ease-snap group-hover:text-fg-secondary",
          back ? "group-hover:-translate-x-1" : "group-hover:translate-x-1",
        )}
      />
      <span
        className={cn(
          "transition-transform duration-200 ease-snap",
          back ? "group-hover:translate-x-0.5" : "group-hover:-translate-x-0.5",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function BackNextPills() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 py-4">
      <StepPill label="Back" direction="back" hint="Go to the previous step" />
      <StepPill label="Next" direction="next" hint="Go to the next step" />
    </div>
  );
}
