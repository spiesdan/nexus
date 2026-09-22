import {
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpRightIcon,
  BankIcon,
  ChartBarIcon,
  ClockIcon,
  EnvelopeIcon,
  FileTextIcon,
  GlobeIcon,
  LifebuoyIcon,
  MinusIcon,
  ShieldCheckIcon,
  SidebarSimpleIcon,
  SquaresFourIcon,
  StackIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/* Phosphor's own component type: className plus `weight`, not `strokeWidth`. */
type IconType = Icon;

function NavRow({
  icon: Glyph,
  label,
  active = false,
  external = false,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  external?: boolean;
}) {
  return (
    <div
      className={cn(
        "row-hover interactive",
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm",
        active ? "bg-white/[0.04] text-fg" : "text-fg-secondary",
      )}
    >
      <Glyph className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {external ? (
        <ArrowUpRightIcon className="ml-auto size-3.5 shrink-0 text-fg-muted" />
      ) : null}
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pb-1 pt-5 text-[10px] uppercase tracking-[0.14em] text-fg-muted">
      {children}
    </div>
  );
}

/**
 * DeFi protocol sidebar — wordmark, grouped navigation with external-link
 * affordances, and a network announcement card pinned to the bottom.
 */
export function ProtocolSidebar() {
  return (
    <div className="w-full max-w-[248px] rounded-card stroke-lit fill-panel py-5">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-5">
        <span className="text-[20px] font-bold lowercase leading-none tracking-tight text-fg">
          northwind
        </span>
        <span className="rounded-pill border border-accent-indigo/50 px-1.5 py-px text-[9px] font-semibold tracking-wide text-accent-indigo">
          PRO
        </span>
        <SidebarSimpleIcon className="ml-auto size-4 text-fg-muted" />
      </div>

      {/* Navigation */}
      <nav className="mt-5 px-2">
        <NavRow icon={SquaresFourIcon} label="Dashboard" active />
        <NavRow icon={ClockIcon} label="Activity" />

        <GroupLabel>Explore</GroupLabel>
        <NavRow icon={ArrowLineDownIcon} label="Deposit" />
        <NavRow icon={ArrowLineUpIcon} label="Borrow" />

        <GroupLabel>Protocol</GroupLabel>
        <NavRow icon={ChartBarIcon} label="Insights" />
        <NavRow icon={ShieldCheckIcon} label="Security" external />
        <NavRow icon={GlobeIcon} label="Protocol" external />
        <NavRow icon={BankIcon} label="Governance" external />
        <NavRow icon={FileTextIcon} label="Developer Docs" external />
        <NavRow icon={StackIcon} label="Access Northwind V3" external />

        <GroupLabel>Support</GroupLabel>
        <NavRow icon={EnvelopeIcon} label="Contact Support" />
        <NavRow icon={LifebuoyIcon} label="Help Center" external />
      </nav>

      {/* Network promo */}
      <div className="relative mx-3 mt-6 overflow-hidden rounded-2xl border border-border fill-well p-4 pt-5">
        {/* concentric rings bleeding off the right edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-14 top-4 size-24 rounded-full border border-white/[0.04]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-4 size-40 rounded-full border border-white/[0.04]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-28 -top-14 size-56 rounded-full border border-white/[0.04]"
        />
        {/* faint accent tint */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-6 size-28 rounded-full bg-accent-violet/[0.08] blur-2xl"
        />

        <MinusIcon className="absolute right-3 top-3 size-4 text-fg-muted" />

        <div className="relative">
          <span className="bg-orb flex size-11 items-center justify-center rounded-full">
            <svg viewBox="0 0 24 24" className="size-5" fill="#fff" aria-hidden>
              <path d="M9 4.5 15.8 18.6H2.2L9 4.5Z" />
              <path d="M19 11 23 18.6h-7.9L19 11Z" />
            </svg>
          </span>
          <div className="mt-8 text-sm font-semibold text-fg">Orbit is Live</div>
          <div className="mt-0.5 text-xs text-fg-muted">Available on V4</div>
        </div>
      </div>
    </div>
  );
}
