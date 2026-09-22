import { CookieIcon } from "@phosphor-icons/react/ssr";

import { PillButton } from "@/components/ui/pill-button";

/**
 * Cookie consent panel — policy copy with a decline / accept pair.
 */
export function ConsentCard() {
  return (
    <div className="hover-raise w-full max-w-md rounded-2xl stroke-lit fill-panel p-5">
      <div className="flex items-center gap-2">
        <CookieIcon className="size-4 shrink-0 text-fg-secondary" />
        <h3 className="text-base font-semibold text-fg">Cookie Policy</h3>
      </div>

      <p className="mt-2 text-[13px] leading-[1.6] text-fg-muted">
        We and our partners use cookies, pixels, SDKs, APIs, and server-to-server
        integrations. Northwind does not use these technologies to sell third
        party ads on our services. Northwind uses them to measure our ad
        performance on third party partner websites and to improve our services.
        If you continue using Northwind, without adjusting your settings, you
        are consenting to these technologies.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <PillButton variant="ghost" size="md">
          Decline optional
        </PillButton>
        <PillButton variant="solid" size="md">
          Got it
        </PillButton>
      </div>
    </div>
  );
}
