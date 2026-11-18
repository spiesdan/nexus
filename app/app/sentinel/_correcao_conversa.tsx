"use client";

/**
 * Nível 2, segundo caso: liberar o claim de uma conversa parada.
 *
 * SIMULAR → ver o responsável/claim atual → escrever o motivo → confirmar →
 * EXECUTAR. A conversa volta para a fila sem responsável; a reversão só é
 * oferecida depois, e o servidor recusa se outro agente assumiu.
 */
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { correcaoDeConversaSuportada } from "@/lib/sentinel/correcao-constantes";

import type { OcorrenciaSentinel } from "./_tipos";

interface PlanoConversa {
  conversaId: string;
  antes: { atendente_id: string; assigned_at: string };
  depois: { status: "open"; atendente_id: null; assigned_at: null };
  hash: string;
  resumo: string;
}

interface Simulacao {
  plano: PlanoConversa;
  conversa: { id: string; status: string };
}

function quando(iso: string, tag: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString(tag);
}

export function CorrecaoDeConversa({
  ocorrencia,
  onAtualizar,
}: {
  ocorrencia: OcorrenciaSentinel;
  onAtualizar: () => void | Promise<void>;
}) {
  const suportada = correcaoDeConversaSuportada(ocorrencia.regra, ocorrencia.entidade_tipo);
  const tag = useTagDeIdioma();
  const [simulacao, setSimulacao] = React.useState<Simulacao | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [simulando, setSimulando] = React.useState(false);
  const [executando, setExecutando] = React.useState(false);
  const [revertendo, setRevertendo] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState(false);

  if (!suportada) return null;

  if (ocorrencia.estado === "corrigida") {
    return (
      <section className="rounded-lg border border-success-bg bg-success-bg/20 p-4">
        <h3 className="font-medium text-text">Conversa devolvida para a fila</h3>
        <p className="mt-1 text-sm text-text-muted">
          O claim foi liberado com motivo registrado. A reversão só vale enquanto ninguém assumiu a
          conversa de novo; depois disso, o servidor recusa em vez de roubar o novo responsável.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={revertendo}
          onClick={async () => {
            setErro(null);
            setRevertendo(true);
            try {
              await apiClient.post(
                `/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao/conversa/reverter`,
                {},
              );
              await onAtualizar();
            } catch (e) {
              showApiError(e);
              setErro("Não foi possível reverter — outro agente pode ter assumido a conversa.");
            } finally {
              setRevertendo(false);
            }
          }}
        >
          {revertendo ? "Revertendo…" : "Devolver o claim ao responsável"}
        </Button>
        {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
      </section>
    );
  }

  if (ocorrencia.estado !== "aprovada") {
    return (
      <section className="rounded-lg border border-border bg-surface-elevated/40 p-4">
        <h3 className="font-medium text-text">Liberar conversa parada</h3>
        <p className="mt-1 text-sm text-text-muted">
          Aprove a ocorrência para habilitar a simulação. O Sentinel não libera nenhum claim antes
          disso.
        </p>
      </section>
    );
  }

  async function simular() {
    setErro(null);
    setSimulando(true);
    setSimulacao(null);
    setConfirmado(false);
    try {
      const resp = await apiClient.post<{ data: Simulacao & { elegivel: true } }>(
        `/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao/conversa/simular`,
        {},
      );
      setSimulacao({ plano: resp.data.plano, conversa: resp.data.conversa });
    } catch (e) {
      showApiError(e);
      setErro("Esta conversa não é elegível. Veja o histórico para o motivo.");
    } finally {
      setSimulando(false);
    }
  }

  async function executar() {
    if (!simulacao) return;
    setErro(null);
    setExecutando(true);
    try {
      await apiClient.post(`/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao/conversa`, {
        confirmado: true,
        motivo: motivo.trim(),
        antes_atendente: simulacao.plano.antes.atendente_id,
        antes_assigned_at: simulacao.plano.antes.assigned_at,
        hash: simulacao.plano.hash,
      });
      setSimulacao(null);
      setConfirmado(false);
      setMotivo("");
      await onAtualizar();
    } catch (e) {
      showApiError(e);
      setErro("A execução foi recusada: a conversa mudou ou o plano expirou. Simule de novo.");
    } finally {
      setExecutando(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface-elevated/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-text">Liberar conversa parada (revisável)</h3>
        <Button variant="outline" size="sm" onClick={() => void simular()} disabled={simulando}>
          {simulando ? "Simulando…" : "Simular liberação"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Devolve a conversa para a fila da organização, sem responsável. Não toca em nota,
        pagamento, recebível nem campanha.
      </p>

      {simulacao ? (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-surface p-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Antes</dt>
              <dd className="text-text">
                Responsável {simulacao.plano.antes.atendente_id.slice(0, 8)} · claim de{" "}
                {quando(simulacao.plano.antes.assigned_at, tag)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Depois</dt>
              <dd className="text-text">Fila da organização · sem responsável</dd>
            </div>
          </dl>

          <div className="space-y-1">
            <label htmlFor="sentinel-motivo-conversa" className="text-sm text-text">
              Motivo (obrigatório, fica no histórico)
            </label>
            <Textarea
              id="sentinel-motivo-conversa"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que esta conversa deve voltar para a fila?"
              rows={2}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-accent"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span>Revisei o antes/depois e confirmo a liberação desta conversa.</span>
          </label>

          <Button
            size="sm"
            onClick={() => void executar()}
            disabled={!confirmado || motivo.trim().length < 3 || executando}
          >
            {executando ? "Executando…" : "Liberar conversa"}
          </Button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
    </section>
  );
}
