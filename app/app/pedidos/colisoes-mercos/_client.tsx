"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { comoMoeda } from "@/lib/format/moeda";
import {
  ENDPOINT_COLISOES_MERCOS,
  nomeClienteLocal,
  nomeClienteMercos,
  rotuloData,
  rotuloEstado,
  coberturaDaConferencia,
  estadoDaConferencia,
  type ColisaoMercos,
  type ReconciliacaoMercos,
  type RespostaColisoesMercos,
} from "@/lib/mercos/colisoes";
import { ArrowsClockwise, CheckCircle, Package, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Alvos de 44 px sem repetir a classe em cada botão. */
const ALVOS = "[&_a]:min-h-11 [&_button]:min-h-11 [&_a]:min-w-11 [&_button]:min-w-11";

export function ColisoesMercosClient({
  textos,
}: {
  textos: { voltar: string; importar: string; abrir: string; tentar: string };
}) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const confirmar = useConfirmar();
  const [itens, setItens] = React.useState<ColisaoMercos[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<"indisponivel" | "carga" | null>(null);
  const [importando, setImportando] = React.useState<number | null>(null);
  const [reconciliacao, setReconciliacao] = React.useState<ReconciliacaoMercos | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await apiClient.get<RespostaColisoesMercos>(ENDPOINT_COLISOES_MERCOS);
      // Tolerante a contrato ainda não publicado na main e a lista vazia:
      // resposta sem `itens` é "nada ficou de fora", não é exceção.
      setItens(Array.isArray(resposta?.data?.itens) ? resposta.data.itens : []);
      setReconciliacao(resposta?.data?.reconciliacao ?? null);
    } catch (e) {
      setItens([]);
      setReconciliacao(null);
      setErro(e instanceof ApiError && e.status === 404 ? "indisponivel" : "carga");
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const estadoConferencia = estadoDaConferencia(reconciliacao);
  const ausentes = reconciliacao?.ausentes ?? 0;
  const cobertura = reconciliacao ? coberturaDaConferencia(reconciliacao, tagDoIdioma) : "";
  const numero = (n: number | null | undefined) => (n ?? 0).toLocaleString(tagDoIdioma);
  const pendentes = itens.filter((i) => !i.pedido_importado_id).length;
  const resolvidos = itens.length - pendentes;

  async function importarColisao(colisao: ColisaoMercos) {
    const numeroLocal = colisao.numero_local;
    const confirmado = await confirmar({
      title: t(`Importar pedido ${colisao.numero_mercos} do Mercos?`),
      // Consequências nomeadas, sem inventar número: se o backend informar o
      // número local, ele aparece; senão fica dito que é o próximo da série.
      description: t(
        numeroLocal != null
          ? `O pedido entra com o número ${numeroLocal} da série local e o número ${colisao.numero_mercos} do Mercos fica guardado como referência.`
          : `O pedido entra com o próximo número da série local e o número ${colisao.numero_mercos} do Mercos fica guardado como referência.`,
      ),
      confirmLabel: t(textos.importar),
      cancelLabel: t("Cancelar"),
    });
    if (!confirmado) return;

    setImportando(colisao.numero_mercos);
    try {
      await apiClient.post(ENDPOINT_COLISOES_MERCOS, {
        numero_mercos: colisao.numero_mercos,
      });
      toast.success(
        t(`Pedido ${colisao.numero_mercos} importado para a numeração local.`),
      );
      await carregar();
    } catch (e) {
      if (e instanceof ApiError) showApiError(e);
      else toast.error(t("Não foi possível importar. Tente novamente."));
    } finally {
      setImportando(null);
    }
  }

  const aviso = erro ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-error/40 bg-error-bg px-4 py-3 text-sm text-error-fg"
    >
      <Warning size={18} aria-hidden className="shrink-0" />
      <p className="min-w-0 flex-1">
        {erro === "indisponivel"
          ? t("A conferência dos pedidos do Mercos ainda não está disponível nesta instalação.")
          : t("Não foi possível carregar os pedidos que ficaram de fora.")}
      </p>
      <Button size="sm" variant="outline" onClick={() => void carregar()}>
        {textos.tentar}
      </Button>
    </div>
  ) : null;

  return (
    <div className={ALVOS + " min-h-full space-y-5 p-4 sm:p-6"}>
      <NexusPageHeader
        title={t("Pedidos do Mercos que ficaram de fora")}
        subtitle={t("Um número do Mercos já ocupado aqui impede a entrada do pedido.")}
        actions={
          <Button asChild variant="outline" className="bg-surface">
            <Link href="/app/pedidos">
              <Package size={16} aria-hidden />
              {textos.voltar}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <Card className="px-4 py-3">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Ficaram de fora")}
          </p>
          <p className="mt-0.5 text-2xl font-semibold text-text tabular-nums">
            {carregando ? "—" : pendentes}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Já resolvidos")}
          </p>
          <p className="mt-0.5 text-2xl font-semibold text-text tabular-nums">
            {carregando ? "—" : resolvidos}
          </p>
        </Card>
      </div>

      {/* A RESPOSTA para "tenho certeza de que não ficou pedido de fora?".
          Zero ausente com cobertura incompleta NÃO é prova — por isso o
          estado incompleto nunca diz "nenhum ficou de fora". */}
      <div
        role={estadoConferencia === "incompleta" ? "alert" : "status"}
        data-testid="estado-reconciliacao"
        className={cn(
          "rounded-xl border px-3.5 py-2.5",
          estadoConferencia === "completa" && "border-success/40 bg-success-bg text-success-fg",
          estadoConferencia === "ausentes" && "border-warning/40 bg-warning-bg text-warning-fg",
          estadoConferencia === "incompleta" && "border-warning/40 bg-warning-bg text-warning-fg",
          estadoConferencia === "sem" && "border-border bg-surface text-text",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="min-w-0 text-sm font-semibold">
            {estadoConferencia === "completa"
              ? t("Nenhum pedido do Mercos ficou de fora.")
              : estadoConferencia === "ausentes"
                ? t(`${numero(ausentes)} pedidos do Mercos ainda não entraram`)
                : estadoConferencia === "incompleta"
                  ? t(
                      `Verificação incompleta: olhamos ${numero(reconciliacao?.censo_lido)} de ${numero(reconciliacao?.censo_esperado)} pedidos.`,
                    )
                  : t("Ainda não verificamos os pedidos do Mercos contra o nosso cadastro")}
          </p>
          {estadoConferencia === "completa" && reconciliacao?.quando ? (
            <span className="text-xs tabular-nums">
              {t("verificado em")} {rotuloData(reconciliacao.quando, tagDoIdioma)} · {cobertura}
            </span>
          ) : estadoConferencia === "ausentes" || estadoConferencia === "incompleta" ? (
            <span className="text-xs tabular-nums">{cobertura}</span>
          ) : null}
        </div>
        {estadoConferencia === "incompleta" ? (
          <p className="mt-1 text-xs">
            {t("A próxima execução termina a verificação. Zero ausente agora não é prova.")}
          </p>
        ) : null}
        {estadoConferencia === "sem" ? (
          <p className="mt-1 text-xs">
            {t("A verificação roda junto com a importação do Mercos.")}
          </p>
        ) : null}
      </div>

      <p
        role="status"
        className="rounded-xl border border-info/40 bg-info-bg px-3.5 py-2.5 text-sm text-info-fg"
      >
        {t(
          "Este pedido do Mercos não entrou porque o número dele já estava usado por outro pedido aqui. Cada linha mostra os dois lados: quem vem do Mercos e quem ocupa o número no CRM.",
        )}
      </p>

      {aviso}

      {carregando ? (
        <Card className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("Carregando pedidos do Mercos…")}
        </Card>
      ) : !erro && itens.length === 0 ? (
        <Card className="px-4 py-10 text-center">
          {estadoConferencia === "completa" ? (
            <CheckCircle size={28} aria-hidden className="mx-auto text-success-fg" />
          ) : (
            <Warning size={28} aria-hidden className="mx-auto text-warning-fg" />
          )}
          <p className="mt-3 text-base font-semibold text-text">
            {estadoConferencia === "completa"
              ? t("Nenhum pedido do Mercos ficou de fora.")
              : t("Ainda não há linhas de colisão para mostrar.")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {estadoConferencia === "completa"
              ? t("Boa notícia: todos os pedidos do Mercos entraram.")
              : t("O resumo acima diz o que a verificação conseguiu apurar.")}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/app/pedidos">{textos.voltar}</Link>
          </Button>
        </Card>
      ) : !erro ? (
        <section aria-label={t("Pedidos que não entraram")} className="space-y-2.5">
          <div className="hidden gap-3 px-3.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase sm:grid sm:grid-cols-[90px_1fr_1fr_110px_150px_130px]">
            <span>{t("Nº Mercos")}</span>
            <span>{t("Cliente no Mercos")}</span>
            <span>{t("Quem ocupa o número aqui")}</span>
            <span>{t("Valor")}</span>
            <span>{t("Detectado em")}</span>
            <span>{t("Estado")}</span>
          </div>
          <ul className="space-y-2.5">
            {itens.map((colisao) => {
              const resolvido = Boolean(colisao.pedido_importado_id);
              return (
                <li
                  key={`${colisao.numero_mercos}-${colisao.visto_em}`}
                  className="rounded-2xl border border-border bg-surface px-3.5 py-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[90px_1fr_1fr_110px_150px_130px] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Nº Mercos")}
                      </p>
                      <p className="font-mono text-sm font-semibold text-text tabular-nums">
                        {colisao.numero_mercos}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Cliente no Mercos")}
                      </p>
                      <p className="truncate text-sm text-text" title={nomeClienteMercos(colisao)}>
                        {nomeClienteMercos(colisao)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Quem ocupa o número aqui")}
                      </p>
                      <p className="truncate text-sm text-text" title={nomeClienteLocal(colisao)}>
                        {nomeClienteLocal(colisao)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Valor")}
                      </p>
                      <p className="text-sm font-medium text-text tabular-nums">
                        {comoMoeda(colisao.valor_cents, "BRL")}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Detectado em")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rotuloData(colisao.visto_em, tagDoIdioma)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:hidden">
                        {t("Estado")}
                      </p>
                      <Badge variant={resolvido ? "success" : "warning"}>
                        {rotuloEstado(colisao)}
                      </Badge>
                    </div>
                  </div>

                  {/* UMA ação por linha, no mesmo lugar: importar quando não
                      entrou, abrir o pedido quando já resolveu. */}
                  <div className="mt-3 border-t border-border pt-3 sm:flex sm:justify-end">
                    {resolvido ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/pedidos/${colisao.pedido_importado_id}`}>
                          {textos.abrir}
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={importando === colisao.numero_mercos}
                        onClick={() => void importarColisao(colisao)}
                      >
                        <ArrowsClockwise size={14} aria-hidden />
                        {importando === colisao.numero_mercos
                          ? t("Importando…")
                          : t("Importar com número local")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
