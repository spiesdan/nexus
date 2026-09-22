import type { ComponentType } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  ClockIcon,
  GiftIcon,
  MonitorIcon,
} from "@phosphor-icons/react/ssr";

import { Badge } from "@/components/ui/badge";
import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;

type Plan = {
  ribbon: string;
  highlighted: boolean;
  tier: string;
  tagline: string;
  price: string;
  leadIn: string;
  accents: { icon: IconType; label: string }[];
  checks: string[];
  cta: string;
};

const PLANS: Plan[] = [
  {
    ribbon: "+US$40 free Computer credits",
    highlighted: true,
    tier: "pro",
    tagline: "Advanced answers and top AI models",
    price: "US$17",
    leadIn: "Everything in Free and:",
    accents: [
      { icon: MonitorIcon, label: "Expanded computer access" },
      { icon: GiftIcon, label: "4,000 bonus credits" },
    ],
    checks: [
      "Deep research",
      "Access to top AI models",
      "Select between AI models",
      "Create polished documents & apps",
      "More usage limits and memory",
    ],
    cta: "Get Pro",
  },
  {
    ribbon: "+US$450 free Computer credits",
    highlighted: false,
    tier: "max",
    tagline: "Unlimited usage and top performance",
    price: "US$167",
    leadIn: "Everything in Pro and:",
    accents: [
      { icon: MonitorIcon, label: "Maximum Computer usage" },
      { icon: GiftIcon, label: "35,000 bonus credits" },
      { icon: ArrowsClockwiseIcon, label: "10,000 monthly credits" },
    ],
    checks: [
      "Expert level research",
      "Frontier AI models",
      "Highest usage limits and memory",
      "Priority access to new features",
    ],
    cta: "Get Max",
  },
];

/**
 * Side-by-side subscription cards, each opening with a limited-time ribbon
 * that forms the top of the card rather than floating above it.
 */
export function PlanCompare() {
  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
      {PLANS.map((plan) => (
        /* The lift sits on the wrapper, not the card: raising the card alone
           would slide it out from under its own ribbon on hover. */
        <div key={plan.tier} className="hover-raise group">
          {/* Ribbon — the top of the card, not a chip resting on it. Its
              bottom corners are square and the card's top corners are too, so
              the two outlines run straight into each other; it also takes the
              plan's border colour, so a highlighted plan is ringed all the way
              round rather than only below the seam. */}
          <div
            className={cn(
              "flex h-11 items-center justify-between rounded-t-2xl border border-b-0 bg-white/[0.04] px-4 text-[13px] group-hover:border-white/[0.18]",
              plan.highlighted ? "border-accent-blue/60" : "border-border",
            )}
          >
            <span className="text-fg">{plan.ribbon}</span>
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              <ClockIcon className="size-3" />
              Limited time
            </span>
          </div>

          {/* Card */}
          <div
            className={cn(
              "flex min-h-[420px] flex-col rounded-b-2xl border fill-well p-5 group-hover:border-white/[0.18]",
              plan.highlighted ? "border-accent-blue/60" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xl">
                <span className="font-light text-fg-secondary">northwind</span>
                <span className="font-medium text-fg"> {plan.tier}</span>
              </div>
              {plan.highlighted ? (
                <Badge variant="neutral">Popular</Badge>
              ) : null}
            </div>

            <div className="mt-1 text-sm text-fg-muted">{plan.tagline}</div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="text-3xl font-semibold tabular-nums text-fg">
                {plan.price}
              </span>
              <span className="max-w-[112px] text-xs leading-tight text-fg-muted">
                /month or equivalent, when billed annually
              </span>
            </div>

            <div className="my-5 border-t border-border" />

            <div className="text-sm text-fg-secondary">{plan.leadIn}</div>

            <ul className="mt-4 space-y-3 text-[13px]">
              {plan.accents.map(({ icon: Glyph, label }) => (
                <li key={label} className="row-hover -mx-1.5 flex items-start gap-2 rounded-sm px-1.5 py-0.5">
                  <Glyph className="mt-0.5 size-3.5 shrink-0 text-accent-blue" />
                  <span className="font-medium text-accent-blue">{label}</span>
                </li>
              ))}
              {plan.checks.map((item) => (
                <li key={item} className="row-hover -mx-1.5 flex items-start gap-2 rounded-sm px-1.5 py-0.5">
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                  <span className="text-fg-secondary">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-6">
              <PillButton variant="solid" size="lg" className="w-full">
                {plan.cta}
              </PillButton>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
