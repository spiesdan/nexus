"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import {
  linkWhatsAppRecuperacao,
  ROTULO_DA_FAIXA,
  type ClienteInativo,
  type FaixaDeInatividade,
} from "@/lib/comercial/inatividade";
import { comoMoeda } from "@/lib/format/moeda";

const COR_DA_FAIXA: Record<FaixaDeInatividade, string> = {
  atencao: "bg-yellow-100 text-yellow-800",
  morno: "bg-orange-100 text-orange-800",
  frio: "bg-red-100 text-red-800",
};

/**
 * Seção "Recuperação de clientes" do Radar — era a página /app/recuperacao,
 * movida para cá na fusão (S100). O título (h2) e o link de âncora
 * `#radar-recuperacao` vivem em `../_tabs`; aqui ficam subtítulo, filtro e
 * lista, com estados na mesma régua das listas vizinhas (Skeleton, erro com
 * retry, cards de vazio/sem base já existentes).
 */
export function RecuperacaoLista({ temBase }: { temBase: boolean }) {
  const t = useT();
  const [dias, setDias] = React.useState("60");
  const [lista, setLista] = React.useState<ClienteInativo[] | null>(null);
  const [falhou, setFalhou] = React.useState(false);

  const buscar = React.useCallback(async (d: string) => {
    setFalhou(false);
    try {
      const corpo = await apiClient.get<{ data: ClienteInativo[] }>(`/api/v1/comercial/inativos?dias=${d || "60"}`);
      setLista(Array.isArray(corpo?.data) ? corpo.data : []);
    } catch (e) {
      showApiError(e);
      setFalhou(true);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar("60");
  }, [buscar]);

  if (!temBase) {
    return <Card className="hover-raise p-8 text-center text-sm text-muted-foreground">{t("Ainda não há pedidos antigos para medir inatividade.")}</Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("Quem comprava e parou — por ordem de prioridade.")}</p>

      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="dias">{t("Sem compra há ao menos (dias)")}</Label>
          <Input
            id="dias"
            type="number"
            min={1}
            className="w-28"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <Button onClick={() => void buscar(dias)}>{t("Aplicar")}</Button>
      </div>

      {falhou && lista === null ? (
        <NexusErrorState onRetry={() => void buscar(dias)} />
      ) : lista === null ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : lista.length === 0 ? (
        <Card className="hover-raise p-8 text-center text-sm text-muted-foreground">{t("Ninguém inativo neste período. Boas vendas!")}</Card>
      ) : (
        <ul className="space-y-2">
          {lista.map((c) => {
            const zap = linkWhatsAppRecuperacao(c.telefone, c.nome, c.dias_sem_compra);
            return (
              <li key={c.contact_id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-lg font-bold tabular-nums">{c.score}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Última compra há")} {c.dias_sem_compra} {t("dias")} ·{" "}
                      {comoMoeda(c.total_historico_cents, "BRL")} {t("Total histórico")} ·{" "}
                      {c.qtd_pedidos} {t("pedidos")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_DA_FAIXA[c.faixa]}`}
                  >
                    {ROTULO_DA_FAIXA[c.faixa]}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {zap && (
                    <Button size="sm" asChild>
                      <a href={zap} target="_blank" rel="noopener noreferrer">
                        {t("Chamar no WhatsApp")}
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/app/contacts/${c.contact_id}`}>{t("Ficha")}</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/app/pedidos/novo">{t("Novo pedido")}</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
