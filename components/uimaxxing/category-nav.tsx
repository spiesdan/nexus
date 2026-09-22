import {
  CaretRightIcon,
  ColumnsIcon,
  PulseIcon,
  TrendUpIcon,
} from "@phosphor-icons/react/ssr";

const LEAD = [
  { label: "Trending", icon: TrendUpIcon, active: true },
  { label: "Combos", icon: ColumnsIcon, active: false },
  { label: "Perps", icon: PulseIcon, active: false },
];

const LABELS_LEAD = ["Breaking", "New"];
const LABELS_TAIL = [
  "Politics",
  "Sports",
  "Crypto",
  "Esports",
  "Elections",
  "Finance",
  "Geopolitics",
  "Tech",
  "Culture",
  "Economy",
  "Weather",
];

function Chip({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="interactive snap-item shrink-0 whitespace-nowrap rounded-pill px-2 py-1 text-sm text-fg-secondary hover:bg-white/[0.06] hover:text-fg"
    >
      {label}
    </button>
  );
}

/**
 * Horizontal category strip — trending first, then market verticals running
 * off the right edge. Scrolls with snap points so it settles on a category
 * rather than drifting to a stop mid-label.
 */
export function CategoryNav() {
  return (
    <div className="relative flex h-12 w-full max-w-3xl items-center rounded-pill stroke-lit fill-panel pl-3 pr-11">
      <div className="scroll-snappy scrollbar-none snap-x-list flex items-center gap-3 overflow-x-auto">
        {LEAD.map(({ label, icon: Glyph, active }) => (
          <button
            key={label}
            type="button"
            className="interactive snap-item flex shrink-0 items-center gap-2 rounded-pill px-2 py-1 hover:bg-white/[0.06]"
          >
            <Glyph
              className={active ? "size-4 text-fg" : "size-4 text-fg-secondary"}
              aria-hidden
            />
            <span
              className={
                active
                  ? "text-sm font-semibold text-fg"
                  : "text-sm text-fg-secondary"
              }
            >
              {label}
            </span>
          </button>
        ))}

        {LABELS_LEAD.map((label) => (
          <Chip key={label} label={label} />
        ))}

        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />

        {LABELS_TAIL.map((label) => (
          <Chip key={label} label={label} />
        ))}
      </div>

      {/* Fade + affordance over the right edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-px right-9 w-10 rounded-r-pill bg-gradient-to-r from-transparent to-raised-2"
      />
      <button
        type="button"
        aria-label="Scroll categories"
        className="hover-nudge interactive absolute right-2 grid size-7 shrink-0 place-items-center rounded-full text-fg-secondary hover:bg-white/[0.08] hover:text-fg"
      >
        <CaretRightIcon className="size-4" />
      </button>
    </div>
  );
}
