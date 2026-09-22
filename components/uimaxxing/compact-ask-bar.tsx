import { PlusIcon, WaveformIcon } from "@phosphor-icons/react/ssr";

import { GradientIconButton } from "@/components/ui/gradient-button";
import { TypingField } from "@/components/ui/typing-field";

export function CompactAskBar() {
  return (
    <div className="relative flex h-12 w-full max-w-sm items-center rounded-full stroke-lit bg-surface shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9)]">
      {/* Subtle top-right sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.06]"
      />

      <button
        type="button"
        aria-label="Add attachment"
        className="hover-spin interactive ml-2.5 flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-white/[0.06] hover:text-fg"
      >
        <PlusIcon className="size-5" />
      </button>

      <TypingField
        placeholder="Ask anything..."
        aria-label="Ask anything"
        className="ml-3 min-w-0 flex-1 text-[15px] text-fg"
      />

      <GradientIconButton
        aria-label="Voice input"
        className="interactive mr-1.5 size-9 shrink-0 hover:scale-105"
      >
        <WaveformIcon className="size-4 text-on-brand" weight="bold"/>
      </GradientIconButton>
    </div>
  );
}
