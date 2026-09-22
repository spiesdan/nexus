import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";

export function RequestButton() {
  return (
    <div className="relative flex w-full items-center justify-center">
      <button
        type="button"
        className="group relative flex items-center gap-2.5 rounded-full stroke-lit bg-gradient-to-r from-surface via-raised to-border py-1.5 pl-1.5 pr-5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)] interactive hover:brightness-110"
      >
        {/* soft violet halo behind the sphere */}
        <span aria-hidden className="animate-drift absolute inset-0">
          <span className="absolute -left-2 top-1/2 size-12 -translate-y-1/2 rounded-full bg-accent-violet/25 blur-xl" />
        </span>
        {/* glossy gradient sphere: peach/cream rim light on top, periwinkle body, deep navy base */}
        <span
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full shadow-[0_5px_14px_rgba(0,0,0,0.45)]"
          style={{
            background:
              "radial-gradient(circle at 30% 16%, rgba(255,240,220,0.95) 0%, rgba(255,240,220,0) 34%), radial-gradient(circle at 72% 8%, rgba(255,164,116,0.85) 0%, rgba(255,164,116,0) 38%), radial-gradient(circle at 10% 22%, rgba(233,150,110,0.55) 0%, rgba(233,150,110,0) 32%), radial-gradient(circle at 48% 36%, #8096f2 0%, #6d7fdd 44%, #49539f 74%, #2e3161 100%)",
          }}
        >
          <ArrowUpRightIcon className="size-3 text-[#0c0f1d]" weight="bold"/>
        </span>
        <span className="relative text-sm font-semibold text-fg">Request</span>
      </button>
    </div>
  );
}
