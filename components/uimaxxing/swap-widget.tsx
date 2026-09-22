"use client";

import { useState } from "react";
import { ArrowDownIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { TypingField } from "@/components/ui/typing-field";
import { GradientButton } from "@/components/ui/gradient-button";

const TABS = ["Swap & Bridge", "Private", "Gas"];

/** Orbit token mark — solid red circle, white glyph. */
function AvaxToken() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e84142]">
      <svg viewBox="0 0 24 24" className="size-4" fill="#ffffff" aria-hidden>
        <path d="M11.35 4.4c.27-.5.99-.5 1.26 0l1.91 3.45c.38.69.38 1.52 0 2.21l-4.41 7.97c-.34.6-.97.97-1.65.97H4.72c-.56 0-.91-.6-.64-1.09L11.35 4.4Z" />
        <path d="M17.2 13.8c.25-.44.94-.44 1.19 0l2.53 4.47c.25.45-.07.73-.58.73h-5.09c-.51 0-.83-.28-.58-.73L17.2 13.8Z" />
      </svg>
    </span>
  );
}

/** Helix token mark — blue circle, faceted white glyph. */
function EthToken() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#627eea]">
      <svg viewBox="0 0 24 24" className="size-4" fill="#ffffff" aria-hidden>
        <path d="M12.37 3v6.65l5.62 2.51L12.37 3Z" fillOpacity="0.6" />
        <path d="M12.37 3 6.75 12.16l5.62-2.51V3Z" />
        <path d="M12.37 16.48V21L18 13.21l-5.63 3.27Z" fillOpacity="0.6" />
        <path d="M12.37 21v-4.52l-5.62-3.27L12.37 21Z" />
        <path d="M12.37 15.43l5.62-3.27-5.62-2.51v5.78Z" fillOpacity="0.2" />
        <path d="M6.75 12.16l5.62 3.27V9.65l-5.62 2.51Z" fillOpacity="0.6" />
      </svg>
    </span>
  );
}

function SelectToken({ icon }: { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className="interactive group flex shrink-0 items-center gap-2.5 rounded-pill bg-raised-2 p-1.5 pr-4 shadow-[0_6px_16px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.05] hover:bg-border hover:ring-white/[0.14]"
    >
      <span className="transition-transform duration-200 ease-snap group-hover:scale-110">
        {icon}
      </span>
      <span className="text-sm font-medium text-fg">Select</span>
    </button>
  );
}

export function SwapWidget() {
  const [tab, setTab] = useState(0);

  return (
    <div className="stroke-aurora-soft relative w-full max-w-sm rounded-3xl bg-surface p-4">
      {/* ambient bleed behind the widget: soft blue above the top edge, fainter warm at lower-left */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -z-10 h-24 w-64 -translate-x-1/2 rounded-full bg-accent-blue/20 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -left-8 -z-10 h-20 w-44 rounded-full bg-accent-peach/10 blur-3xl"
      />

      {/* soft glow bleeding around the CTA */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 bottom-1 h-14 bg-gradient-to-r from-accent-peach/20 via-accent-indigo/25 to-accent-blue/20 blur-2xl"
      />

      {/* Tabs */}
      <div className="relative flex items-center gap-1">
        {TABS.map((item, i) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(i)}
            className={cn(
              "interactive rounded-pill px-3.5 py-1.5 text-[13px] font-medium",
              i === tab
                ? "bg-white/[0.1] text-fg"
                : "text-fg-muted hover:bg-white/[0.05] hover:text-fg-secondary",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="relative mt-3">
        <div className="flex flex-col gap-2.5">
          <div className="interactive rounded-2xl bg-white/[0.04] p-4 hover:bg-white/[0.06]">
            <div className="text-[13px] font-medium leading-none text-fg">Send</div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <TypingField
                  defaultValue="1345.67"
                  placeholder="0"
                  aria-label="Amount to send"
                  inputMode="decimal"
                  className="text-[22px] font-semibold leading-tight tracking-tight text-fg sm:text-[28px]"
                />
                <div className="mt-1 text-xs leading-none text-fg-muted">$0.00</div>
              </div>
              <SelectToken icon={<AvaxToken />} />
            </div>
          </div>

          <div className="interactive rounded-2xl bg-white/[0.04] p-4 hover:bg-white/[0.06]">
            <div className="text-[13px] font-medium leading-none text-fg">Receive</div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <TypingField
                  placeholder="0"
                  aria-label="Amount to receive"
                  inputMode="decimal"
                  className="text-[22px] font-semibold leading-tight tracking-tight text-fg-muted sm:text-[28px]"
                />
                <div className="mt-1 text-xs leading-none text-fg-muted">$0.00</div>
              </div>
              <SelectToken icon={<EthToken />} />
            </div>
          </div>
        </div>

        {/* Divider button */}
        <button
          type="button"
          aria-label="Reverse swap direction"
          className="hover-flip absolute left-1/2 top-1/2 z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.06] bg-raised text-fg-secondary shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-colors duration-200 ease-snap hover:border-white/[0.16] hover:bg-border hover:text-fg"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      </div>

      {/* CTA — peach through pale periwinkle into deep indigo */}
      <GradientButton
        className="interactive relative mt-3 w-full rounded-2xl py-3.5 text-[15px] font-semibold leading-none hover:brightness-110"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #b07b5c 0%, #9b98a1 16%, #8ca4d0 30%, #6a8dfc 52%, #6675b8 68%, #4a4e7f 84%, #2d2d50 100%)",
        }}
      >
        Exchange
      </GradientButton>
    </div>
  );
}
