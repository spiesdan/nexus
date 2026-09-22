import { ArrowsOutSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react/ssr";

export function TerminalCard() {
  return (
    <div className="stroke-lit relative w-full max-w-md overflow-hidden rounded-xl bg-well shadow-2xl shadow-black/60">
      {/* Title bar */}
      <div className="flex h-12 items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.02] px-4">
        <span className="size-2 rounded-full bg-white" aria-hidden />
        <span className="text-[12px] font-medium text-fg-secondary">
          Terminal
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-fg-muted">
          <button
            type="button"
            aria-label="New tab"
            className="rounded-md p-1 interactive hover:bg-white/[0.05] hover:text-fg-secondary"
          >
            <PlusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Expand"
            className="rounded-md p-1 interactive hover:bg-white/[0.05] hover:text-fg-secondary"
          >
            <ArrowsOutSimpleIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close"
            className="rounded-md p-1 interactive hover:bg-white/[0.05] hover:text-fg-secondary"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        data-cursor-own
        className="relative h-[236px] cursor-text p-4 text-[12px] leading-relaxed"
      >
        {/* diagonal sheen toward the top-right corner */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/[0.05]"
          aria-hidden
        />
        <p className="text-fg-muted">
          [shell reconnected — replaying buffered output]
        </p>
        <p className="mt-1.5">
          <span className="text-code-accent">a.rivera@northwind</span>
          <span className="text-code-keyword"> ~/atlas</span>
          <span className="text-code-fn"> %</span>
          <span
            className="ml-1 inline-block h-[14px] w-[9px] translate-y-[2px] animate-blink rounded-[2px] border-[1.5px] border-[#e2a493]"
            aria-hidden
          />
        </p>
        <span className="absolute bottom-3 right-3 rounded-pill bg-white/[0.05] px-2.5 py-1 text-[10px] leading-none text-fg-muted">
          click to type
        </span>
      </div>
    </div>
  );
}
