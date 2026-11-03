"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
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
              onClick={() =>
                void acao(
                  "manifestar",
                  {
                    evento,
                    ...(exigeJustificativa ? { justificativa } : {}),
                  },
                  t("Manifestação registrada."),
                )
              }
            >
              {agindo === "manifestar" ? t("Enviando…") : t("Manifestar")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={agindo !== null}
              onClick={() => void acao("ignorar", {}, t("Nota ignorada."))}
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
            onClick={() => void acao("importar", {}, t("Entrada importada."))}
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
