"use client";

import { useState } from "react";
import {
  ArrowLineDownIcon,
  BookOpenIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckIcon,
  CreditCardIcon,
  GearIcon,
  NotepadIcon,
  QuestionIcon,
  SignOutIcon,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const N_GRADIENT =
  "radial-gradient(120% 120% at 15% 5%, #ffc9a0 0%, rgba(255,201,160,0) 34%), linear-gradient(140deg, #9fb2e8 0%, #5a64c2 48%, #23274f 100%)";
const R_GRADIENT =
  "linear-gradient(140deg, var(--color-fg-secondary) 0%, var(--color-fg-secondary) 45%, var(--color-fg-muted) 100%)";

function OrgMark({
  letter,
  gradient,
  size = 24,
  letterClassName,
  className,
}: {
  letter: string;
  gradient: string;
  size?: number;
  letterClassName?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold",
        className,
      )}
      style={{ width: size, height: size, background: gradient }}
    >
      <span className={cn("text-[12px] leading-none", letterClassName)}>
        {letter}
      </span>
    </span>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left interactive hover:bg-white/[0.04]"
    >
      {icon}
      <span className="flex-1 text-[13px] text-fg-secondary">{label}</span>
      {trailing}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-white/[0.05]" />;
}

export function AccountSwitcher() {
  const [active, setActive] = useState<"team" | "personal">("team");

  const accounts = [
    {
      id: "team" as const,
      name: "Northwind Studio",
      badge: (
        <Badge
          variant="outline"
          className="border-[#6d7cff]/50 bg-accent-indigo/10 px-1.5 text-[10px] tracking-[0.12em] text-code-keyword"
        >
          TEAM
        </Badge>
      ),
      mark: (
        <OrgMark letter="N" gradient={N_GRADIENT} letterClassName="text-white" />
      ),
    },
    {
      id: "personal" as const,
      name: "A. Rivera",
      badge: (
        <Badge
          variant="outline"
          className="px-1.5 text-[10px] tracking-[0.12em] text-fg-muted"
        >
          FREE
        </Badge>
      ),
      mark: (
        <OrgMark letter="R" gradient={R_GRADIENT} letterClassName="text-bg" />
      ),
    },
  ];

  return (
    <div className="flex w-full justify-center">
      <div className="flex w-full max-w-[264px] flex-col items-start gap-6">
        <div className="stroke-lit w-full rounded-2xl bg-surface p-1.5 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[11px] text-fg-muted">
            a.rivera@northwind.co
            <span className="size-[3px] rounded-full bg-fg/80" />
          </div>

          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setActive(account.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left interactive",
                active === account.id
                  ? "bg-white/[0.07]"
                  : "hover:bg-white/[0.04]",
              )}
            >
              {account.mark}
              <span className="text-[13px] font-medium text-fg">
                {account.name}
              </span>
              {account.badge}
              {active === account.id ? (
                <CheckIcon
                  className="ml-auto size-4 shrink-0 text-accent-indigo"
      weight="bold"/>
              ) : null}
            </button>
          ))}

          <Divider />

          <MenuRow
            icon={<GearIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="Settings"
            trailing={
              <span className="rounded-md bg-white/[0.07] px-1.5 py-1 text-[11px] leading-none text-fg-muted">
                &#8984;,
              </span>
            }
          />
          <MenuRow
            icon={<QuestionIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="Get help"
          />

          <Divider />

          <MenuRow
            icon={<CreditCardIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="View all plans"
          />
          <MenuRow
            icon={
              <ArrowLineDownIcon className="size-[15px] shrink-0 text-fg-muted" />
            }
            label="Get apps"
          />
          <MenuRow
            icon={<NotepadIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="View changelog"
          />
          <MenuRow
            icon={<BookOpenIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="Learn more"
            trailing={<CaretRightIcon className="size-3.5 shrink-0 text-fg-muted" />}
          />

          <Divider />

          <MenuRow
            icon={<SignOutIcon className="size-[15px] shrink-0 text-fg-muted" />}
            label="Log out"
          />
        </div>

        <button
          type="button"
          className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-1.5 shadow-lg shadow-black/40 interactive hover:bg-white/[0.03]"
        >
          <OrgMark
            letter="N"
            gradient={N_GRADIENT}
            size={20}
            className="rounded-md"
            letterClassName="text-[10px] text-white"
          />
          <span className="text-[12px] font-medium text-fg">
            Northwind Studio
          </span>
          <CaretUpIcon className="size-3.5 text-fg-muted" />
        </button>
      </div>
    </div>
  );
}
