import { DotsSixVerticalIcon, LinkIcon, PlusIcon } from "@phosphor-icons/react/ssr";

import { TypingField } from "@/components/ui/typing-field";
import { cn } from "@/lib/utils";

function ControlChip({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "interactive flex h-7 items-center justify-center rounded-[9px] border border-white/[0.07] bg-white/[0.05] text-fg-secondary hover:border-white/[0.16] hover:bg-white/[0.09] hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FloatingAskBar() {
  return (
    <div className="relative w-full max-w-[420px]">
      {/* Tight halo hugging the bar: warm salmon over the top (same family
          as the neon prompt bar), violet-periwinkle wash beneath, faint
          blue at the lower right */}
      <div aria-hidden className="animate-drift pointer-events-none absolute inset-0">
        <div className="absolute -top-2 left-0 h-8 w-[62%] rounded-full bg-[#ff8f76] opacity-[0.1] blur-lg" />
        <div className="absolute -top-1 left-[24%] h-5 w-[34%] rounded-full bg-[#ffb9a0] opacity-[0.07] blur-md" />
        <div className="absolute -bottom-2 left-[8%] h-8 w-[65%] rounded-full bg-accent-indigo/45 blur-lg" />
        <div className="absolute -bottom-1.5 right-[6%] h-6 w-[30%] rounded-full bg-accent-blue/25 blur-md" />

        {/* Tight neon rim hugging the border: warm at the top fading to
            indigo/blue at the base, masked by the bar itself */}
        <div className="absolute -inset-[3px] rounded-[23px] bg-[linear-gradient(170deg,rgba(255,143,118,0.16),rgba(255,143,118,0.05)_30%,transparent_52%,rgba(109,124,255,0.3)_80%,rgba(91,141,238,0.38)_100%)] blur-[8px]" />
      </div>

      {/* Aurora hairline ring on the bar itself */}
      <div className="stroke-aurora relative rounded-[20px] bg-sunk-2/85 px-3.5 pb-3 pt-3.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <TypingField
          defaultValue="Find me some restraunts nearby"
          placeholder="Ask anything…"
          aria-label="Ask anything"
          className="px-1 text-[13px] leading-5 text-fg-secondary"
        />

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ControlChip className="hover-tilt w-7" label="Attach a link">
              <LinkIcon className="size-3" />
            </ControlChip>
            <ControlChip className="hover-spin w-7" label="Add attachment">
              <PlusIcon className="size-3.5 text-fg" />
            </ControlChip>
          </div>

          <div className="flex items-center gap-2">
            <ControlChip className="px-2 text-[11px] tracking-wide" label="Command palette">
              &#8984;K
            </ControlChip>
            <ControlChip className="hover-tilt w-7" label="Drag to move">
              <DotsSixVerticalIcon className="size-3" />
            </ControlChip>
          </div>
        </div>
      </div>
    </div>
  );
}
