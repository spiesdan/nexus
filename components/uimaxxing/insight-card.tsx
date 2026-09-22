import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";

export function InsightCard() {
  return (
    <div className="hover-raise stroke-lit relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface/90 p-5">
      {/* faint sheen toward the top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent"
      />
      {/* deep blue glow bleeding in along the bottom edge; drift animation on
          the filter-free wrapper so the glows keep their blur */}
      <div aria-hidden className="animate-drift pointer-events-none absolute inset-0">
        <div className="absolute -bottom-10 inset-x-6 h-20 rounded-full bg-accent-blue/25 blur-2xl" />
        <div className="absolute -bottom-8 -right-4 size-24 rounded-full bg-accent-indigo/20 blur-2xl" />
      </div>

      <p className="relative text-sm leading-6">
        <span className="font-semibold text-fg">Meshing.</span>{" "}
        <span className="text-fg-muted">
          The joint graph
          <br />
          decides how every part bends.
        </span>
      </p>

      <button
        type="button"
        className="relative mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-sunk interactive hover:bg-white/90"
      >
        Read more
        <ArrowUpRightIcon className="size-3.5" weight="bold"/>
      </button>
    </div>
  );
}
