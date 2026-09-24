"use client";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { Brain } from "@/lib/ui/icons";
import { comoMoeda } from "@/lib/format/moeda";
import { useSalesBrain, type SalesBrainItem } from "@/hooks/nexus/useSalesBrain";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";

const VARIANTE: Record<SalesBrainItem["prioridade"], "error" | "warning" | "info"> = {
  alta: "error",
  media: "warning",
  baixa: "info",
};

const ROTULO_ACAO: Record<SalesBrainItem["proxima_acao"], string> = {
  ver_cliente: "Ver cliente",
  criar_pedido: "Criar pedido",
  whatsapp: "WhatsApp",
  aprovar_ia: "Aprovar IA",
};

function destinoDe(item: SalesBrainItem): string {
  switch (item.proxima_acao) {
    case "criar_pedido":
      return "/app/pedidos/novo";
    case "whatsapp":
    case "aprovar_ia":
      return "/app/inbox";
    case "ver_cliente":
    default:
      return `/app/contacts/${item.contact_id}`;
  }
}

/**
 * NEXUS 2.0 §27 — o centro operacional do Sales Brain (não o grafo).
 *
 * Cada cartão responde QUEM (cliente) / POR QUÊ (motivo com ciclo real) /
 * O QUÊ (recomendação) / PRÓXIMO PASSO (ação). Tudo deriva de
 * `commercial_orders` via `/api/v1/sales-brain` — nenhum número inventado.
 */
function CartaoRecomendacao({ item }: { item: SalesBrainItem }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/app/contacts/${item.contact_id}`}
          className="truncate text-sm font-medium text-text hover:text-accent"
        >
          {t("Cliente")} {item.contact_id.slice(0, 8)}
        </Link>
        <Badge variant={VARIANTE[item.prioridade]}>
          {item.prioridade === "alta"
            ? t("Alta")
            : item.prioridade === "media"
              ? t("Média")
              : t("Baixa")}
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{item.motivo}</p>
      <p className="text-sm text-text">{item.recomendacao}</p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          {comoMoeda(item.ticket_medio_cents, "BRL")} {t("ticket médio")}
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link href={destinoDe(item)}>{t(ROTULO_ACAO[item.proxima_acao])}</Link>
        </Button>
      </div>
    </li>
  );
}

export function BrainRecomendacoes() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useSalesBrain(6);

  if (isLoading) {
    return (
      <section aria-label={t("Recomendações")} className="space-y-3">
        <h2 className="text-base font-semibold text-text">{t("Recomendações")}</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={t("Recomendações")} className="space-y-3">
        <h2 className="text-base font-semibold text-text">{t("Recomendações")}</h2>
        <NexusErrorState
          title={t("Recomendações indisponíveis")}
          description={t("Não foi possível ler os pedidos. Tente novamente.")}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  const itens = data ?? [];
  if (itens.length === 0) {
    return (
      <section aria-label={t("Recomendações")} className="space-y-3">
        <h2 className="text-base font-semibold text-text">{t("Recomendações")}</h2>
        <NexusEmptyState
          icon={Brain}
          headline={t("Nada pedindo ação agora")}
          subcopy={t("Quando um cliente sair do ciclo, a recomendação aparece aqui sozinha.")}
        />
      </section>
    );
  }

  return (
    <section aria-label={t("Recomendações")} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">
          {t("Recomendações")} ({itens.length})
        </h2>
        <p className="text-xs text-muted-foreground">{t("Derivadas dos pedidos reais.")}</p>
      </div>
      <ul className="grid gap-2 lg:grid-cols-2">
        {itens.map((item) => (
          <CartaoRecomendacao key={item.contact_id} item={item} />
        ))}
      </ul>
    </section>
  );
}
