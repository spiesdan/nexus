import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

const sections: {
  label: string;
  pinned?: boolean;
  items: { text: string; active?: boolean }[];
}[] = [
  {
    label: "PINNED",
    pinned: true,
    items: [
      { text: "Quarterly planning notes for Northwind" },
      { text: "Vendor shortlist for the new CRM" },
    ],
  },
  {
    label: "TODAY",
    items: [
      { text: "Rewrite the onboarding email sequence", active: true },
      { text: "Debugging the nightly export job" },
      { text: "Ideas for the Q4 offsite agenda" },
      { text: "Summarize the customer research calls" },
    ],
  },
  {
    label: "AUG 21",
    items: [
      { text: "Draft the changelog for release 4.2" },
      { text: "Compare storage pricing across regions" },
    ],
  },
];

export function TaskListCard() {
  return (
    <div className="stroke-lit-bl w-full max-w-sm rounded-2xl bg-gradient-to-r from-surface to-raised-2 p-2 shadow-xl shadow-black/50">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
            {section.pinned ? (
              <span className="h-2.5 w-px rounded-full bg-fg-muted" aria-hidden />
            ) : null}
            {section.label}
          </div>
          {section.items.map((item) => (
            <button
              key={item.text}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] interactive",
                item.active
                  ? "border-white/10 bg-white/[0.06] text-fg"
                  : "border-transparent text-fg-secondary hover:bg-white/[0.04] hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "size-1 shrink-0 rounded-full",
                  item.active ? "bg-fg" : "bg-fg-muted/70",
                )}
                aria-hidden
              />
              <span className="truncate">{item.text}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="mt-1 flex items-center justify-between border-t border-border px-2 pb-1 pt-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-orb flex size-7 shrink-0 items-center justify-center rounded-[9px]"
          >
            <span className="text-[10px] font-semibold leading-none text-white">
              AR
            </span>
          </span>
          <span className="flex flex-col">
            <span className="text-xs font-medium leading-4 text-fg">
              A. Rivera
            </span>
            <span className="text-[11px] leading-4 text-fg-muted">
              Northwind Studio · Pro
            </span>
          </span>
        </div>
        <CaretDownIcon className="size-4 text-fg-muted" />
      </div>
    </div>
  );
}
