"use client";

/**
 * Nível 2 restrito, na tela: SIMULAR → revisar antes/depois → confirmar →
 * executar; e reverter enquanto a reversão for honesta.
 *
 * Nada aqui é automático. O botão de executar só habilita depois que o gestor
 * viu o antes/depois e marcou a confirmação; a rota recusa qualquer plano que
 * não seja exatamente o simulado (hash) e a RPC repete o CAS no banco.
 */
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { correcaoDeJobSuportada } from "@/lib/sentinel/correcao-constantes";

import type { OcorrenciaSentinel } from "./_tipos";

interface PlanoSimulado {
  jobId: string;
  antes: { run_after: string };
  depois: { run_after: string };
  hash: string;
  resumo: string;
}

interface Simulacao {
  plano: PlanoSimulado;
  job: { id: string; kind: string; status: string; attempts: number; max_attempts: number };
}

function quando(iso: string, tag: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString(tag);
}

export function CorrecaoAprovada({
  ocorrencia,
  onAtualizar,
}: {
  ocorrencia: OcorrenciaSentinel;
  onAtualizar: () => void | Promise<void>;
}) {
  const suportada = correcaoDeJobSuportada(ocorrencia.regra, ocorrencia.entidade_tipo);
  const tagDeIdioma = useTagDeIdioma();
  const [simulacao, setSimulacao] = React.useState<Simulacao | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [simulando, setSimulando] = React.useState(false);
  const [executando, setExecutando] = React.useState(false);
  const [revertendo, setRevertendo] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState(false);

  if (!suportada) return null;

  if (ocorrencia.estado === "corrigida") {
    return (
      <section className="rounded-lg border border-success-bg bg-success-bg/20 p-4">
        <h3 className="font-medium text-text">Correção aplicada</h3>
        <p className="mt-1 text-sm text-text-muted">
          Job antecipado com aprovação registrada. A reversão abaixo só vale enquanto o job
          continua pendente com o horário que gravamos; depois de reclamado, ela é recusada.
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
              await apiClient.post(`/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao/reverter`, {});
              await onAtualizar();
            } catch (e) {
              showApiError(e);
              setErro("Não foi possível reverter — o job pode já ter sido reclamado.");
            } finally {
              setRevertendo(false);
            }
          }}
        >
          {revertendo ? "Revertendo…" : "Reverter correção"}
        </Button>
        {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
      </section>
    );
  }

  if (ocorrencia.estado !== "aprovada") {
    return (
      <section className="rounded-lg border border-border bg-surface-elevated/40 p-4">
        <h3 className="font-medium text-text">Correção aprovada</h3>
        <p className="mt-1 text-sm text-text-muted">
          Aprove a ocorrência para habilitar a simulação. O Sentinel não executa nada antes
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
        `/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao/simular`,
        {},
      );
      setSimulacao({ plano: resp.data.plano, job: resp.data.job });
    } catch (e) {
      showApiError(e);
      setErro("Este caso não é elegível para correção. Veja o histórico para o motivo.");
    } finally {
      setSimulando(false);
    }
  }

  async function executar() {
    if (!simulacao) return;
    setErro(null);
    setExecutando(true);
    try {
      await apiClient.post(`/api/v1/sentinel/occurrences/${ocorrencia.id}/correcao`, {
        confirmado: true,
        antes: simulacao.plano.antes.run_after,
        depois: simulacao.plano.depois.run_after,
        hash: simulacao.plano.hash,
      });
      setSimulacao(null);
      setConfirmado(false);
      await onAtualizar();
    } catch (e) {
      showApiError(e);
      setErro("A execução foi recusada: o job mudou ou o plano expirou. Simule de novo.");
    } finally {
      setExecutando(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface-elevated/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-text">Correção aprovada (revisável)</h3>
        <Button variant="outline" size="sm" onClick={() => void simular()} disabled={simulando}>
          {simulando ? "Simulando…" : "Simular correção"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Antecipar o job de manutenção pendente para agora. Não toca em nota, saldo, pagamento,
        campanha nem envia mensagem ao cliente.
      </p>

      {simulacao ? (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-surface p-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Antes</dt>
              <dd className="text-text">{quando(simulacao.plano.antes.run_after, tagDeIdioma)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Depois</dt>
              <dd className="text-text">{quando(simulacao.plano.depois.run_after, tagDeIdioma)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Job</dt>
              <dd className="text-text">
                {simulacao.job.kind} · {simulacao.job.status} · tentativa{" "}
                {simulacao.job.attempts}/{simulacao.job.max_attempts}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-muted">Reversão</dt>
              <dd className="text-text">Disponível enquanto o job não for reclamado.</dd>
            </div>
          </dl>

          <label className="flex items-start gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-accent"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span>Revisei o antes/depois e confirmo a execução desta correção.</span>
          </label>

          <Button size="sm" onClick={() => void executar()} disabled={!confirmado || executando}>
            {executando ? "Executando…" : "Executar correção"}
          </Button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-destructive">{erro}</p> : null}
    </section>
  );
}
