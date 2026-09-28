"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { ROTULO_RECOMPRA } from "@/lib/comercial/radar-compras";

/** O tipo vem da ROTA, não é redigitado aqui. */
export type { QueueRow } from "@/app/api/v1/ai/followups/queue/route";
import type { QueueRow } from "@/app/api/v1/ai/followups/queue/route";

interface ContextoCliente {
  resumo: string;
  historico: {
    situacao: keyof typeof ROTULO_RECOMPRA;
    dias_sem_compra: number;
    atraso_dias: number;
    ultima_compra: string;
    ticket_medio_cents: number;
    qtd_pedidos: number;
  } | null;
}

/**
 * Blocos §31 que faltavam no painel do inbox: recompra + Brain e
 * follow-ups ativos — cada um com os TRÊS estados e falha isolada
 * (doutrina do SecoesComerciais: erro nunca vira "não tem").
 */
export function BrainNoPainel({ contactId }: { contactId: string }) {
  const t = useT();
  const [ctx, setCtx] = useState<ContextoCliente | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    // Reset síncrono de propósito: sem ele, trocar de conversa exibe o
    // Brain do contato ANTERIOR até a nova leitura chegar — o mesmo flash
    // que o SecoesComerciais evita com o terceiro estado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCtx(null);
    setErro(false);
    apiClient
      .get<{ data: ContextoCliente }>(
        `/api/v1/copilot/context?pagina=cliente&contact_id=${contactId}`,
      )
      .then((r) => {
        if (vivo) setCtx(r.data);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [contactId, tentativa]);

  return (
    <>
      <Separator />
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("Recompra e IA")}
        </h3>
        {erro ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-error-fg">{t("Não consegui ler estes dados.")}</p>
            <Button size="sm" variant="outline" onClick={() => setTentativa((n) => n + 1)}>
              {t("Tentar de novo")}
            </Button>
          </div>
        ) : ctx === null ? (
          <Skeleton className="mt-2 h-14 w-full" />
        ) : ctx.historico ? (
          <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2 text-xs">
            <div>
              <Badge variant={ctx.historico.atraso_dias > 0 ? "warning" : "success"}>
                {ROTULO_RECOMPRA[ctx.historico.situacao]}
              </Badge>
            </div>
            <p className="leading-relaxed text-muted-foreground">{ctx.resumo}</p>
            <Link
              href={`/app/contacts/${contactId}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("Ver no 360")}
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("Sem compras ainda.")}</p>
        )}
      </section>
    </>
  );
}

export function FollowupsNoPainel({ contactId }: { contactId: string }) {
  const t = useT();
  const [linhas, setLinhas] = useState<QueueRow[] | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    // Reset síncrono de propósito (ver BrainNoPainel acima).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null);
    setErro(false);
    apiClient
      .get<{ data: QueueRow[] }>(
        `/api/v1/ai/followups/queue?contact_id=${contactId}&status=active&limit=3`,
      )
      .then((r) => {
        if (vivo) setLinhas(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [contactId, tentativa]);

  return (
    <>
      <Separator />
      <section>
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("Follow-ups ativos")}
        </h3>
        {erro ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-error-fg">{t("Não consegui ler estes dados.")}</p>
            <Button size="sm" variant="outline" onClick={() => setTentativa((n) => n + 1)}>
              {t("Tentar de novo")}
            </Button>
          </div>
        ) : linhas === null ? (
          <Skeleton className="mt-2 h-14 w-full" />
        ) : linhas.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {linhas.map((l) => (
              <li key={`${l.source}-${l.id}`} className="rounded-lg border border-border p-2 text-xs">
                <div className="truncate font-medium">{l.flow_name ?? t("Fluxo")}</div>
                <div className="truncate text-muted-foreground">{l.node_or_reason}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("Nenhum follow-up ativo.")}</p>
        )}
      </section>
    </>
  );
}
