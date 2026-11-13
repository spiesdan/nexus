"use client";

import * as React from "react";
import Link from "next/link";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { horaDoMinuto, minutosDoDia } from "@/lib/rotas/janelas";
import { formatarDistancia, formatarDuracao, haversineM, ordemCompleta } from "@/lib/rotas/roteamento";
import { createClient } from "@/lib/supabase/browser";
import { CaretDown, CaretUp, MapPin } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MapaRota, type PontoParadaMapa } from "./_mapa-rota";

export interface ParadaRotaApi {
  chave: string;
  contact_id: string | null;
  cliente: string;
  fone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  geo_fonte: string | null;
  pedidos: { shipment_order_id: string; order_id: string; numero: number; total_cents: number; status: string }[];
  /** Itens a entregar (somados por produto quando o cliente tem 2+ pedidos). */
  itens?: { codigo: string; nome: string; quantidade: number }[];
  total_cents: number;
}

/** Veículo da frota, como sai de GET /api/v1/fleet. */
interface VeiculoDaFrotaApi {
  id: string;
  placa: string;
  veiculo_tipo: string | null;
  capacidade_kg: number;
  capacidade_m3: number;
  ativo: boolean;
}

interface MotoristaDaFrotaApi {
  id: string;
  nome: string;
  capacidade_jornada_min: number;
  ativo: boolean;
}

/** Uma rota por veículo — mesma forma no solver, no histórico e na confirmação. */
export interface RotaDeVeiculoApi {
  veiculo_id: string | null;
  motorista_id: string | null;
  placa?: string | null;
  motorista_nome?: string | null;
  paradas: string[];
  /** Chegada em cada parada, segundos desde a saída (1:1 com `paradas`). */
  chegadas_s?: number[];
  distancia_m: number | null;
  duracao_s: number | null;
  carga_kg: number;
  carga_m3: number;
  geometria?: number[][];
}

export interface DistribuicaoApi {
  id: string;
  versao: number;
  algoritmo: string;
  veiculos: RotaDeVeiculoApi[];
  distancia_m: number | null;
  duracao_s: number | null;
  tempo_execucao_ms: number | null;
  criado_em: string;
}

interface HistoricoRotaApi {
  id: string;
  versao: number;
  algoritmo: string;
  distancia_m: number | null;
  duracao_s: number | null;
  criado_em: string;
  ativa: boolean;
}

interface PropostaMulti {
  veiculos: RotaDeVeiculoApi[];
  total_paradas: number;
  status: string;
  origem: { node_id: string; latitude: number; longitude: number };
  retornar_origem: boolean;
  tempo_parada_min: number;
  saida_prevista: string | null;
  nao_roteirizaveis: { chave: string; cliente: string; endereco: string | null }[];
  entregas_nao_alocadas: string[];
  restricoes_nao_aplicadas: string[];
  total_kg: number;
  total_m3: number;
  tempo_execucao_ms: number;
  versao_algoritmo: string;
  matriz_provedor: string;
}

/** Cores por veículo — a linha do mapa e a legenda usam a MESMA paleta. */
const CORES_DOS_VEICULOS = [
  "#7c3aed",
  "#0891b2",
  "#d97706",
  "#db2777",
  "#16a34a",
  "#4f46e5",
  "#0f766e",
  "#b45309",
];

/**
 * Restrições que o solver declara NÃO ter aplicado.
 *
 * Elas não são erro: são a diferença entre "respeitei a capacidade" e "não havia
 * capacidade cadastrada". Mostrar o código cru na tela esconderia justamente o
 * que o operador precisa corrigir (produto sem peso, veículo sem capacidade,
 * janela sem hora de saída).
 */
const ROTULO_RESTRICAO: Record<string, string> = {
  frota_nao_informada: "Nenhum veículo informado — a distribuição usou um só.",
  capacidade_peso_sem_dados: "Nenhum produto com peso no cadastro: a capacidade em kg não foi verificada.",
  capacidade_peso_sem_dado_do_veiculo: "Veículo sem capacidade em kg: o peso não foi limitado.",
  capacidade_volume_sem_dados: "Nenhum produto com dimensões: a capacidade em m³ não foi verificada.",
  capacidade_volume_sem_dado_do_veiculo: "Veículo sem capacidade em m³: o volume não foi limitado.",
  jornada_sem_dados: "Motorista sem jornada cadastrada: o tempo de trabalho não foi limitado.",
  janelas_de_entrega_sem_dados: "Nenhum pedido com janela de entrega: o horário não foi restringido.",
  janelas_de_entrega_sem_hora_de_saida: "Há janela de entrega, mas falta a hora de saída: o horário não foi restringido.",
  janelas_conflitantes_na_parada: "Dois pedidos do mesmo destino têm janelas que não se cruzam.",
  peso_de_produto_incompleto: "Algum produto da carga não tem peso no cadastro.",
  volume_de_produto_incompleto: "Algum produto da carga não tem dimensões no cadastro.",
  capacidade_sem_dado_do_veiculo: "O veículo da carga não tem capacidade cadastrada.",
};

export interface RotaCarregada {
  carga: {
    id: string;
    numero: number;
    status: string;
    placa: string | null;
    veiculo_tipo: string | null;
    motorista_nome: string | null;
    origem_endereco: string | null;
    origem_lat: number | null;
    origem_lng: number | null;
    retornar_origem: boolean;
    tempo_parada_min: number;
    distancia_m: number | null;
    duracao_s: number | null;
    rota_geojson: { geometria?: number[][]; provedor?: string; ruas?: boolean; modo?: string } | null;
    rota_em: string | null;
    rota_versao: number;
    saida_prevista: string | null;
    started_at: string | null;
    finished_at: string | null;
  };
  paradas: ParadaRotaApi[];
  ultima_posicao: { latitude: number; longitude: number; em: string } | null;
  distribuicao?: DistribuicaoApi | null;
  historico_rotas?: HistoricoRotaApi[];
}

export interface PropostaRota {
  ordem: string[];
  origem: { lat: number; lng: number; endereco: string | null } | null;
  retornar_origem: boolean;
  tempo_parada_min: number;
  modo: string;
  distancia_m: number;
  duracao_dirigindo_s: number;
  duracao_total_s: number;
  geometria: number[][];
  provedor: string;
  ruas: boolean;
  nao_roteirizaveis: string[];
}

const ROTULO_GEO: Record<string, string> = {
  ok: "No mapa",
  pendente: "A localizar",
  nao_encontrado: "Não localizado",
  ambiguo: "Ambíguo",
  erro: "Erro",
};

/**
 * O QUE O PINO VALE — a tela não pode chamar de exato o que é aproximado.
 *
 * `nominatim:rua` o OSM achou a rua mas não o número; `nominatim:cidade` a
 * rua não existe no OSM e o pino caiu no município (CEP/bairro). O segundo
 * acontece em endereço rural, onde o motorista precisa saber que ainda tem
 * que localizar a porteira — por isso o rótulo é explícito.
 */
const APROXIMADO_POR_FONTE: Record<string, string> = {
  "nominatim:rua": "(rua aproximada)",
  "nominatim:bairro": "(aproximado — bairro)",
  "nominatim:cidade": "(aproximado — cidade)",
};

/**
 * ROTEIRIZADOR — a central de planejamento da carga.
 *
 * Paradas vêm da carga (agrupadas por cliente no backend), geocodificação no
 * servidor com cache, otimização OSRM pelas ruas com fallback honesto,
 * reordenação manual, origem configurável e mapa sincronizado. Salvar grava
 * sequência + geometria + versão; iniciar/finalizar moram nos botões da
 * carga e no modo motorista.
 */
