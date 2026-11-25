"use client";

import * as React from "react";

import { AdminDataTable, type ColunaAdmin } from "@/components/admin/AdminDataTable";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { LinhaBilling, VisaoBilling } from "@/lib/billing/visao-plataforma-servidor";
import type { EstadoAssinatura } from "@/lib/billing/visao-plataforma";
import { ClockCounterClockwise, Receipt, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A TELA QUE RESPONDE "QUEM ESTÁ PAGANDO E QUEM NÃO ESTÁ".
 *
 * Ela lê `VisaoBilling` pronta do servidor — uma consulta ao banco, nenhuma ao
 * Stripe. As ações (portal/criar) são os únicos caminhos que falam com o Stripe,
 * e só no clique. Quando o Stripe não está configurado, a faixa no topo explica;
 * a lista continua visível porque o estado local é o que ela já tem.
 */

const TOM_ESTADO: Record<
  EstadoAssinatura,
  { variant: "success" | "warning" | "neutral" | "error" | "info"; barra: string }
> = {
  ativa: { variant: "success", barra: "bg-success-fg" },
  em_atraso: { variant: "warning", barra: "bg-warning-fg" },
  sem_assinatura: { variant: "neutral", barra: "bg-border" },
  cancelada: { variant: "neutral", barra: "bg-error-fg" },
  nao_verificado: { variant: "info", barra: "bg-info-fg" },
};

function CartaoDeContagem({
  rotulo,
  valor,
  destaque,
  tom,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  tom?: string;
}) {
  return (
    <div className="rounded-3xl border bg-surface-elevated px-4 py-3">
      <div className="flex items-center gap-2">
        {tom ? <span className={cn("size-2 rounded-full", tom)} aria-hidden /> : null}
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {rotulo}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          destaque ? "text-text" : "text-text-muted",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function BotaoDeAcao({
  linha,
  permitido,
  motivoBloqueio,
}: {
  linha: LinhaBilling;
  permitido: boolean;
  motivoBloqueio: string | null;
}) {
  const t = useT();
  const [abrindo, setAbrindo] = React.useState(false);
  if (!linha.acao) return <span className="text-muted-foreground">—</span>;

  const criar = linha.acao === "criar";

  async function abrir(): Promise<void> {
    if (!linha.acao) return;
    setAbrindo(true);
    try {
      const acao = linha.acao === "criar" ? "checkout" : "portal";
      const rota = `/api/v1/admin/billing/${linha.organizacao_id}/${acao}`;
      const resposta = await apiClient.post<{ data: { url: string } }>(rota, {});
      if (resposta?.data?.url) window.location.assign(resposta.data.url);
      else throw new Error("A resposta não trouxe a URL do Stripe.");
    } catch (erro) {
      if (erro instanceof ApiError) showApiError(erro);
      else toast.error(t("Não foi possível abrir a cobrança. Tente novamente."));
      setAbrindo(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={criar ? "default" : "outline"}
      onClick={() => void abrir()}
      disabled={!permitido || abrindo}
      title={permitido ? undefined : (motivoBloqueio ?? undefined)}
      className="min-h-9 whitespace-nowrap"
    >
      {abrindo ? t("Abrindo...") : criar ? t("Criar assinatura") : t("Portal")}
    </Button>
  );
}

function colunasAdmin(
  t: (texto: string) => string,
  permitido: boolean,
  motivoBloqueio: string | null,
): ColunaAdmin<LinhaBilling>[] {
  return [
    {
      id: "organizacao",
      cabecalho: t("Organização"),
      celula: (linha) => (
        <div className="flex min-w-[11rem] flex-col gap-0.5">
          <span className="text-sm font-medium text-text">{linha.organizacao}</span>
          {linha.slug ? (
            <span className="font-mono text-[11px] text-muted-foreground">{linha.slug}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "situacao",
      cabecalho: t("Situação"),
      celula: (linha) => (
        <div className="flex min-w-[9rem] flex-col gap-1">
          <Badge variant={TOM_ESTADO[linha.situacao].variant} className="w-fit">
            {t(linha.rotulo)}
          </Badge>
          {linha.motivo ? (
            <span className="max-w-[16rem] text-[11px] leading-snug text-muted-foreground">
              {linha.motivo}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "valor",
      cabecalho: t("Valor"),
      classeCelula: "tabular-nums text-sm whitespace-nowrap",
      celula: (linha) => linha.valor_texto ?? "—",
    },
    {
      id: "vencimento",
      cabecalho: t("Próximo vencimento"),
      classeCelula: "text-sm whitespace-nowrap",
      celula: (linha) => (
        <span className={linha.vencimento_vencido ? "font-medium text-warning-fg" : undefined}>
          {linha.vencimento_texto}
        </span>
      ),
    },
    {
      id: "cobranca",
      cabecalho: t("Última cobrança"),
      classeCelula: "text-sm whitespace-nowrap",
      celula: (linha) => (
        <span className={linha.falhas > 0 ? "font-medium text-warning-fg" : "text-text-muted"}>
          {linha.ultima_cobranca_texto}
        </span>
      ),
    },
    {
      id: "acao",
      cabecalho: t("Ação"),
      celula: (linha) => (
        <BotaoDeAcao linha={linha} permitido={permitido} motivoBloqueio={motivoBloqueio} />
      ),
    },
  ];
}

export function BillingPlataforma({
  visao,
  podeEscrever,
}: {
  visao: VisaoBilling;
  podeEscrever: boolean;
}) {
  const t = useT();
  const { contagens, total, somaDosQuatro, diferenca, fecha } = visao.resumo;
  const colunas = colunasAdmin(t, podeEscrever && visao.stripe.configurado, motivoBloqueio(visao, podeEscrever));

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title={t("Cobrança")}
        subtitle={t(
          "Quem está pagando, quem está em atraso e quem nunca assinou. Lido do banco local — sem consultar o Stripe organização por organização.",
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {visao.stripe.configurado && visao.stripe.modoTeste ? (
              <Badge variant="info">{t("Stripe em modo de teste")}</Badge>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <ClockCounterClockwise size={14} aria-hidden />
              {t(visao.sincronizado_texto)}
            </span>
          </div>
        }
      />

      {!visao.stripe.configurado ? (
        <div
          role="status"
          className="rounded-3xl border border-warning-fg bg-warning-bg p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <Warning size={18} className="mt-0.5 shrink-0 text-warning-fg" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text">
                {t("Stripe não configurado nesta instalação")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Nenhuma assinatura é consultada nem cobrada. A lista abaixo é o último estado gravado no banco; as ações ficam desativadas até uma chave ser configurada.",
                )}
              </p>
              {visao.stripe.detalhe ? (
                <p className="text-xs text-muted-foreground">{visao.stripe.detalhe}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {visao.avisos.length > 0 ? (
        <div role="alert" className="rounded-3xl border border-error-fg bg-error-bg p-4">
          <p className="text-sm font-semibold text-error-fg">{t("Leitura parcial do banco")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {visao.avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-label={t("Contagens de cobrança")} className="space-y-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CartaoDeContagem
            rotulo={t("Ativas")}
            valor={contagens.ativa}
            destaque
            tom={TOM_ESTADO.ativa.barra}
          />
          <CartaoDeContagem
            rotulo={t("Em atraso")}
            valor={contagens.em_atraso}
            destaque
            tom={TOM_ESTADO.em_atraso.barra}
          />
          <CartaoDeContagem
            rotulo={t("Sem assinatura")}
            valor={contagens.sem_assinatura}
            destaque
            tom={TOM_ESTADO.sem_assinatura.barra}
          />
          <CartaoDeContagem
            rotulo={t("Canceladas")}
            valor={contagens.cancelada}
            destaque
            tom={TOM_ESTADO.cancelada.barra}
          />
          <CartaoDeContagem
            rotulo={t("Não verificadas")}
            valor={contagens.nao_verificado}
            tom={TOM_ESTADO.nao_verificado.barra}
          />
        </div>

        {/* A SOMA É VISÍVEL. Se as quatro não fecharem com o total, a diferença
            aparece escrita — esconder isso é o que faria alguém ler "4 ativas"
            num universo de 6 organizações e achar que sabe de tudo. */}
        <p className="text-xs text-muted-foreground" data-soma-cobranca>
          {fecha
            ? t("{total} organizações · as quatro contagens somam {soma}.")
                .replace("{total}", String(total))
                .replace("{soma}", String(somaDosQuatro))
            : diferenca === contagens.nao_verificado
              ? t(
                  "{total} organizações · as quatro contagens somam {soma}; a diferença de {diferenca} está em “Não verificadas”.",
                )
                  .replace("{total}", String(total))
                  .replace("{soma}", String(somaDosQuatro))
                  .replace("{diferenca}", String(diferenca))
              : t(
                  "{total} organizações · as quatro contagens somam {soma} — divergência de {diferenca} que a leitura não explica. Investigue antes de decidir.",
                )
                  .replace("{total}", String(total))
                  .replace("{soma}", String(somaDosQuatro))
                  .replace("{diferenca}", String(diferenca))}
          {visao.faturas_parciais
            ? ` ${t("A leitura de faturas atingiu o teto — o histórico de falhas pode estar incompleto.")}`
            : null}
        </p>
      </section>

      <AdminDataTable
        colunas={colunas}
        linhas={visao.linhas}
        chave={(linha) => linha.organizacao_id}
        vazio={{
          icon: Receipt,
          headline: t("Nenhuma organização nesta instalação"),
          subcopy: t("Assim que houver uma organização, ela aparece aqui com o estado da cobrança."),
        }}
      />
    </div>
  );
}

function motivoBloqueio(visao: VisaoBilling, podeEscrever: boolean): string | null {
  if (!visao.stripe.configurado) return "Stripe não configurado nesta instalação.";
  if (!podeEscrever) return "Seu acesso de plataforma é somente leitura.";
  return null;
}
