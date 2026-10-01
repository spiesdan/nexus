"use client";

import * as React from "react";
import { Buildings } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { abrirConversaDoProspect } from "@/lib/prospeccao/conversa";
import { ROTULO_STATUS_COMERCIAL, type Prospect } from "@/lib/schemas/prospeccao";

type Linha = Prospect & { ja_e_cliente: boolean };

/**
 * FASE 11 (§30) — "Quem podemos vender hoje?": a seção de PROSPECÇÃO do Radar,
 * a que o B12 apontava como vazia (grep `business_prospects` em `app/app/radar`
 * = 0 antes desta fase; D7 manda "Radar ganha seção de novos prospects com as
 * mesmas 3 ações").
 *
 * Dados: a rota de prospects de sempre, `status=novo,nao_analisado` (nunca
 * abordados) ordenada por score — o radar responde com os MELHORES primeiro.
 * As 3 ações do §30 são as mesmas da aba Empresas (§13/§17): Abrir cai no
 * drawer da Prospecção via `?prospect=<uuid>` (deep-link FASE 11), fila é o
 * PATCH de dono de sempre e a conversa usa a payload idêntica da FASE 9
 * (`lib/prospeccao/conversa.ts` — uma regra, não duas).
 */
export function NovosProspects({
  podeOperar,
  usuarioId,
}: {
  /** agent+ (ou platform admin) — mesmos critérios da aba Empresas. */
  podeOperar: boolean;
  usuarioId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [linhas, setLinhas] = React.useState<Linha[] | null>(null);
  const [erro, setErro] = React.useState(false);

  const buscar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: unknown }>(
        "/api/v1/prospecting/prospects?status=novo,nao_analisado&limite=30",
      );
      const dados = (corpo as { data?: unknown } | null)?.data;
      setLinhas(Array.isArray(dados) ? (dados as Linha[]) : []);
      setErro(false);
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
  }, [buscar]);

  // Mesma regra do card de Empresas (§13): fila é eu virar o dono.
  async function adicionarNaFila(id: string) {
    try {
      await apiClient.patch(`/api/v1/prospecting/prospects/${id}`, { owner_user_id: usuarioId || null });
      await buscar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function iniciarConversa(p: Linha) {
    try {
      const conversa = await abrirConversaDoProspect(p, usuarioId);
      if (!conversa) return;
      router.push(`/app/inbox?id=${conversa}`);
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <section id="radar-prospeccao" className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium text-text">{t("Novos prospects")}</h2>
        {linhas && (
          <Badge variant="secondary" className="h-5 px-2 text-xs font-normal tabular-nums">
            {linhas.length}
          </Badge>
        )}
        <p className="w-full text-sm text-muted-foreground">{t("Quem podemos vender hoje?")}</p>
      </div>

      {erro && linhas === null ? (
        <NexusErrorState onRetry={() => void buscar()} />
      ) : linhas === null ? (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : linhas.length === 0 ? (
        <NexusEmptyState icon={Buildings} headline={t("Nenhum prospect novo.")} />
      ) : (
        <ul className="space-y-2">
          {linhas.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.categoria, [p.cidade, p.estado].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                    {` · ${p.score}`}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {p.whatsapp_potencial && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                        WhatsApp
                      </span>
                    )}
                    {p.ja_e_cliente && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800">
                        {t("Cliente")}
                      </span>
                    )}
                    {p.status_comercial !== "novo" && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                        {t(ROTULO_STATUS_COMERCIAL[p.status_comercial])}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/app/prospeccao?prospect=${p.id}`)}
                  >
                    {t("Abrir")}
                  </Button>
                  {podeOperar && p.telefone && (
                    <Button size="sm" variant="outline" onClick={() => void iniciarConversa(p)}>
                      {t("Iniciar conversa")}
                    </Button>
                  )}
                  {podeOperar && p.owner_user_id !== usuarioId && (
                    <Button size="sm" variant="ghost" onClick={() => void adicionarNaFila(p.id)}>
                      {t("Adicionar à fila")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
