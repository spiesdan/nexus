"use client";
import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentInbox, type AgentInboxItem } from "@/hooks/ai/useAgentInbox";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { kindLabel, SEVERITY_LABEL, type AgentInboxSeverity } from "@/lib/ai/agent-inbox-copy";
import { Bell } from "@/lib/ui/icons";

/**
 * Central de avisos no shell (§17): o sino ganhou painel — contador continua
 * abrindo o mesmo `useAgentInbox("open")` de sempre, e o painel é uma prévia
 * dos itens que a página `/app/ai/inbox` lista por inteiro (SoR: severidade,
 * rótulo de `kind` e tempo vêm dos mesmos lugares de lá — `AgentInboxList`).
 * Sem ação dentro do painel: resolver é assunto da central, com permissão de
 * lá. Link fecha o painel; sem isso o Radix mantém o overlay montado por cima
 * da navegação.
 */

const SEVERITY_VARIANT: Record<AgentInboxSeverity, "info" | "warning" | "error"> = {
  info: "info",
  warn: "warning",
  critical: "error",
};

const MAX_NO_PAINEL = 8;

export function NotificationCenter() {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const { data, isLoading } = useAgentInbox("open");
  const count = data?.open_count ?? 0;
  const itens = (data?.items ?? []).slice(0, MAX_NO_PAINEL);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            count > 0
              ? `${t("Central de avisos")} — ${count} ${t("em aberto")}`
              : t("Central de avisos")
          }
          aria-expanded={aberto}
          data-testid="alerts-bell"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
        >
          <Bell size={18} aria-hidden />
          {count > 0 ? (
            <span
              data-testid="alerts-bell-count"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notification-center">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">{t("Central de avisos")}</p>
          {count > 0 ? (
            <span className="text-xs text-muted-foreground">
              {count} {t("em aberto")}
            </span>
          ) : null}
        </header>
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <Bell size={24} className="text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{t("Nenhum aviso em aberto")}</p>
            <p className="text-xs text-muted-foreground">
              {t("Quando o assistente precisar de você, o aviso aparece aqui.")}
            </p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {itens.map((item) => (
              <PainelRow key={item.id} item={item} aoAbrir={() => setAberto(false)} />
            ))}
          </ul>
        )}
        <footer className="border-t p-2">
          <Link
            href="/app/ai/inbox"
            onClick={() => setAberto(false)}
            className="block rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t("Abrir a central de avisos")}
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function PainelRow({ item, aoAbrir }: { item: AgentInboxItem; aoAbrir: () => void }) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const quando = formatDistanceToNowStrict(new Date(item.created_at), {
    addSuffix: true,
    locale: localeDaData,
  });
  return (
    <li>
      <Link
        href="/app/ai/inbox"
        onClick={aoAbrir}
        className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-muted"
        data-testid="notification-center-item"
      >
        <Badge variant={SEVERITY_VARIANT[item.severity]} className="mt-0.5 shrink-0">
          {t(SEVERITY_LABEL[item.severity])}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {kindLabel(item.kind, t)} · {quando}
          </p>
        </div>
      </Link>
    </li>
  );
}
