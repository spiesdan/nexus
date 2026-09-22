import {
  BriefcaseIcon,
  CaretDownIcon,
  ChartBarIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  FadersHorizontalIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  MonitorIcon,
  MoonIcon,
  PlugIcon,
  ScrollIcon,
  SquaresFourIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type NavItem = { icon: Icon; label: string; active?: boolean };

const SETTINGS_NAV: NavItem[] = [
  { icon: FadersHorizontalIcon, label: "General", active: true },
  { icon: UserIcon, label: "Account" },
  { icon: ChartBarIcon, label: "Usage" },
  { icon: BriefcaseIcon, label: "Capabilities" },
  { icon: CodeIcon, label: "Studio Code" },
  { icon: ListChecksIcon, label: "Teamspace" },
];

const CUSTOMIZE_NAV: NavItem[] = [
  { icon: ScrollIcon, label: "Skills" },
  { icon: SquaresFourIcon, label: "Connectors" },
  { icon: PlugIcon, label: "Plugins" },
  { icon: ClockCounterClockwiseIcon, label: "Memory" },
];

const APPEARANCE: { icon: Icon; label: string; active?: boolean }[] = [
  { icon: MonitorIcon, label: "System", active: true },
  { icon: SunIcon, label: "Light" },
  { icon: MoonIcon, label: "Dark" },
];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.14em] text-fg-muted">
      {children}
    </div>
  );
}

function NavRow({ item }: { item: NavItem }) {
  const Glyph = item.icon;
  return (
    <div
      className={cn(
        "row-hover interactive",
        "flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm",
        item.active
          ? "bg-white/[0.06] text-fg"
          : "text-fg-secondary interactive hover:text-fg",
      )}
    >
      <Glyph className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </div>
  );
}

function Field({ value }: { value: string }) {
  return (
    <div className="flex h-9 w-full max-w-48 items-center rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 text-sm text-fg">
      {value}
    </div>
  );
}

function AvatarMark() {
  return (
    <div className="bg-orb grid size-9 place-items-center rounded-full">
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6.6 1.6h2.8a1 1 0 0 1 1 1v4h4a1 1 0 0 1 1 1v2.8a1 1 0 0 1-1 1h-4v4a1 1 0 0 1-1 1H6.6a1 1 0 0 1-1-1v-4h-4a1 1 0 0 1-1-1V7.6a1 1 0 0 1 1-1h4v-4a1 1 0 0 1 1-1Z"
          fill="#fff"
        />
      </svg>
    </div>
  );
}

export function SettingsPanel() {
  return (
    <div className="stroke-lit flex min-h-[420px] w-full max-w-3xl flex-col overflow-hidden rounded-card fill-panel sm:flex-row">
      {/* Left rail */}
      <div className="w-full shrink-0 border-b border-border bg-stage p-3 sm:w-56 sm:border-b-0 sm:border-r">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3">
          <MagnifyingGlassIcon className="size-4 shrink-0 text-fg-muted" />
          <span className="text-sm text-fg-muted">Search</span>
        </div>

        <div className="mt-4">
          <GroupLabel>Settings</GroupLabel>
          {SETTINGS_NAV.map((item) => (
            <NavRow key={item.label} item={item} />
          ))}
        </div>

        <div className="mt-4">
          <GroupLabel>Customize</GroupLabel>
          {CUSTOMIZE_NAV.map((item) => (
            <NavRow key={item.label} item={item} />
          ))}
        </div>
      </div>

      {/* Right pane */}
      <div className="relative flex-1 p-6">
        <XIcon className="absolute right-5 top-5 size-4 text-fg-muted" />

        <h3 className="text-base font-semibold text-fg">Profile</h3>

        <dl className="mt-2">
          <div className="row-hover flex min-h-14 items-center justify-between gap-4 border-b border-border px-2 py-2 text-sm">
            <dt className="text-fg-secondary">Avatar</dt>
            <dd>
              <AvatarMark />
            </dd>
          </div>
          <div className="row-hover flex min-h-14 items-center justify-between gap-4 border-b border-border px-2 py-2 text-sm">
            <dt className="text-fg-secondary">Full name</dt>
            <dd>
              <Field value="Yogi" />
            </dd>
          </div>
          <div className="row-hover flex min-h-14 items-center justify-between gap-4 border-b border-border px-2 py-2 text-sm">
            <dt className="text-fg-secondary">What should Studio call you?</dt>
            <dd>
              <Field value="Yogi" />
            </dd>
          </div>
          <div className="row-hover flex min-h-14 items-center justify-between gap-4 border-b border-border px-2 py-2 text-sm">
            <dt className="text-fg-secondary">What best describes your work?</dt>
            <dd className="flex items-center gap-2">
              <span className="text-fg">Design</span>
              <CaretDownIcon className="size-4 text-fg-muted" />
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <p className="text-sm text-fg">Instructions for Studio</p>
          <p className="mt-1 text-xs text-fg-muted">
            Studio will keep these in mind for this and any of your associated
            accounts across chats and Teamspace.
          </p>
          <div className="mt-3 h-24 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-fg-muted">
            e.g. keep explanations brief and to the point
          </div>
        </div>

        <h3 className="mt-8 text-base font-semibold text-fg">Preferences</h3>
        <div className="row-hover flex min-h-14 items-center justify-between gap-4 border-b border-border px-2 py-2 text-sm">
          <span className="text-fg-secondary">Appearance</span>
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
            {APPEARANCE.map((mode) => {
              const Glyph = mode.icon;
              return (
                <div
                  key={mode.label}
                  aria-label={mode.label}
                  className={cn(
                    "grid size-7 place-items-center rounded-md",
                    mode.active ? "bg-white/[0.08] text-fg" : "text-fg-muted",
                  )}
                >
                  <Glyph className="size-3.5" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