export function Roteirizador({
  cargaId,
  podeOperar,
  aoMudar,
}: {
  cargaId: string;
  podeOperar: boolean;
  aoMudar: () => void;
}) {
  const t = useT();
  // O histórico de rotas mostra data e hora: o formato tem de seguir o idioma
  // de quem lê, não um "pt-BR" fixo no código (gate i18n).
  const tagDeIdioma = useTagDeIdioma();
  const confirmar = useConfirmar();
  const [rota, setRota] = React.useState<RotaCarregada | null>(null);
  const [ordem, setOrdem] = React.useState<string[]>([]);
  const [proposta, setProposta] = React.useState<PropostaRota | null>(null);
  const [origemTexto, setOrigemTexto] = React.useState("");
  const [retornar, setRetornar] = React.useState(false);
  const [tempoParada, setTempoParada] = React.useState(8);
  const [trabalhando, setTrabalhando] = React.useState<string | null>(null);
  const [progressoGeo, setProgressoGeo] = React.useState<string | null>(null);
  const [marcarPara, setMarcarPara] = React.useState<string | null>(null);
  const [pinoPendente, setPinoPendente] = React.useState<{ lat: number; lng: number } | null>(null);
  const [rastro, setRastro] = React.useState<[number, number][]>([]);
  const [motorista, setMotorista] = React.useState<{ lat: number; lng: number } | null>(null);
  // ── Distribuição por veículo (F5/VRPTW) ──────────────────────────────────
  const [frota, setFrota] = React.useState<{
    veiculos: VeiculoDaFrotaApi[];
    motoristas: MotoristaDaFrotaApi[];
  } | null>(null);
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [motoristaPorVeiculo, setMotoristaPorVeiculo] = React.useState<Record<string, string>>({});
  /** chave da parada → veiculo_id. A ordem dentro do veículo vem de `ordem`. */
  const [atribuicao, setAtribuicao] = React.useState<Record<string, string>>({});
  const [propostaMulti, setPropostaMulti] = React.useState<PropostaMulti | null>(null);
  const [saida, setSaida] = React.useState("");

  // Devolve a rota lida para quem precisa do estado NOVO no mesmo clique
  // (o cálculo da ordem geocodifica antes e não pode decidir pelo render
  // anterior — a closure de `comCoord` ficaria velha).
  const recarregar = React.useCallback(async (): Promise<RotaCarregada | null> => {
    try {
      const corpo = await apiClient.get<{ data: RotaCarregada }>(`/api/v1/shipments/${cargaId}/rota`);
      const d = corpo.data;
      setRota(d);
      setOrdem((atual) => {
        const chaves = d.paradas.map((p) => p.chave);
        // Preserva reordenação manual quando as paradas são as mesmas.
        if (atual.length === chaves.length && atual.every((c) => chaves.includes(c))) return atual;
        // Com distribuição confirmada, a ordem lida é a do romaneio (veículo a
        // veículo) — o mesmo que o motorista vê.
        const confirmada = d.distribuicao?.veiculos.flatMap((v) => v.paradas) ?? [];
        return confirmada.length === chaves.length ? confirmada : chaves;
      });
      setSaida((atual) => {
        const salva = d.carga.saida_prevista?.slice(0, 5) ?? "";
        return salva || atual;
      });
      if (d.distribuicao) {
        const mapa: Record<string, string> = {};
        const ids: string[] = [];
        const motores: Record<string, string> = {};
        for (const v of d.distribuicao.veiculos) {
          if (!v.veiculo_id) continue;
          ids.push(v.veiculo_id);
          if (v.motorista_id) motores[v.veiculo_id] = v.motorista_id;
          for (const chave of v.paradas) mapa[chave] = v.veiculo_id;
        }
        setSelecionados(ids);
        setMotoristaPorVeiculo(motores);
        setAtribuicao(mapa);
        setPropostaMulti(null);
      }
      setOrigemTexto((atual) => (atual === "" && d.carga.origem_endereco ? d.carga.origem_endereco : atual));
      setRetornar(d.carga.retornar_origem);
      setTempoParada(d.carga.tempo_parada_min);
      if (d.ultima_posicao) setMotorista({ lat: d.ultima_posicao.latitude, lng: d.ultima_posicao.longitude });
      return d;
    } catch (e) {
      showApiError(e);
      return null;
    }
  }, [cargaId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  // Frota: uma vez, para o painel de distribuição saber o que pode alocar.
  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: { veiculos: VeiculoDaFrotaApi[]; motoristas: MotoristaDaFrotaApi[] } }>(
        "/api/v1/fleet",
      )
      .then((r) => {
        if (!vivo) return;
        setFrota(r.data);
        // Seleção inicial: frota ativa inteira. Quem não tem frota continua no
        // fluxo single-vehicle (`Salvar ordem`) — o painel diz isso.
        setSelecionados((atual) =>
          atual.length > 0 ? atual : r.data.veiculos.filter((v) => v.ativo).map((v) => v.id),
        );
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const statusCarga = rota?.carga.status;

  // Rastro realizado (mapa + comparação planejado×realizado).
  React.useEffect(() => {
    if (!rota || (statusCarga !== "em_rota" && statusCarga !== "concluida")) return;
    let vivo = true;
    apiClient
      .get<{ data: { posicoes: { latitude: number; longitude: number }[] } }>(
        `/api/v1/shipments/${cargaId}/rota/posicao?limite=500`,
      )
      .then((r) => {
        if (vivo) setRastro((r.data.posicoes ?? []).map((p) => [p.latitude, p.longitude]));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaId, statusCarga]);

  // Motorista ao vivo via Realtime (sem polling): INSERT em shipment_positions.
  React.useEffect(() => {
    if (!rota || statusCarga !== "em_rota") return;
    const sb = createClient();
    const canal = sb
      .channel(`rota:${cargaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shipment_positions", filter: `shipment_id=eq.${cargaId}` },
        (pag: { new: { latitude: number; longitude: number } }) => {
          const n = pag.new as { latitude: number; longitude: number };
          if (typeof n.latitude === "number" && typeof n.longitude === "number") {
            setMotorista({ lat: n.latitude, lng: n.longitude });
            setRastro((atual) => [...atual.slice(-499), [n.latitude, n.longitude]]);
          }
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaId, statusCarga]);

  if (!rota) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[50vh] w-full" />
        <p className="text-sm text-muted-foreground">{t("Carregando rota…")}</p>
      </div>
    );
  }

  const paradasOrdenadas = ordem
    .map((c) => rota.paradas.find((p) => p.chave === c))
    .filter((p): p is ParadaRotaApi => !!p);
  const comCoord = paradasOrdenadas.filter((p) => p.latitude != null && p.longitude != null);
  const semCoord = paradasOrdenadas.filter((p) => p.latitude == null || p.longitude == null);
  const totalClientes = new Set(rota.paradas.map((p) => p.contact_id ?? p.chave)).size;
  // Planejador vale montando E em rota (reotimizar no meio do caminho é
  // operação normal — o motorista confirma a nova sequência no app).
  const editavel = podeOperar && (rota.carga.status === "montando" || rota.carga.status === "em_rota");
  const valorTotal = rota.paradas.reduce((s, p) => s + p.total_cents, 0);
  const ordemSalva = rota.paradas.map((p) => p.chave);
  const ordemMudou = ordem.join("|") !== ordemSalva.join("|") && ordem.length === ordemSalva.length;
  const configMudou = retornar !== rota.carga.retornar_origem || tempoParada !== rota.carga.tempo_parada_min;

  // ── Distribuição por veículo: derivados ──────────────────────────────────
  const veiculosAtivos = (frota?.veiculos ?? []).filter((v) => v.ativo);
  const motoristasAtivos = (frota?.motoristas ?? []).filter((m) => m.ativo);
  const distribuicaoExibida = propostaMulti ?? rota.distribuicao ?? null;
  const idsDaDistribuicao = (distribuicaoExibida?.veiculos ?? [])
    .map((v) => v.veiculo_id)
    .filter((v): v is string => v != null);
  const corDoVeiculo = (id: string | null) => {
    if (!id) return "#6b7280";
    const i = idsDaDistribuicao.indexOf(id);
    return CORES_DOS_VEICULOS[(i < 0 ? idsDaDistribuicao.length : i) % CORES_DOS_VEICULOS.length]!;
  };
  const frotaPorId = new Map(veiculosAtivos.map((v) => [v.id, v]));
  const rotuloDoVeiculo = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const daFrota = frotaPorId.get(id);
    if (daFrota) return daFrota.placa;
    const noSnapshot = distribuicaoExibida?.veiculos.find((v) => v.veiculo_id === id);
    return noSnapshot?.placa ?? null;
  };
  const chegadaPorChave = new Map<string, number>();
  for (const v of distribuicaoExibida?.veiculos ?? []) {
    v.paradas.forEach((chave, i) => {
      const chegada = v.chegadas_s?.[i];
      if (chegada != null) chegadaPorChave.set(chave, chegada);
    });
  }
  const partidaMin = minutosDoDia(saida);
  const horaDeChegada = (chave: string): string | null => {
    const chegada = chegadaPorChave.get(chave);
    if (chegada == null || partidaMin == null) return null;
    return horaDoMinuto(partidaMin + chegada / 60);
  };
  const atribuicoesValidas = ordem.filter((c) => {
    const veiculo = atribuicao[c];
    return veiculo != null && selecionados.includes(veiculo);
  });
  const coberturaCompleta = atribuicoesValidas.length === rota.paradas.length;
  // A distribuição mudou? Compara a assinatura (veículo → motorista → paradas,
  // na ordem da lista) com a versão ativa. Só assim o botão de confirmar diz a
  // verdade: salvar de novo a mesma coisa criaria uma versão vazia no histórico.
  const assinaturaDe = (veiculos: { veiculo_id: string | null; motorista_id?: string | null; paradas: string[] }[]) =>
    [...veiculos]
      .sort((a, b) => (a.veiculo_id ?? "").localeCompare(b.veiculo_id ?? ""))
      .map(
        (v) =>
          `${v.veiculo_id ?? ""}:${v.motorista_id ?? ""}:${v.paradas.join(",")}`,
      )
      .join("|");
  const assinaturaAtual = assinaturaDe(
    selecionados.map((id) => ({
      veiculo_id: id,
      motorista_id: motoristaPorVeiculo[id] ?? null,
      paradas: ordem.filter((c) => atribuicao[c] === id),
    })),
  );
  const assinaturaSalva = assinaturaDe(rota.distribuicao?.veiculos ?? []);
  const saidaSalva = rota.carga.saida_prevista?.slice(0, 5) ?? "";
  const distribuicaoMudou = assinaturaAtual !== assinaturaSalva || saida !== saidaSalva;
  // Linha por veículo: só da distribuição CONFIRMADA/proposta e só enquanto a
  // ordem não foi mexida à mão — geometria antiga com sequência nova é mentira.
  const rotasMapa =
    !ordemMudou && proposta === null
      ? (distribuicaoExibida?.veiculos ?? [])
          .filter((v) => v.veiculo_id && (v.geometria?.length ?? 0) > 1)
          .map((v) => ({
            veiculo_id: v.veiculo_id as string,
            cor: corDoVeiculo(v.veiculo_id),
            geometria: v.geometria as number[][],
          }))
      : [];

  const primeiraPendente = (() => {
    for (const p of paradasOrdenadas) {
      if (p.pedidos.some((x) => ["na_carga", "em_rota", "em_atendimento"].includes(x.status))) return p.chave;
    }
    return null;
  })();

  const pontosMapa: PontoParadaMapa[] = paradasOrdenadas.map((p, i) => {
    const sts = p.pedidos.map((x) => x.status);
    const estado = sts.every((s) => s === "entregue")
      ? "entregue"
      : sts.some((s) => s === "devolvido")
        ? "problema"
        : sts.some((s) => s === "em_atendimento")
          ? "atendimento"
          : p.chave === primeiraPendente
            ? "proxima"
            : "pendente";
    return {
      chave: p.chave,
      cliente: p.cliente,
      contact_id: p.contact_id,
      endereco: p.endereco,
      fone: p.fone,
      lat: p.latitude,
      lng: p.longitude,
      ordem: i + 1,
      estado,
      pedidos: p.pedidos,
      veiculoRotulo: rotuloDoVeiculo(atribuicao[p.chave]),
    };
  });

  const geometria = proposta?.geometria ?? rota.carga.rota_geojson?.geometria ?? [];
  const modoSalvo = rota.carga.rota_geojson?.modo ?? null;
  const provedorRota = proposta ? { nome: proposta.provedor, ruas: proposta.ruas } : rota.carga.rota_geojson ? { nome: rota.carga.rota_geojson.provedor ?? "?", ruas: rota.carga.rota_geojson.ruas ?? false } : null;
  const modoEfetivo = proposta?.modo ?? modoSalvo;
  const distanciaM = proposta?.distancia_m ?? rota.carga.distancia_m;
  const duracaoTotalS = proposta ? proposta.duracao_total_s : rota.carga.duracao_s != null ? rota.carga.duracao_s + paradasOrdenadas.length * rota.carga.tempo_parada_min * 60 : null;

  // Realizado do rastro (haversine + ponta a ponta) — só com dado suficiente.
  let realizado: { km: string; tempo: string } | null = null;
  if (rastro.length >= 2) {
    let m = 0;
    for (let i = 1; i < rastro.length; i++) m += haversineM({ lat: rastro[i - 1]![0], lng: rastro[i - 1]![1] }, { lat: rastro[i]![0], lng: rastro[i]![1] });
    realizado = { km: formatarDistancia(m), tempo: "—" };
  }
  const tempoRealizado =
    rota.carga.started_at && (rota.carga.finished_at || rastro.length > 0)
      ? Math.round((new Date(rota.carga.finished_at ?? new Date().toISOString()).getTime() - new Date(rota.carga.started_at).getTime()) / 1000)
      : null;
  if (realizado && tempoRealizado != null) realizado = { ...realizado, tempo: formatarDuracao(tempoRealizado) };

  /**
   * Localiza os endereços desta carga no servidor, lote a lote.
   *
   * Devolve quantas paradas FICARAM com coordenada — é esse número que o
   * cálculo da ordem usa para decidir se pode continuar. Devolver `void`
   * obrigava quem chama a reler o render anterior, que ainda não tinha as
   * coordenadas recém-gravadas.
   *
   * `rotulo` é o estado de "trabalhando" a manter enquanto roda: chamado de
   * dentro do cálculo da ordem ele é `"otimizar"`, para os botões não voltarem
   * a ficar clicáveis no meio da operação.
   */
  async function geocodificarTudo(rotulo = "geo", contactIds?: string[]): Promise<number> {
    setTrabalhando(rotulo);
    setProgressoGeo(t("Localizando…"));
    let localizadas = 0;
    let semResultado = 0;
    let ultima: RotaCarregada | null = null;
    try {
      for (;;) {
        const corpo = await apiClient.post<{ data: { estados: { estado: string }[]; restantes: number } }>(
          `/api/v1/shipments/${cargaId}/rota/geocodificar`,
          // `contact_ids` só vai quando é uma parada específica ("Tentar de
          // novo" num pino aproximado): é o que autoriza regeocodificar quem
          // já tem coordenada, sem varrer a carga inteira a cada clique.
          contactIds ? { contact_ids: contactIds } : {},
          // Até 8 consultas por contato (rua → CEP → município) × 1,1s de
          // ritmo justo, em lote de 10: a chamada passa fácil dos 60s. O
          // timeout padrão de 10s abortava justamente as paradas difíceis —
          // as que precisam do fallback —, e o retry do cliente disparava
          // requisições sobrepostas.
          { timeoutMs: 180_000 },
        );
        const d = corpo.data;
        localizadas += d.estados.filter((e) => e.estado === "ok").length;
        semResultado += d.estados.filter((e) => e.estado !== "ok").length;
        setProgressoGeo(
          d.restantes > 0 ? t(`Faltam ${d.restantes}…`) : t("Pronto."),
        );
        ultima = (await recarregar()) ?? ultima;
        // Um lote sem estado nenhum não é "faltam N": é a rota sem alvo (sem
        // endereço ou contato fora do alcance). Sem esta saída, `restantes > 0`
        // com `estados` vazio girava para sempre.
        if (d.restantes <= 0 || d.estados.length === 0) break;
      }
      const paradas = ultima?.paradas ?? [];
      const noMapa = paradas.filter((p) => p.latitude != null && p.longitude != null).length;
      if (localizadas > 0 && semResultado === 0) {
        toast.success(`${localizadas} ${t("parada(s) localizada(s) no mapa.")}`);
      } else if (localizadas > 0) {
        toast.warning(
          `${localizadas} ${t("localizada(s)")}, ${semResultado} ${t("sem resultado. Corrija o endereço ou marque no mapa.")}`,
        );
      } else if (semResultado > 0) {
        // O toast antigo dizia "Geocodificação concluída" mesmo quando nada foi
        // encontrado — o operador clicava, nada mudava e parecia botão morto.
        toast.warning(t("Nenhuma parada localizada. Corrija o endereço ou marque no mapa."));
      } else {
        toast.info(
          noMapa < paradas.length
            ? t("As paradas desta carga estão sem endereço. Corrija o cadastro ou marque no mapa.")
            : t("Todas as paradas desta carga já estão no mapa."),
        );
      }
      return noMapa;
    } catch (e) {
      showApiError(e);
      return ultima?.paradas.filter((p) => p.latitude != null && p.longitude != null).length ?? 0;
    } finally {
      setTrabalhando(null);
      setProgressoGeo(null);
    }
  }

  async function otimizar(modoEscolhido: "tsp" | "distancia") {
    if (
      ordemMudou &&
      !(await confirmar({
        title: t("A ordem manual será substituída pela otimizada. Reotimizar mesmo assim?"),
        confirmLabel: t("Reotimizar"),
      }))
    )
      return;
    if (
      rota?.carga.status === "em_rota" &&
      !(await confirmar({
        title: t("A rota está em andamento — o motorista verá a nova sequência. Reotimizar mesmo assim?"),
        confirmLabel: t("Reotimizar"),
      }))
    )
      return;
    setTrabalhando("otimizar");
    try {
      // SEM NENHUMA PARADA NO MAPA, o clique não pode morrer. Era o que
      // acontecia: os dois botões nasciam desabilitados ("Otimizar desativado:
      // nenhuma parada localizada") e quem abria uma carga nova tinha de
      // descobrir sozinho que precisava clicar em "Geocodificar" antes — a
      // carga 22 chegou a 0 de 22 localizadas sem que o cálculo explicasse
      // por quê. Agora o cálculo localiza primeiro, com progresso, e só
      // desiste com o motivo escrito.
      if (comCoord.length === 0) {
        const noMapa = await geocodificarTudo("otimizar");
        if (noMapa === 0) {
          toast.error(
            t("Nenhuma parada localizada — sem endereço não há ordem. Corrija o cadastro ou marque no mapa."),
          );
          return;
        }
        // O `finally` da localização devolve o estado; o cálculo continua
        // ocupado até responder, senão o botão reabre no meio da operação.
        setTrabalhando("otimizar");
      }
      // Minha posição como origem: resolve o GPS antes de pedir a proposta.
      let origem: { endereco: string } | { latitude: number; longitude: number } | null = null;
      const txt = origemTexto.trim();
      if (txt === "@gps") {
        // GPS é conveniência, não caminho único. Se o navegador negar a
        // permissão (ou não houver sinal), a tela volta para o campo de texto
        // com a mensagem certa: digitar o endereço continua valendo.
        try {
          const pos = await new Promise<GeolocationPosition>((ok, falha) =>
            navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 10000 }),
          );
          origem = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          setOrigemTexto(rota?.carga.origem_endereco ?? "");
          toast.error(t("Não consegui pegar sua posição. Digite o endereço da origem."));
          return;
        }
      } else if (txt) {
        origem = { endereco: txt };
      }
      const corpo = await apiClient.post<{ data: PropostaRota }>(`/api/v1/shipments/${cargaId}/rota/otimizar`, {
        origem,
        retornar_origem: retornar,
        tempo_parada_min: tempoParada,
        modo: modoEscolhido,
      });
      const p = corpo.data;
      setProposta(p);
      // A proposta só traz as paradas COM coordenada. Jogar fora as demais
      // sumia com elas da lista e fazia o "Salvar ordem" ser recusado ("a
      // ordem precisa cobrir todas as paradas"): elas vão para o fim, que é
      // onde a operação as trata — sem mapa, rota manual.
      setOrdem(ordemCompleta(p.ordem, p.nao_roteirizaveis));
      if (!p.ruas) toast.warning(t("Serviço de ruas fora do ar — ordem aproximada (linha reta ×1,3)."));
      else toast.success(t("Rota otimizada. Confira e salve."));
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function salvarOrdem() {
    setTrabalhando("salvar");
    try {
      const corpo = await apiClient.patch<{ data: RotaCarregada }>(`/api/v1/shipments/${cargaId}/rota/ordem`, {
        ordem,
        ...(proposta
          ? {
              distancia_m: proposta.distancia_m,
              duracao_s: proposta.duracao_dirigindo_s,
              geometria: proposta.geometria,
              provedor: proposta.provedor,
              ruas: proposta.ruas,
              modo: proposta.modo,
              ...(proposta.origem
                ? {
                    origem_endereco: proposta.origem.endereco,
                    origem_lat: proposta.origem.lat,
                    origem_lng: proposta.origem.lng,
                  }
                : {}),
              retornar_origem: proposta.retornar_origem,
              tempo_parada_min: proposta.tempo_parada_min,
            }
          : { retornar_origem: retornar, tempo_parada_min: tempoParada }),
      });
      setRota(corpo.data);
      setProposta(null);
      toast.success(t("Rota salva."));
      aoMudar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  /**
   * OTIMIZAÇÃO MULTI-VEÍCULO — OR-Tools de verdade no serviço Python.
   *
   * Diferente de `otimizar()`, que resolve a ordem de UM caminhão, esta rota
   * distribui as paradas entre os veículos escolhidos respeitando capacidade e
   * jornada. O resultado NÃO é salvo automaticamente: vira proposta para o
   * operador revisar e confirmar (`confirmarDistribuicao`).
   */
  async function otimizarMulti() {
    if (selecionados.length === 0) {
      toast.error(t("Escolha ao menos um veículo da frota."));
      return;
    }
    if (ordemMudou && !(await confirmar({ title: t("A ordem manual será substituída pela distribuição. Continuar?"), confirmLabel: t("Distribuir") }))) return;
    if (rota?.carga.status === "em_rota" && !(await confirmar({ title: t("A rota está em andamento — o motorista verá a nova sequência. Reotimizar mesmo assim?"), confirmLabel: t("Reotimizar") }))) return;
    setTrabalhando("multi");
    try {
      if (comCoord.length === 0) {
        const noMapa = await geocodificarTudo("multi");
        if (noMapa === 0) {
          toast.error(t("Nenhuma parada localizada — sem endereço não há distribuição."));
          return;
        }
        setTrabalhando("multi");
      }
      let origem: { endereco: string } | { latitude: number; longitude: number } | null = null;
      const txt = origemTexto.trim();
      if (txt === "@gps") {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, falha) =>
            navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 10000 }),
          );
          origem = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          toast.error(t("Não consegui pegar sua posição. Digite o endereço da origem."));
          return;
        }
      } else if (txt) {
        origem = { endereco: txt };
      }

      const corpo = await apiClient.post<{ data: PropostaMulti }>(
        `/api/v1/shipments/${cargaId}/rota/otimizar/veiculos`,
        {
          origem,
          retornar_origem: retornar,
          tempo_parada_min: tempoParada,
          // Sem a hora de saída a janela do cliente não vira restrição. Vai no
          // corpo e não espera a confirmação para valer: o operador escolhe a
          // hora e vê o efeito no ETA ANTES de gravar.
          ...(saida ? { saida_prevista: saida } : {}),
          max_veiculos: selecionados.length,
          veiculos: selecionados.map((id) => ({
            veiculo_id: id,
            ...(motoristaPorVeiculo[id] ? { motorista_id: motoristaPorVeiculo[id] } : {}),
          })),
        },
        // O solver tem limite de busca próprio; o timeout de 10s do cliente
        // abortaria a chamada no meio e o retry rodaria dois solvers.
        { timeoutMs: 90_000 },
      );
      const p = corpo.data;
      setPropostaMulti(p);
      setSaida(p.saida_prevista?.slice(0, 5) ?? "");

      const mapa: Record<string, string> = {};
      const sequencia: string[] = [];
      for (const v of p.veiculos) {
        if (!v.veiculo_id) continue;
        for (const chave of v.paradas) {
          mapa[chave] = v.veiculo_id;
          sequencia.push(chave);
        }
      }
      // Parada sem coordenada não fica órfã: entra no fim, no primeiro veículo.
      for (const parada of p.nao_roteirizaveis) {
        if (!mapa[parada.chave]) {
          mapa[parada.chave] = selecionados[0] as string;
          sequencia.push(parada.chave);
        }
      }
      for (const parada of rota?.paradas ?? []) {
        if (!sequencia.includes(parada.chave)) {
          mapa[parada.chave] = selecionados[0] as string;
          sequencia.push(parada.chave);
        }
      }
      setAtribuicao(mapa);
      setOrdem(sequencia);
      setProposta(null);
      if (p.restricoes_nao_aplicadas.length > 0) {
        toast.warning(t("Distribuição pronta, com restrições não aplicadas: veja o painel."));
      } else {
        toast.success(t("Distribuição pronta. Revise e confirme."));
      }
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  /**
   * CONFIRMA a distribuição — grava a versão, a atribuição e o ETA.
   *
   * Revalida no servidor (capacidade, cobertura, versão). Aqui só montamos o
   * que a tela mostra; o servidor é quem decide o que cabe e quem vence a
   * corrida entre duas telas.
   */
  async function confirmarDistribuicao() {
    if (!rota) return;
    const veiculos = selecionados
      .map((id) => {
        const paradasDoVeiculo = ordem.filter((c) => atribuicao[c] === id);
        const propostaDoVeiculo = propostaMulti?.veiculos.find((v) => v.veiculo_id === id);
        const salvaDoVeiculo = rota.distribuicao?.veiculos.find((v) => v.veiculo_id === id);
        const base = propostaDoVeiculo ?? salvaDoVeiculo;
        // ETA só vale para a sequência que o solver calculou. Reordenar à mão
        // invalidaria chegada/distância — melhor não gravar do que gravar errado.
        const sequenciaIntacta =
          !!base &&
          base.paradas.length === paradasDoVeiculo.length &&
          base.paradas.every((c, i) => c === paradasDoVeiculo[i]);
        return {
          veiculo_id: id,
          motorista_id: motoristaPorVeiculo[id] ?? null,
          paradas: paradasDoVeiculo,
          ...(sequenciaIntacta && base?.chegadas_s
            ? { chegadas_s: base.chegadas_s }
            : {}),
          distancia_m: sequenciaIntacta ? (base?.distancia_m ?? null) : null,
          duracao_s: sequenciaIntacta ? (base?.duracao_s ?? null) : null,
          ...(sequenciaIntacta && base?.geometria ? { geometria: base.geometria } : {}),
        };
      })
      .filter((v) => v.paradas.length > 0);

    if (veiculos.length === 0) {
      toast.error(t("Nenhuma parada atribuída a um veículo."));
      return;
    }
    if (!coberturaCompleta) {
      toast.error(t("Toda parada precisa estar atribuída a um veículo selecionado."));
      return;
    }

    const metricasCompletas = veiculos.every((v) => v.duracao_s != null && v.distancia_m != null);
    const distanciaTotal = metricasCompletas
      ? veiculos.reduce((soma, v) => soma + (v.distancia_m ?? 0), 0)
      : null;
    const duracaoTotal = metricasCompletas
      ? veiculos.reduce((soma, v) => soma + (v.duracao_s ?? 0), 0)
      : null;

    setTrabalhando("distribuir");
    try {
      await apiClient.patch(`/api/v1/shipments/${cargaId}/rota/distribuicao`, {
        versao_base: rota.carga.rota_versao,
        veiculos,
        algoritmo: propostaMulti?.versao_algoritmo ?? "confirmacao-manual",
        ...(propostaMulti ? { tempo_execucao_ms: propostaMulti.tempo_execucao_ms } : {}),
        distancia_m: distanciaTotal,
        duracao_s: duracaoTotal,
        saida_prevista: saida || null,
        restricoes_nao_aplicadas: propostaMulti?.restricoes_nao_aplicadas ?? [],
      });
      toast.success(t("Distribuição confirmada e gravada."));
      setPropostaMulti(null);
      await recarregar();
      aoMudar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  function alternarVeiculo(id: string) {
    setSelecionados((atual) => {
      if (atual.includes(id)) {
        const restantes = atual.filter((x) => x !== id);
        // Parada de veículo retirado não fica sem dono calado: vai para o
        // primeiro que permaneceu, e o operador vê a mudança na lista.
        if (restantes.length > 0) {
          setAtribuicao((mapa) => {
            const novo = { ...mapa };
            for (const [chave, veiculo] of Object.entries(novo)) {
              if (veiculo === id) novo[chave] = restantes[0] as string;
            }
            return novo;
          });
        }
        return restantes;
      }
      return [...atual, id];
    });
  }

  function moverParadaPara(chave: string, veiculoId: string) {
    setAtribuicao((mapa) => ({ ...mapa, [chave]: veiculoId }));
  }

  function mover(chave: string, dir: -1 | 1) {
    setOrdem((atual) => {
      const i = atual.indexOf(chave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return copia;
    });
    setProposta(null);
  }

  function alternarMarcar(contactId: string) {
    setMarcarPara((atual) => (atual === contactId ? null : contactId));
    setPinoPendente(null);
  }

  function usarMinhaPosicao() {
    if (!("geolocation" in navigator)) {
      toast.error(t("GPS indisponível neste aparelho."));
      return;
    }
    setOrigemTexto("@gps");
    toast.success(t("Origem = sua posição atual (resolve ao otimizar)."));
  }

  async function confirmarPino() {
    if (!marcarPara || !pinoPendente) return;
    setTrabalhando("pino");
    try {
      await apiClient.post(`/api/v1/shipments/${cargaId}/rota/manual`, {
        contact_id: marcarPara,
        latitude: Number(pinoPendente.lat.toFixed(6)),
        longitude: Number(pinoPendente.lng.toFixed(6)),
      });
      toast.success(t("Posição fixada."));
      setMarcarPara(null);
      setPinoPendente(null);
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  function cancelarPino() {
    setMarcarPara(null);
    setPinoPendente(null);
  }

  async function acaoParada(chave: string, acao: "cheguei" | "entregue") {
    if (!rota) return;
    const parada = rota.paradas.find((p) => p.chave === chave);
    const alvo = parada?.pedidos.find((x) => ["na_carga", "em_rota", "em_atendimento"].includes(x.status));
    if (!alvo) return;
    try {
      let geo: { latitude?: number; longitude?: number } = {};
      if (acao === "entregue" && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, falha) =>
            navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 8000 }),
          );
          geo = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          // Sem GPS, a entrega vale igual — só sem coordenada.
        }
      }
      await apiClient.patch(`/api/v1/shipments/${cargaId}/orders/${alvo.order_id}`, {
        status: acao === "cheguei" ? "em_atendimento" : "entregue",
        ...geo,
      });
      toast.success(acao === "cheguei" ? t("Em atendimento.") : t("Entregue."));
      await recarregar();
      aoMudar();
    } catch (e) {
      showApiError(e);
    }
  }

  const origemMapa =
    (proposta?.origem ?? (rota.carga.origem_lat != null && rota.carga.origem_lng != null
      ? { lat: rota.carga.origem_lat, lng: rota.carga.origem_lng, endereco: rota.carga.origem_endereco }
      : null));

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da seção ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("Rota")}
          </p>
          <h2 className="text-base font-medium text-text">{t("Mapa e ordem de entrega")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("A ordem da lista é a ordem da rua. Use as setas para ajustar.")}
          </p>
        </div>
        <Badge variant={provedorRota?.ruas ? "success" : provedorRota ? "warning" : "neutral"}>
          {provedorRota
            ? provedorRota.ruas
              ? t("Pelas ruas")
              : t("Ordem aproximada")
            : t("Sem rota calculada")}
        </Badge>
      </div>

      {/* ── As três áreas da expedição: esquerda (pedidos/cargas), centro
          (mapa) e direita (planejamento). O mapa é a maior área do centro, e os
          números que importam ficam sobre ele, para não haver uma faixa de
          cartões entre a pessoa e o desenho da rota. */}
      <div className="grid items-start gap-4 grid-cols-1 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,360px)]">
        {/* ── ÁREA CENTRAL — mapa (a maior área do centro) ── */}
        <div className="min-w-0 xl:order-2">
        <MapaRota
          altura="min(46vh, 430px)"
          paradas={pontosMapa}
          geometria={geometria}
          rotas={rotasMapa}
          origem={origemMapa}
          motorista={motorista}
          rastro={rastro}
          modoMarcar={marcarPara !== null}
          pinoPendente={pinoPendente}
          aoClicarMapa={(lat, lng) => {
            if (marcarPara) setPinoPendente({ lat, lng });
          }}
          aoAcaoParada={(chave, acao) => void acaoParada(chave, acao)}
          sobreposicao={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                <strong className="tabular-nums">{paradasOrdenadas.length}</strong>
                {paradasOrdenadas.length === 1 ? t("entrega") : t("entregas")}
                <span className="text-muted-foreground">
                  · {totalClientes} {totalClientes === 1 ? t("cliente") : t("clientes")}
                </span>
              </span>
              {/* Sem rota calculada, "Distância —" e "Tempo —" ocupam o mapa
                  para não dizer nada. O selo do cabeçalho já informa que a rota
                  não foi calculada; aqui só entra o que tem número. */}
              {distanciaM != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                  <span className="text-muted-foreground">{t("Distância")}</span>
                  <strong className="tabular-nums">{formatarDistancia(distanciaM)}</strong>
                </span>
              )}
              {duracaoTotalS != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur">
                  <span className="text-muted-foreground">{t("Tempo")}</span>
                  <strong className="tabular-nums">{formatarDuracao(duracaoTotalS)}</strong>
                </span>
              )}
              <span className="hidden items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 text-[11px] font-medium text-text shadow-xs backdrop-blur sm:inline-flex">
                <span className="text-muted-foreground">{t("Mercadorias")}</span>
                <strong className="tabular-nums">{comoMoeda(valorTotal, "BRL")}</strong>
              </span>
            </>
          }
        />

        {marcarPara && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-bg p-2.5 text-sm text-warning-fg">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {pinoPendente
                ? t("Alfinete no lugar? Confirme para valer.")
                : t("Clique no mapa para soltar o alfinete.")}
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                size="sm"
                onClick={() => void confirmarPino()}
                disabled={!pinoPendente || trabalhando !== null}
              >
                {t("Confirmar posição")}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelarPino}>
                {t("Cancelar")}
              </Button>
            </span>
          </div>
        )}

        {/* Legenda do que o mapa está desenhando + planejado × realizado.
            Sem rota calculada a linha não aparece: o selo do cabeçalho já diz
            "Sem rota calculada" e dizia a mesma coisa duas vezes. */}
        {(provedorRota || realizado) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
            {provedorRota && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    provedorRota.ruas ? "bg-success" : "bg-warning",
                  )}
                />
                {provedorRota.ruas
                  ? t("Pelas ruas (OSRM)")
                  : t("Aproximado — sem serviço de ruas")}
                {modoEfetivo
                  ? ` · ${modoEfetivo === "distancia" ? t("por distância entre as paradas") : t("caminho mais curto")}`
                  : ""}
              </span>
            )}
            {realizado && (
              <span className={cn(provedorRota && "sm:ml-auto")}>
                {t("Realizado")}{" "}
                <strong className="font-medium text-text tabular-nums">
                  {realizado.km} · {realizado.tempo}
                </strong>
                {distanciaM != null && (
                  <>
                    {" · "}
                    {t("vs planejado")} {formatarDistancia(distanciaM)}
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

        {/* ── ÁREA DIREITA — planejamento ────────────────────────────── */}
        {editavel && (
          <Card className="min-w-0 overflow-hidden p-0 xl:order-3">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Planejamento")}
                </p>
                <p className="text-sm font-medium text-text">{t("Planejar rota")}</p>
              </div>
              <Badge variant={proposta ? "info" : "neutral"}>
                {proposta ? t("Não salva") : t("Salva")}
              </Badge>
            </header>

            <ol className="divide-y divide-border">
              {/* 1 — de onde a rota sai */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={1} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label
                    htmlFor="rota-origem"
                    className="block text-xs font-medium text-text"
                  >
                    {t("Origem da rota")}
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <Input
                      id="rota-origem"
                      className="h-9"
                      value={origemTexto}
                      onChange={(e) => setOrigemTexto(e.target.value)}
                      placeholder={t("Ex.: Rua Antônio Liller, 585, Canoinhas")}
                    />
                    {/* Empilhado, não lado a lado: na coluna de 340px o botão
                        comia o campo e o endereço aparecia cortado em
                        "Ex.: Rua Caetano Co…". */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={usarMinhaPosicao}
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {t("Minha posição")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-text-subtle">
                    {rota.carga.origem_endereco
                      ? t("Padrão: a sede da empresa. Pode digitar outro endereço.")
                      : t("Vazio começa na primeira entrega.")}
                  </p>
                </div>
              </li>

              {/* 2 — o cálculo */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={2} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-medium text-text">{t("Calcular a ordem")}</p>
                  <div className="grid gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void otimizar("distancia")}
                      disabled={trabalhando !== null || paradasOrdenadas.length === 0}
                    >
                      {trabalhando === "otimizar" ? t("Calculando…") : t("Ordenar por distância")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void otimizar("tsp")}
                      disabled={trabalhando !== null || paradasOrdenadas.length === 0}
                    >
                      {t("Otimizar por ruas")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void geocodificarTudo()}
                      disabled={trabalhando !== null}
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {trabalhando === "geo" ? t("Localizando…") : t("Geocodificar")}
                    </Button>
                  </div>
                  {comCoord.length === 0 && paradasOrdenadas.length > 0 && (
                    <p className="text-[11px] text-text-subtle">
                      {t("Ainda sem parada no mapa: ao calcular, localizamos os endereços primeiro.")}
                    </p>
                  )}
                  {comCoord.length > 0 && semCoord.length > 0 && (
                    <p className="text-[11px] text-warning-fg">
                      {`${semCoord.length} ${t("parada(s) sem mapa ficam no fim da lista.")}`}
                    </p>
                  )}
                  {progressoGeo && (
                    <p className="text-[11px] text-muted-foreground">{progressoGeo}</p>
                  )}
                  {proposta && !proposta.ruas && (
                    <p className="text-[11px] text-warning-fg">
                      {t("Sem ruas no momento: ordem aproximada. Tente de novo mais tarde.")}
                    </p>
                  )}
                </div>
              </li>

              {/* 3 — ajustes e gravação */}
              <li className="flex gap-3 p-3.5">
                <Passo numero={3} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <p className="text-xs font-medium text-text">{t("Ajustes e gravação")}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-accent"
                        checked={retornar}
                        onChange={(e) => setRetornar(e.target.checked)}
                      />
                      {t("Retornar à origem")}
                    </label>
                    <label className="flex items-center gap-1.5">
                      {t("Parada")}
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={tempoParada}
                        onChange={(e) => setTempoParada(Number(e.target.value))}
                        className="h-7 w-14 rounded-md border border-border bg-surface px-1.5 text-center text-xs text-text tabular-nums"
                      />
                      {t("min")}
                    </label>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void salvarOrdem()}
                    disabled={trabalhando !== null || !(proposta || ordemMudou || configMudou)}
                  >
                    {trabalhando === "salvar" ? t("Salvando…") : t("Salvar ordem")}
                  </Button>
                  <p className="text-[11px] text-text-subtle">
                    {proposta || ordemMudou || configMudou
                      ? t("A ordem e os ajustes serão gravados na carga.")
                      : t("Nada mudou desde a última gravação.")}
                  </p>
                </div>
              </li>
            </ol>
          </Card>
        )}

        {/* ── Distribuição por veículo (F5 / VRPTW) ────────────────────────
            O passo que faltava: sem esta tela, a distribuição do OR-Tools
            morria na resposta HTTP. Aqui o operador escolhe QUEM participa,
            define a hora de saída, vê a sequência de cada veículo com ETA e
            confirma — e a confirmação grava uma versão imutável da rota. */}
        {editavel && frota !== null && (
          <Card className="min-w-0 overflow-hidden p-0 xl:order-3">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("Frota")}
                </p>
                <p className="text-sm font-medium text-text">{t("Distribuição por veículo")}</p>
              </div>
              <Badge
                variant={
                  propostaMulti ? "info" : rota.distribuicao ? "success" : "neutral"
                }
              >
                {propostaMulti
                  ? t("Proposta")
                  : rota.distribuicao
                    ? t("Confirmada")
                    : t("Não distribuída")}
              </Badge>
            </header>

            <div className="space-y-3 p-3.5">
              {veiculosAtivos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Nenhum veículo na frota. Sem placa e capacidade cadastradas, a carga continua saindo num veículo só.",
                  )}{" "}
                  <Link href="/app/frota" className="text-accent underline underline-offset-2">
                    {t("Cadastrar frota")}
                  </Link>
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {veiculosAtivos.map((v) => {
                      const marcado = selecionados.includes(v.id);
                      const paradasDoVeiculo = ordem.filter((c) => atribuicao[c] === v.id);
                      return (
                        <li
                          key={v.id}
                          className={cn(
                            "rounded-lg border p-2",
                            marcado ? "border-accent/40 bg-accent/5" : "border-border",
                          )}
                        >
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-accent"
                              checked={marcado}
                              onChange={() => alternarVeiculo(v.id)}
                            />
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: corDoVeiculo(v.id) }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-text">
                              {v.placa}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                              {paradasDoVeiculo.length}{" "}
                              {paradasDoVeiculo.length === 1 ? t("parada") : t("paradas")}
                            </span>
                          </label>

                          {marcado && (
                            <div className="mt-1.5 flex items-center gap-2 pl-6">
                              <select
                                aria-label={t("Motorista do veículo")}
                                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-1.5 text-[11px] text-text"
                                value={motoristaPorVeiculo[v.id] ?? ""}
                                onChange={(e) =>
                                  setMotoristaPorVeiculo((atual) => ({
                                    ...atual,
                                    [v.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">{t("Sem motorista definido")}</option>
                                {motoristasAtivos.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nome}
                                  </option>
                                ))}
                              </select>
                              <span className="shrink-0 text-[10px] text-text-subtle tabular-nums">
                                {v.capacidade_kg > 0 ? `${v.capacidade_kg} kg` : t("peso ?")}
                                {" · "}
                                {v.capacidade_m3 > 0 ? `${v.capacidade_m3} m³` : t("volume ?")}
                              </span>
                            </div>
                          )}

                          {marcado && paradasDoVeiculo.length > 0 && (
                            <ol className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 pl-6 text-[11px]">
                              {paradasDoVeiculo.map((chave, i) => {
                                const parada = rota.paradas.find((x) => x.chave === chave);
                                const chegada = horaDeChegada(chave);
                                return (
                                  <li key={chave} className="flex items-baseline gap-1.5">
                                    <span className="shrink-0 text-muted-foreground tabular-nums">
                                      {i + 1}.
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-text">
                                      {parada?.cliente ?? chave}
                                    </span>
                                    {chegada && (
                                      <span className="shrink-0 text-text-subtle tabular-nums">
                                        {chegada}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <label className="flex items-center gap-2 text-xs text-text">
                    <span className="shrink-0">{t("Saída prevista")}</span>
                    <input
                      type="time"
                      value={saida}
                      onChange={(e) => setSaida(e.target.value)}
                      className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text tabular-nums"
                    />
                  </label>
                  <p className="text-[11px] text-text-subtle">
                    {saida
                      ? t("É a hora que transforma a janela do cliente e o ETA em horário.")
                      : t("Sem hora de saída a janela de entrega não é aplicada — o solver declara.")}
                  </p>

                  <div className="grid gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void otimizarMulti()}
                      disabled={
                        trabalhando !== null ||
                        selecionados.length === 0 ||
                        paradasOrdenadas.length === 0
                      }
                    >
                      {trabalhando === "multi" ? t("Distribuindo…") : t("Distribuir com OR-Tools")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void confirmarDistribuicao()}
                      disabled={
                        trabalhando !== null || !coberturaCompleta || !distribuicaoMudou
                      }
                    >
                      {trabalhando === "distribuir"
                        ? t("Gravando…")
                        : t("Confirmar distribuição")}
                    </Button>
                  </div>

                  {!coberturaCompleta && (
                    <p className="text-[11px] text-warning-fg">
                      {`${rota.paradas.length - atribuicoesValidas.length} ${t(
                        "parada(s) sem veículo — toda parada precisa de um veículo selecionado.",
                      )}`}
                    </p>
                  )}

                  {propostaMulti && propostaMulti.restricoes_nao_aplicadas.length > 0 && (
                    <div className="rounded-lg border border-warning/40 bg-warning-bg p-2">
                      <p className="text-[11px] font-medium text-warning-fg">
                        {t("Restrições que não foram aplicadas")}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-warning-fg">
                        {propostaMulti.restricoes_nao_aplicadas.map((codigo) => (
                          <li key={codigo}>{t(ROTULO_RESTRICAO[codigo] ?? codigo)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {propostaMulti && propostaMulti.entregas_nao_alocadas.length > 0 && (
                    <p className="text-[11px] text-warning-fg">
                      {`${propostaMulti.entregas_nao_alocadas.length} ${t(
                        "entrega(s) não couberam na frota escolhida.",
                      )}`}
                    </p>
                  )}

                  {(rota.historico_rotas?.length ?? 0) > 0 && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer select-none">
                        {t("Histórico de rotas")} ({rota.historico_rotas?.length})
                      </summary>
                      <ul className="mt-1.5 space-y-0.5">
                        {(rota.historico_rotas ?? []).map((h) => (
                          <li key={h.id} className="flex items-baseline gap-1.5">
                            <span className="tabular-nums">{`v${h.versao}`}</span>
                            {h.ativa && <Badge variant="success">{t("Ativa")}</Badge>}
                            <span className="min-w-0 flex-1 truncate">
                              {new Date(h.criado_em).toLocaleString(tagDeIdioma, {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {h.distancia_m != null ? formatarDistancia(h.distancia_m) : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {/* ── A ordem de entrega ────────────────────────────────────────── */}
        <Card className="min-w-0 overflow-hidden p-0 xl:order-1">
          <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border px-3.5 py-2.5">
            <p className="text-sm font-medium text-text">
              {t("Ordem de entrega")}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                ({paradasOrdenadas.length})
              </span>
            </p>
            <p className="text-[11px] text-text-subtle">{t("A ordem da lista é a ordem da rua.")}</p>
          </header>

          <ol className="divide-y divide-border">
            {paradasOrdenadas.map((p, i) => (
              <li key={p.chave} className="flex items-start gap-2.5 px-3.5 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    i === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-label={`${t("Parada")} ${i + 1}`}
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {p.cliente}
                    </p>
                    <p className="shrink-0 text-xs font-medium text-text tabular-nums">
                      {comoMoeda(p.total_cents, "BRL")}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {p.pedidos.map((x) => numeroDoPedido(x.numero)).join(" · ")}
                  </p>

                  {/* O ENDEREÇO DA PARADA, na lista.
                      Ele existia só no balão do mapa: quem lia a ordem para
                      separar/entregar via o cliente e o número do pedido, e
                      nada de rua. O `endereco` do backend é o do PEDIDO quando
                      ele tem um, senão o do cadastro — nunca um ponto
                      inventado; quando não há nenhum, a linha diz o que fazer
                      em vez de ficar vazia. */}
                  <p
                    className={cn(
                      "truncate text-[11px]",
                      p.endereco ? "text-text-subtle" : "text-warning-fg",
                    )}
                    title={p.endereco ?? undefined}
                  >
                    {p.endereco ?? t("Sem endereço — corrija o cadastro ou marque no mapa.")}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {rotuloDoVeiculo(atribuicao[p.chave]) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium text-text">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: corDoVeiculo(atribuicao[p.chave] ?? null) }}
                        />
                        {rotuloDoVeiculo(atribuicao[p.chave])}
                      </span>
                    )}
                    {horaDeChegada(p.chave) && (
                      <span className="inline-flex items-center gap-1 text-text-subtle tabular-nums">
                        {t("chegada")} {horaDeChegada(p.chave)}
                      </span>
                    )}
                    {editavel && selecionados.length > 0 && (
                      <select
                        aria-label={t("Veículo da parada")}
                        className="h-6 max-w-[9rem] rounded-md border border-border bg-surface px-1 text-[11px] text-text"
                        value={atribuicao[p.chave] ?? ""}
                        onChange={(e) => moverParadaPara(p.chave, e.target.value)}
                      >
                        <option value="">{t("Sem veículo")}</option>
                        {selecionados.map((id) => (
                          <option key={id} value={id}>
                            {rotuloDoVeiculo(id) ?? id}
                          </option>
                        ))}
                      </select>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        p.geo_status === "ok"
                          ? "text-success-fg"
                          : p.geo_status === "pendente"
                            ? "text-text-subtle"
                            : "text-warning-fg",
                      )}
                    >
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {ROTULO_GEO[p.geo_status] ?? p.geo_status}
                      {p.geo_status === "ok" && APROXIMADO_POR_FONTE[p.geo_fonte ?? ""]
                        ? ` ${t(APROXIMADO_POR_FONTE[p.geo_fonte ?? ""] as string)}`
                        : ""}
                    </span>
                    {podeOperar && p.contact_id && (
                      <>
                        {(p.geo_status !== "ok" ||
                          p.geo_fonte === "nominatim:bairro" ||
                          p.geo_fonte === "nominatim:cidade") && (
                          <button
                            type="button"
                            className="text-muted-foreground underline underline-offset-2 hover:text-text"
                            onClick={() => void geocodificarTudo("geo", [p.contact_id as string])}
                          >
                            {t("Tentar de novo")}
                          </button>
                        )}
                        {/* Ponto aproximado também se corrige à mão: no endereço
                            rural o pino de cidade é só o começo, e o motorista
                            marca a porteira. Antes o "Marcar no mapa" sumia
                            justamente quando o pino estava no lugar errado. */}
                        {(p.geo_status !== "ok" || p.geo_fonte === "nominatim:cidade") && (
                          <button
                            type="button"
                            className="text-muted-foreground underline underline-offset-2 hover:text-text"
                            onClick={() => alternarMarcar(p.contact_id as string)}
                          >
                            {marcarPara === p.contact_id ? t("Cancelar marcação") : t("Marcar no mapa")}
                          </button>
                        )}
                        {(p.geo_status !== "ok" || p.geo_fonte === "nominatim:cidade") && (
                          <Link
                            href={`/app/contacts/${p.contact_id}`}
                            className="text-muted-foreground underline underline-offset-2 hover:text-text"
                          >
                            {t("Corrigir endereço")}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {editavel && (
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => mover(p.chave, -1)}
                      disabled={i === 0}
                      aria-label={t("Subir")}
                    >
                      <CaretUp className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => mover(p.chave, 1)}
                      disabled={i === paradasOrdenadas.length - 1}
                      aria-label={t("Descer")}
                    >
                      <CaretDown className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {semCoord.length > 0 && (
            <p className="border-t border-border bg-warning-bg px-3.5 py-2 text-xs text-warning-fg">
              {semCoord.length}{" "}
              {semCoord.length === 1
                ? t("parada fora do cálculo — sem localização.")
                : t("paradas fora do cálculo — sem localização.")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Círculo numerado do planejador — a etapa em que a pessoa está. */
function Passo({ numero }: { numero: number }) {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
    >
      {numero}
    </span>
  );
}

