"use client";

/**
 * PAINEL DE PEDIDOS DISPONÍVEIS — o começo do workbench (prompt §5).
 *
 * Sai o diálogo de "Adicionar pedido": a doca precisa ver a fila, comparar
 * pedidos e selecionar vários sem perder o contexto da carga. Aqui a fila é
 * um painel da etapa 1, com busca, filtro, seleção múltipla, escopo explícito
 * da seleção e contador. Pedido já em outra rota aparece DESABILITADO e
 * nomeado — a rota recusa a inclusão com 409, então a tela tem de dizer isso
 * ANTES do clique.
 */
import * as React from "react";

import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";

interface Elegivel {
  id: string;
  numero: number;
  cliente_nome: string;
  cidade: string | null;
  endereco_entrega?: string | null;
  total_cents: number;
  status: string;
  /** `em_outra_rota` é devolvido pelo GET: pedido já alocado noutro romaneio. */
  em_outra_rota?: boolean;
}

interface Resposta {
  data: {
    carga_status: string;
    pedidos: Elegivel[];
    em_outra_rota: { id: string; numero: number; cliente_nome: string }[];
  };
}

function numeroDoPedido(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}

export function PainelDePedidosDisponiveis({
  cargaId,
  podeOperar,
  aoAdicionar,
}: {
  cargaId: string;
  podeOperar: boolean;
  aoAdicionar: () => void | Promise<void>;
}) {
  const t = useT();
  const [pedidos, setPedidos] = React.useState<Elegivel[] | null>(null);
  const [ocupados, setOcupados] = React.useState<Resposta["data"]["em_outra_rota"]>([]);
  const [erro, setErro] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const [salvando, setSalvando] = React.useState(false);
  const buscaRef = React.useRef<HTMLInputElement>(null);

  const carregar = React.useCallback(async () => {
    setErro(false);
    setPedidos(null);
    setSelecionados(new Set());
    try {
      const corpo = await apiClient.get<Resposta>(`/api/v1/shipments/${cargaId}/orders`);
      setPedidos(corpo?.data?.pedidos ?? []);
      setOcupados(corpo?.data?.em_outra_rota ?? []);
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, [cargaId]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const statusDisponiveis = React.useMemo(
    () => [...new Set((pedidos ?? []).map((p) => p.status))].sort(),
    [pedidos],
  );

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (pedidos ?? []).filter((p) => {
      if (status !== "" && p.status !== status) return false;
      if (termo === "") return true;
      return [numeroDoPedido(p.numero), p.cliente_nome, p.cidade, p.endereco_entrega]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [pedidos, busca, status]);

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function selecionarFiltrados() {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      for (const p of filtrados) proximo.add(p.id);
      return proximo;
    });
  }

  async function adicionar() {
    if (selecionados.size === 0) return;
    setSalvando(true);
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/orders`, {
        order_ids: [...selecionados],
      });
      setSelecionados(new Set());
      await aoAdicionar();
      await carregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  const desabilitado = !podeOperar || salvando;

  return (
    <Card id="painel-pedidos-disponiveis" data-testid="painel-pedidos-disponiveis" className="scroll-mt-44 min-w-0 overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Etapa 1")}
          </p>
          <h2 className="text-sm font-medium text-text">{t("Pedidos disponíveis")}</h2>
          <p className="text-[11px] text-text-subtle">
            {t("Só entram os que você selecionar. Pedido em outra rota não pode entrar.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={selecionados.size > 0 ? "info" : "neutral"} className="tabular-nums">
            {selecionados.size} {t("selecionados")}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => void carregar()}
            disabled={salvando}
          >
            {t("Atualizar")}
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-3.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={buscaRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar por pedido, cliente, cidade ou endereço…")}
            aria-label={t("Buscar pedido disponível")}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t("Filtrar por status")}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text sm:w-48"
          >
            <option value="">{t("Todos os status")}</option>
            {statusDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {erro ? (
          <NexusErrorState
            title={t("Não foi possível carregar os pedidos.")}
            description={t("A fila de embarque não respondeu. Tente de novo.")}
            onRetry={() => void carregar()}
          />
        ) : pedidos === null ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("Carregando pedidos")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={selecionarFiltrados}
                disabled={filtrados.length === 0 || desabilitado}
              >
                {t("Selecionar resultados filtrados")} ({filtrados.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() => setSelecionados(new Set())}
                disabled={selecionados.size === 0}
              >
                {t("Limpar seleção")}
              </Button>
              <span className="text-[11px] text-text-subtle">
                {t("O alcance é o filtro atual")}: {filtrados.length} {t("de")} {pedidos.length}
              </span>
            </div>

            {pedidos.length === 0 && ocupados.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {t("Nenhum pedido aguardando embarque nesta organização.")}
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pedidos.map((p) => {
                  const marcado = selecionados.has(p.id);
                  return (
                    <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                      <label htmlFor={`pedido-${p.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <span className="text-sm font-medium text-text">
                            {numeroDoPedido(p.numero)} · {p.cliente_nome}
                          </span>
                          <span className="text-xs text-text tabular-nums">
                            {comoMoeda(p.total_cents, "BRL")}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.endereco_entrega ?? p.cidade ?? t("Sem endereço no cadastro")}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-text-subtle">
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                            {p.status}
                          </Badge>
                          <span>
                            {p.endereco_entrega
                              ? t("Endereço no pedido")
                              : t("Sem endereço — corrija antes de incluir")}
                          </span>
                          {marcado && (
                            <button
                              type="button"
                              onClick={() => alternar(p.id)}
                              className="text-accent-ink underline underline-offset-2"
                            >
                              {t("Remover da seleção")}
                            </button>
                          )}
                        </span>
                        <input
                          id={`pedido-${p.id}`}
                          type="checkbox"
                          aria-label={`${t("Selecionar")} ${numeroDoPedido(p.numero)}`}
                          checked={marcado}
                          onChange={() => alternar(p.id)}
                          disabled={desabilitado}
                          className="sr-only"
                        />
                      </label>
                    </li>
                  );
                })}
                {ocupados.map((p) => (
                  <li
                    key={`ocupado-${p.id}`}
                    className="flex items-start gap-3 bg-muted/30 px-3 py-2.5 text-muted-foreground"
                  >
                    <input type="checkbox" disabled checked={false} className="mt-1 h-5 w-5 shrink-0" aria-label={t("Indisponível")} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm">
                        {numeroDoPedido(p.numero)} · {p.cliente_nome}
                      </span>
                      <span className="block text-[11px] text-warning-fg">{t("Já em outra rota")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => void adicionar()}
                disabled={desabilitado || selecionados.size === 0}
              >
                {salvando
                  ? t("Adicionando…")
                  : selecionados.size === 1
                    ? t("Adicionar 1 pedido")
                    : `${t("Adicionar")} ${selecionados.size} ${t("pedidos")}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
