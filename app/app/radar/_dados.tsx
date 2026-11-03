"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { filtrosParaUrl, lerFiltrosDaUrl } from "@/lib/comercial/radar-filtros-url";
import { FILTRO_RADAR_VAZIO, type FiltroRadar, type LinhaRadar } from "@/lib/comercial/radar-score";
import type { ClienteInativo } from "@/lib/comercial/inatividade";
import { comoMoeda } from "@/lib/format/moeda";

import type { LinhaRadarLista } from "./_components/RecompraRadarList";

// A chamada agrega a base inteira: 60s de teto em vez dos 10s padrão. Sem
// isso o abort caía no erro e a tela dizia "base em dia" sem ter lido nada.
const TIMEOUT_RADAR_MS = 60_000;

/**
 * O estado e os dados que as telas do Radar compartilham.
 *
 * O recorte fica no PROVIDER (que vive no layout do segmento) e não em cada
 * tela: `useState` local morreria ao trocar de aba, e a pessoa voltaria para a
 * carteira inteira sem entender por quê. A URL é a outra metade — sobrevive ao
 * F5 e vira link — e é escrita com `history.replaceState` de propósito: trocar
 * um filtro não é navegação, e não pode refazer a guarda do servidor a cada
 * tecla.
 */
interface ValorDoRadar {
  filtros: FiltroRadar;
  mudar: (patch: Partial<FiltroRadar>) => void;
  limpar: () => void;
  temBase: boolean;
  podeOperar: boolean;
  usuarioId: string;
}

const Contexto = React.createContext<ValorDoRadar | null>(null);

/** As chaves do recorte — usadas para trocá-las sem perder o resto da URL. */
const CHAVES_DO_RECORTE = ["busca", "vendedor", "cidade", "periodo", "niveis", "diasmin", "ticketmin"];

function escreverRecorteNaUrl(f: FiltroRadar) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const chave of CHAVES_DO_RECORTE) params.delete(chave);
  for (const [chave, valor] of new URLSearchParams(filtrosParaUrl(f))) params.set(chave, valor);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

export function RadarDadosProvider({
  temBase,
  podeOperar,
  usuarioId,
  children,
}: {
  temBase: boolean;
  podeOperar: boolean;
  usuarioId: string;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const [filtros, setFiltros] = React.useState<FiltroRadar>(() => lerFiltrosDaUrl(params));

  const mudar = React.useCallback(
    (patch: Partial<FiltroRadar>) => {
      const proximo = { ...filtros, ...patch };
      setFiltros(proximo);
      escreverRecorteNaUrl(proximo);
    },
    [filtros],
  );

  const limpar = React.useCallback(() => {
    setFiltros(FILTRO_RADAR_VAZIO);
    escreverRecorteNaUrl(FILTRO_RADAR_VAZIO);
  }, []);

  const valor = React.useMemo<ValorDoRadar>(
    () => ({ filtros, mudar, limpar, temBase, podeOperar, usuarioId }),
    [filtros, mudar, limpar, temBase, podeOperar, usuarioId],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useRadarDados(): ValorDoRadar {
  const v = React.useContext(Contexto);
  if (!v) {
    // Falha alta: um componente do Radar montado fora do layout perderia o
    // recorte em silêncio, e a tela mostraria mais gente do que a pessoa pediu.
    throw new Error("useRadarDados precisa estar dentro de RadarDadosProvider (layout do /app/radar)");
  }
  return v;
}

/**
 * As linhas do radar de compras, uma leitura para as três telas que as usam.
 *
 * `staleTime` de 60s: alternar entre Visão geral, Categorias e Oportunidades é
 * a mesma leitura. Sem isto, cada aba refaria uma varredura de até 5000 linhas
 * e a tela piscaria skeleton a cada clique.
 */
export function useLinhasDoRadar() {
  const q = useQuery({
    queryKey: ["radar-compras", "todas"],
    queryFn: () =>
      apiClient
        .get<{ data: LinhaRadarLista[] }>("/api/v1/radar-compras?situacao=todas&limit=5000", {
          timeoutMs: TIMEOUT_RADAR_MS,
        })
        .then((corpo) => corpo.data ?? []),
    staleTime: 60_000,
  });

  return {
    linhas: q.data ?? null,
    falhou: q.isError,
    recarregar: () => void q.refetch(),
  };
}

export function useVendedoresDoRadar() {
  const q = useQuery({
    queryKey: ["radar-vendedores"],
    queryFn: () =>
      apiClient
        .get<{ data: { user_id: string; full_name: string | null }[] }>("/api/v1/team/assignable")
        .then((r) => (Array.isArray(r?.data) ? r.data : [])),
    staleTime: 5 * 60_000,
  });
  return q.data ?? [];
}

/** Os maiores recuperáveis (90 dias) — a porta para a tela de Recuperação. */
export function useInativosDoRadar() {
  const q = useQuery({
    queryKey: ["radar-inativos", 90],
    queryFn: () =>
      apiClient
        .get<{ data: ClienteInativo[] }>("/api/v1/comercial/inativos?dias=90")
        .then((r) => (Array.isArray(r?.data) ? r.data.slice(0, 5) : [])),
    staleTime: 60_000,
  });
  return { inativos: q.data ?? null };
}

/** `Criar tarefa` aparece no board e no ranking; a regra é uma só. */
export function useCriarTarefaDoRadar() {
  const t = useT();
  const [tarefaEmCurso, setTarefaEmCurso] = React.useState<string | null>(null);

  async function criarTarefa(l: LinhaRadar) {
    setTarefaEmCurso(l.contact_id);
    try {
      await apiClient.post("/api/v1/tarefas", {
        titulo: `Contatar ${l.nome} — recompra atrasada +${l.atraso_dias}d`,
        descricao: `Última compra há ${l.dias_sem_compra} dias; ticket médio ${comoMoeda(l.ticket_medio_cents, "BRL")}.`,
        contact_id: l.contact_id,
      });
      toast.success(t("Tarefa criada — aparece no quadro de tarefas."));
    } catch (e) {
      showApiError(e);
    } finally {
      setTarefaEmCurso(null);
    }
  }

  return { criarTarefa, tarefaEmCurso };
}
