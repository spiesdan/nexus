"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { StatusDaConferencia, StatusDaEntrada } from "@/lib/schemas/fiscal-entrada";

const EVENTOS = [
  { codigo: "210210", rotulo: "Ciência" },
  { codigo: "210200", rotulo: "Confirmação" },
  { codigo: "210220", rotulo: "Desconhecimento" },
  { codigo: "210240", rotulo: "Não realizada" },
] as const;

/**
 * As ações da nota de entrada, no lugar onde a decisão tem contexto.
 *
 * A regra que a tela materializa: manifestar → sincronizar → conferir →
 * importar. Cada botão só aparece quando o passo anterior está cumprido, e o
 * de importar fica desabilitado com o motivo escrito enquanto a conferência
 * não estiver aprovada — em vez de um clique que a API recusa.
 */
export function AcoesDaEntrada({
  id,
  status,
  conferencia,
  temXml,
  podeGerir,
  podeOperar,
}: {
  id: string;
  status: StatusDaEntrada;
  conferencia: StatusDaConferencia;
  temXml: boolean;
  podeGerir: boolean;
  podeOperar: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const confirmar = useConfirmar();
  const [evento, setEvento] = React.useState<string>("210210");
  const [justificativa, setJustificativa] = React.useState("");
  const [agindo, setAgindo] = React.useState<string | null>(null);

  const encerrada = status === "importada" || status === "ignorada";

  async function acao(caminho: string, corpo: unknown, okMsg: string) {
    setAgindo(caminho);
    try {
      await apiClient.post(`/api/v1/fiscal-entradas/${id}/${caminho}`, corpo);
      toast.success(okMsg);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setAgindo(null);
    }
  }

  const eventosPermitidos = EVENTOS.filter(
    (ev) => ev.codigo === "210210" || podeGerir,
  );
  const exigeJustificativa = evento === "210240";
  const justificativaCurta = exigeJustificativa && justificativa.trim().length < 15;

  /**
   * AS TRÊS AÇÕES QUE NÃO TÊM BOTÃO DE VOLTAR.
   *
   * Medido na auditoria 5.8: manifestar desconhecimento/não realizada, ignorar
   * e importar eram um clique só — e importar move estoque e cria contas a
   * pagar. A confirmação nomeia o efeito, inclusive que a manifestação vai à
   * SEFAZ e não é desfeita por esta tela.
   */
  async function confirmarManifestacao(): Promise<boolean> {
    const rotulo = EVENTOS.find((e) => e.codigo === evento)?.rotulo ?? evento;
    if (evento === "210210") return true; // Ciência é o passo normal do fluxo.
    return confirmar({
      title: t(`Manifestar "${t(rotulo)}" para esta nota?`),
      description: t(
        "A manifestação é transmitida à SEFAZ e fica registrada na nota de entrada. Não há como desfazer por esta tela.",
      ),
      confirmLabel: t("Manifestar"),
      cancelLabel: t("Voltar"),
    });
  }

  async function confirmarImportacao(): Promise<boolean> {
    return confirmar({
      title: t("Importar esta entrada para estoque e financeiro?"),
      description: t(
        "A importação grava o movimento de estoque e cria as contas a pagar da nota. Confira os itens na conferência antes: esta tela não desfaz a importação.",
      ),
      confirmLabel: t("Importar"),
      cancelLabel: t("Voltar"),
    });
  }

  async function confirmarIgnorar(): Promise<boolean> {
    return confirmar({
      title: t("Ignorar esta nota de entrada?"),
      description: t(
        "A nota sai do fluxo de conferência e importação. Ela continua no histórico, mas não entra em estoque nem em contas a pagar.",
      ),
      confirmLabel: t("Ignorar"),
      cancelLabel: t("Voltar"),
      danger: true,
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{t("Ações da nota")}</h2>

      {!podeOperar && (
        <p className="text-sm text-muted-foreground">
          {t("Seu papel permite consultar, mas não manifestar nem importar.")}
        </p>
      )}

      {podeOperar && !encerrada && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("Manifestação")}
              <select
                value={evento}
                onChange={(e) => setEvento(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label={t("Evento de manifestação")}
              >
                {eventosPermitidos.map((ev) => (
                  <option key={ev.codigo} value={ev.codigo}>
                    {t(ev.rotulo)}
                  </option>
                ))}
              </select>
            </label>
            {exigeJustificativa && (
              <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                {t("Justificativa (15+ letras)")}
                <Input
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  maxLength={255}
                  className="h-9"
                />
              </label>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={agindo !== null || justificativaCurta}
              onClick={() => {
                void (async () => {
                  if (!(await confirmarManifestacao())) return;
                  await acao(
                    "manifestar",
                    {
                      evento,
                      ...(exigeJustificativa ? { justificativa } : {}),
                    },
                    t("Manifestação registrada."),
                  );
                })();
              }}
            >
              {agindo === "manifestar" ? t("Enviando…") : t("Manifestar")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={agindo !== null}
              onClick={() => {
                void (async () => {
                  if (!(await confirmarIgnorar())) return;
                  await acao("ignorar", {}, t("Nota ignorada."));
                })();
              }}
            >
              {t("Ignorar")}
            </Button>
          </div>

          {!temXml && (
            <p className="text-xs text-muted-foreground">
              {t(
                "Sem XML completo ainda. Depois de manifestar, sincronize na Visão Geral para a SEFAZ liberar os itens.",
              )}
            </p>
          )}
        </div>
      )}

      {podeGerir && temXml && !encerrada && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {conferencia === "aprovada" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={agindo !== null}
              onClick={() =>
                void acao("conferencia", { decisao: "reabrir" }, t("Conferência reaberta."))
              }
            >
              {t("Reabrir conferência")}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={agindo !== null}
                onClick={() =>
                  void acao("conferencia", { decisao: "aprovar" }, t("Conferência aprovada."))
                }
              >
                {t("Aprovar conferência")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={agindo !== null}
                onClick={() =>
                  void acao("conferencia", { decisao: "rejeitar" }, t("Conferência rejeitada."))
                }
              >
                {t("Rejeitar")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={conferencia === "aprovada" ? "default" : "outline"}
            disabled={agindo !== null || conferencia !== "aprovada"}
            title={
              conferencia === "aprovada"
                ? undefined
                : t("Aprove a conferência antes de mover estoque.")
            }
            onClick={() => {
              void (async () => {
                if (!(await confirmarImportacao())) return;
                await acao("importar", {}, t("Entrada importada."));
              })();
            }}
          >
            {agindo === "importar" ? t("Importando…") : t("Importar para estoque e financeiro")}
          </Button>
        </div>
      )}

      {status === "importada" && (
        <p className="text-sm text-muted-foreground">
          {t("Esta nota já foi importada — estoque e contas a pagar estão gravados.")}
        </p>
      )}
      {status === "ignorada" && (
        <p className="text-sm text-muted-foreground">
          {t("Esta nota foi ignorada e não segue no fluxo.")}
        </p>
      )}

    </div>
  );
}
