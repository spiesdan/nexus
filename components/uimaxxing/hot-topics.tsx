import { CaretRightIcon, FireIcon } from "@phosphor-icons/react/ssr";

const TOPICS = [
  { rank: 1, name: "Vantage", volume: "$3.6K today" },
  { rank: 2, name: "Rates", volume: "$18M today" },
  { rank: 3, name: "Meridian", volume: "$3M today" },
  { rank: 4, name: "Zenith", volume: "$3M today" },
  { rank: 5, name: "Housemates", volume: "$27.3K today" },
];

/**
 * Ranked list of the topics pulling the most volume today.
 */
export function HotTopics() {
  return (
    <div className="w-full max-w-xs rounded-2xl stroke-lit fill-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-fg">Hot topics</h3>
        <button
          type="button"
          aria-label="See all hot topics"
          className="hover-nudge interactive grid size-7 place-items-center rounded-full text-fg-secondary hover:bg-white/[0.06] hover:text-fg"
        >
          <CaretRightIcon className="size-4" />
        </button>
      </div>

      <ul className="mt-3">
        {TOPICS.map((topic) => (
          <li key={topic.rank}>
            <button
              type="button"
              className="row-hover group -mx-2 flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm"
            >
              <span className="w-4 tabular-nums text-fg-muted transition-colors duration-150 ease-snap group-hover:text-fg-secondary">
                {topic.rank}
              </span>
              <span className="font-medium text-fg">{topic.name}</span>
              <span className="ml-auto text-xs tabular-nums text-fg-muted">
                {topic.volume}
              </span>
              <FireIcon
                className="size-3.5 text-negative transition-transform duration-200 ease-snap group-hover:scale-125"
                aria-hidden
              />
              <CaretRightIcon
                className="size-3.5 text-fg-muted transition-transform duration-200 ease-snap group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
