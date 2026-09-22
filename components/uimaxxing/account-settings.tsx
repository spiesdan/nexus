import { XIcon } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { PillButton } from "@/components/ui/pill-button";

const DEVICES: { device: string; added: string }[] = [
  { device: "Desktop browser · Ludhiana", added: "Aug 6, 2026" },
  { device: "Desktop browser · Ludhiana", added: "Jul 22, 2026" },
];

export function AccountSettings() {
  return (
    <div className="stroke-lit relative w-full max-w-2xl rounded-card fill-panel p-6">
      <XIcon className="absolute right-5 top-5 size-4 text-fg-muted" />

      <h3 className="text-base font-semibold text-fg">Account</h3>

      <div className="mt-2">
        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <span className="text-sm text-fg">Log out of all devices</span>
          <PillButton variant="ghost" size="sm">
            Log out
          </PillButton>
        </div>

        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <div>
            <p className="text-sm text-fg">Close your personal account</p>
            <p className="mt-1 text-xs text-fg-muted">
              Choose what happens to your chats and projects.
            </p>
          </div>
          <PillButton variant="ghost" size="sm">
            Continue
          </PillButton>
        </div>

        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <span className="text-sm text-fg">Delete account</span>
          <span className="max-w-[240px] max-w-full text-right text-xs text-fg-muted">
            Please contact your administrator to deprovision your account.
          </span>
        </div>

        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <span className="text-sm text-fg">Your role</span>
          <Badge variant="neutral">User</Badge>
        </div>

        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <span className="text-sm text-fg">Your account&apos;s primary owner</span>
          <div className="text-right">
            <p className="text-sm text-fg">Northwind Labs GmbH</p>
            <p className="text-sm text-accent-blue">billing@northwind.co</p>
          </div>
        </div>

        <div className="row-hover -mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-b border-border px-2 py-4">
          <span className="text-sm text-fg">Organization ID</span>
          <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs tracking-tight text-fg-secondary tabular-nums">
            acdfa6c9-392a-4126-acb3-418e7c172485
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold text-fg">Trusted devices</h3>
        <p className="mt-1 text-xs text-fg-muted">
          Devices that can control your local machine through remote sessions.
        </p>

        <div className="mt-4">
          <div className="grid grid-cols-[1fr_auto] gap-6 border-b border-border pb-2 text-xs text-fg-muted">
            <span>Device</span>
            <span>Added</span>
          </div>
          {DEVICES.map((row, i) => (
            <div
              key={`${row.device}-${i}`}
              className="grid grid-cols-[1fr_auto] items-center gap-6 border-b border-border py-3 text-sm text-fg"
            >
              <span className="truncate">{row.device}</span>
              <span className="text-fg-secondary tabular-nums">{row.added}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
