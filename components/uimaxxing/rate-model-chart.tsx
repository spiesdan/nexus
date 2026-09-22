import { InfoIcon } from "@phosphor-icons/react/ssr";

const PARAMS: { label: string; value: string }[] = [
  { label: "Optimal utilisation", value: "92.00%" },
  { label: "Slope below optimal", value: "2.35%" },
  { label: "Slope above optimal", value: "14.00%" },
  { label: "Base borrow rate", value: "0.00%" },
];

const RING_CIRCUMFERENCE = 2 * Math.PI * 8;
const RING_DASH = RING_CIRCUMFERENCE * 0.9151;

export function RateModelChart() {
  return (
    <div className="stroke-lit w-full max-w-3xl rounded-card fill-panel p-6">
      <h3 className="text-base font-semibold leading-none text-fg">
        Interest Rate Model
      </h3>
      <p className="mt-2 text-xs text-fg-muted">
        Borrow rates adjust automatically based on market utilisation.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr] md:gap-8">
        {/* Left: utilisation + params */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-fg-muted">Utilisation Rate</span>
            <InfoIcon className="size-3 text-fg-muted" weight="bold"/>
          </div>

          <div className="mt-2 flex items-center gap-2.5">
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={2}
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="#6d7cff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={`${RING_DASH} ${RING_CIRCUMFERENCE}`}
                transform="rotate(-90 10 10)"
              />
            </svg>
            <span className="text-3xl font-semibold leading-none tabular-nums text-fg">
              91.51%
            </span>
          </div>

          <div className="my-4 border-t border-border" />

          <div className="flex flex-col gap-3">
            {PARAMS.map((param) => (
              <div
                key={param.label}
                className="row-hover -mx-2 flex items-center justify-between gap-3 rounded-sm px-2 py-0.5 text-xs"
              >
                <span className="flex items-center gap-1.5 text-fg-muted">
                  {param.label}
                  <InfoIcon className="size-3 shrink-0" weight="bold"/>
                </span>
                <span className="tabular-nums text-fg">{param.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: model curve */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border fill-well">
          <svg
            viewBox="0 0 600 320"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <path
              d="M 10 310 C 150 304, 320 284, 500 250 C 540 236, 570 138, 590 30"
              fill="none"
              stroke="#ffb37a"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <line
              x1="505"
              y1="12"
              x2="505"
              y2="310"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text x="515" y="70" fill="var(--color-fg-muted)" fontSize={11}>
              Optimal
            </text>
            <text x="420" y="150" fill="var(--color-fg)" fontSize={11} fontWeight={500}>
              Current 91.5%
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
