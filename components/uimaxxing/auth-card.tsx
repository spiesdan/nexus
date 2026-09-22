import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { GradientIconButton } from "@/components/ui/gradient-button";

/** Generic identity-provider marks — no third-party logos. */
function OrbitMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="#5b8dee"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" fill="#6d7cff" />
    </svg>
  );
}

function ZenithMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4 shrink-0 text-fg"
      aria-hidden
    >
      <path d="M13.6 2 4 13.4h5.6L8.4 22 20 10.2h-6.3L13.6 2Z" />
    </svg>
  );
}

function ProviderRow({
  icon,
  provider,
}: {
  icon: React.ReactNode;
  provider: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-2xl border border-white/[0.03] bg-white/[0.02] py-2 pl-4 pr-2 interactive hover:bg-white/[0.05]"
    >
      <span className="flex items-center gap-3 text-[13px]">
        {icon}
        <span className="text-fg-secondary">
          Continue with <span className="font-medium text-fg">{provider}</span>
        </span>
      </span>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
        <ArrowRightIcon className="size-4 text-fg-muted" />
      </span>
    </button>
  );
}

export function AuthCard() {
  return (
    <div className="stroke-lit w-full max-w-sm rounded-3xl bg-surface p-7 shadow-2xl shadow-black/50">
      <h2 className="text-center text-[26px] font-medium leading-tight tracking-tight text-fg">
        Hello <span className="text-fg-muted">again</span>
      </h2>
      <p className="mt-2 text-center text-[13px] text-fg-muted">
        Log in to continue your session
      </p>

      <div className="mt-7 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] py-2 pl-4 pr-2">
        <div className="min-w-0">
          <div className="text-[10px] text-fg-muted">Email</div>
          <div className="flex items-center text-[13px] text-fg">
            <span className="truncate">zukkshuuk@zendo.io</span>
            <span className="ml-px h-3.5 w-px shrink-0 animate-blink bg-fg" />
          </div>
        </div>
        <GradientIconButton
          aria-label="Continue with email"
          className="size-9 shrink-0 text-black"
        >
          <ArrowRightIcon className="size-4" weight="bold"/>
        </GradientIconButton>
      </div>

      <div className="my-5 flex items-center gap-4">
        <span className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-[10px] tracking-[0.3em] text-fg-muted">OR</span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>

      <div className="flex flex-col gap-3">
        <ProviderRow icon={<OrbitMark />} provider="Orbit" />
        <ProviderRow icon={<ZenithMark />} provider="Zenith" />
      </div>

      <div className="mt-6 flex items-center justify-between px-1 text-xs">
        <span className="text-fg-muted">New around here?</span>
        <button
          type="button"
          className="font-semibold text-fg transition-opacity hover:opacity-80"
        >
          Create account
        </button>
      </div>
    </div>
  );
}
