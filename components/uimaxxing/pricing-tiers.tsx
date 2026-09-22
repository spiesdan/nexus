import type { ComponentType } from "react";
import {
  ArrowUpRightIcon,
  CaretRightIcon,
  CheckIcon,
  DiamondIcon,
  SparkleIcon,
  UserIcon,
  UsersIcon,
} from "@phosphor-icons/react/ssr";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;

type Tier = {
  name: string;
  tagline: string;
  from?: boolean;
  price: string;
  cta: string;
  ctaIcon: IconType;
  leadIn?: string;
  leadInIcon?: IconType;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    tagline: "Best for trying out Studio",
    price: "₹0",
    cta: "Get Free",
    ctaIcon: CaretRightIcon,
    features: [
      "Unlimited text chats with Core Luna",
      "Limited messages with uploads",
      "Limited and slower image generation",
      "Limited voice chats",
      "Limited deep research",
      "Limited memory and context",
      "Limited Agent access",
      "Limited Workspace access on desktop",
    ],
  },
  {
    name: "Go",
    tagline: "Best for longer conversations",
    price: "₹399",
    cta: "Get Go",
    ctaIcon: ArrowUpRightIcon,
    leadIn: "Everything in Free and:",
    leadInIcon: SparkleIcon,
    features: [
      "More messages with tools",
      "More uploads",
      "More image creation",
      "More voice chats",
      "Longer memory",
    ],
  },
  {
    name: "Plus",
    tagline: "Best for advanced work and productivity",
    price: "₹1,999",
    cta: "Get Plus",
    ctaIcon: CaretRightIcon,
    leadIn: "Everything in Go and:",
    leadInIcon: SparkleIcon,
    features: [
      "Advanced reasoning models with Core 5.6",
      "Expanded messages and uploads",
      "More complex and accurate image creation",
      "Expanded deep research",
      "Expanded memory and context",
      "Projects, scheduled tasks, and custom GPTs",
      "Expanded Agent usage",
    ],
  },
  {
    name: "Pro",
    tagline: "Best for research and coding",
    from: true,
    price: "₹10,699",
    cta: "Get Pro",
    ctaIcon: CaretRightIcon,
    leadIn: "Everything in Plus and:",
    leadInIcon: DiamondIcon,
    features: [
      "5x or 20x more usage",
      "Pro reasoning with Sol Pro",
      "Maximum Agent tasks",
      "Unlimited and faster image creation",
      "Maximum deep research",
      "Maximum memory and context",
      "Expanded projects, tasks, and custom GPTs",
      "Research preview of new features",
    ],
  },
];

/**
 * Four-column plan comparison with an audience switcher above it.
 */
export function PricingTiers() {
  return (
    <div className="w-full max-w-4xl">
      {/* Audience switch */}
      {/* The two audience pills are wider than a phone; the row scrolls
          rather than wrapping a label inside a pill. */}
      <div className="scroll-track flex justify-center">
        <div className="inline-flex w-max items-center gap-1 rounded-pill border border-border bg-white/[0.04] p-1">
          <button
            type="button"
            className="interactive flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-white/[0.08] px-4 text-sm text-fg"
          >
            <UserIcon className="size-3.5" />
            Individual
          </button>
          <button
            type="button"
            className="interactive flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-4 text-sm text-fg-muted hover:bg-white/[0.05] hover:text-fg-secondary"
          >
            <UsersIcon className="size-3.5" />
            Business &amp; Enterprise
          </button>
        </div>
      </div>

      {/* Tiers */}
      <div className="mt-8 grid grid-cols-1 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
        {TIERS.map((tier) => {
          const CtaIcon = tier.ctaIcon;
          const LeadInIcon = tier.leadInIcon;

          return (
            <div
              key={tier.name}
              className="px-5 pb-6 lg:border-l lg:border-border lg:first:border-l-0"
            >
              <div className="text-2xl font-semibold text-fg">{tier.name}</div>
              <div className="mt-1 min-h-[40px] text-sm leading-snug text-fg-muted">
                {tier.tagline}
              </div>

              <div className="mt-8">
                {tier.from ? (
                  <div className="text-sm text-fg-muted">From</div>
                ) : null}
                {/* Four tiers across leaves ~196px a column; the period drops
                    under the figure rather than pushing it out of the cell. */}
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-3xl font-semibold tabular-nums text-fg xl:text-4xl">
                    {tier.price}
                  </span>
                  <span className="text-sm text-fg-muted">/ month</span>
                </div>
              </div>

              <PillButton variant="solid" size="lg" className="mt-5 w-full">
                {tier.cta}
                <CtaIcon className="size-4" />
              </PillButton>

              <div className="mt-6">
                {tier.leadIn && LeadInIcon ? (
                  <div className="flex items-start gap-2">
                    <LeadInIcon className="mt-0.5 size-3.5 shrink-0 text-fg" />
                    <span className="text-[13px] font-semibold leading-snug text-fg">
                      {tier.leadIn}
                    </span>
                  </div>
                ) : null}

                <ul
                  className={cn(
                    "space-y-2.5 text-[13px] leading-snug",
                    tier.leadIn && "mt-3 border-t border-border pt-3",
                  )}
                >
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                      <span className="text-fg-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
