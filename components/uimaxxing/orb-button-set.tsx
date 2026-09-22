import { ArrowLineDownIcon, ArrowLineUpIcon } from "@phosphor-icons/react/ssr";

import { OrbButton } from "@/components/ui/orb-button";

/**
 * The action pill as a two-up selector: the live side keeps the orb, the other
 * falls back to a flat chip, so a pair reads as one chosen and one not.
 */
export function OrbButtonSet() {
  return (
    <div className="flex w-full items-center justify-center gap-1.5 py-2">
      <OrbButton label="Deposit" icon={ArrowLineDownIcon} />
      <OrbButton label="Withdraw" icon={ArrowLineUpIcon} muted />
    </div>
  );
}
