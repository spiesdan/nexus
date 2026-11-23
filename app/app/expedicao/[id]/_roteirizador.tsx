"use client";

import * as React from "react";
import Link from "next/link";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { mensagemDeErro } from "@/lib/ui/erros";
import { diferencaDaOrdem } from "@/lib/rotas/diferenca-da-ordem";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import {
  FONTE_ENTRADA,
  FONTE_MANUAL,
  precisaDeEntrada,
  situacaoDoNumero,
} from "@/lib/rotas/entradas";
import { horaDoMinuto, minutosDoDia } from "@/lib/rotas/janelas";
import { estadoDaPublicacao } from "@/lib/rotas/publicacao";
import {
  formatarDistancia,
  formatarDuracao,
  haversineM,
  ordemCompleta,
} from "@/lib/rotas/roteamento";
import { createClient } from "@/lib/supabase/browser";
import { ArrowRight, CaretDown, CaretUp, MapPin, PaperPlaneTilt } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MapaRota, type PontoParadaMapa } from "./_mapa-rota";
import { estadoDoGps } from "@/lib/rotas/gps-estado";
import { PainelRecuperacao } from "./_recuperacao";

export interface ParadaRotaApi {
  chave: string;
  /** Identidade do ENDEREÇO (migration 0308) — o que autoriza geocodificar e fixar pino. */
  destination_id: string | null;
  contact_id: string | null;
  cliente: string;
  fone: string | null;
  endereco: string | null;
  /** Número do endereço como está no destino (0311) — `S/N`, vazio ou `KM 12`. */
  numero?: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  geo_fonte: string | null;
  /** Entrada marcada (0311) — presente = o pino é a porta. */
  entrada?: {
    id: string;
    referencia: string | null;
    marcado_em: string;
    confirmacoes: number;
    confirmado_em: string | null;
    /** Quando ESTA parada foi confirmada na porta (não a memória do endereço). */
    confirmada_em?: string | null;
  } | null;
  pedidos: {
    shipment_order_id: string;
    order_id: string;
    numero: number;
    total_cents: number;
    status: string;
  }[];
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
  capacidade_peso_sem_dados:
    "Nenhum produto com peso no cadastro: a capacidade em kg não foi verificada.",
  capacidade_peso_sem_dado_do_veiculo: "Veículo sem capacidade em kg: o peso não foi limitado.",
  capacidade_volume_sem_dados:
    "Nenhum produto com dimensões: a capacidade em m³ não foi verificada.",
  capacidade_volume_sem_dado_do_veiculo: "Veículo sem capacidade em m³: o volume não foi limitado.",
  jornada_sem_dados: "Motorista sem jornada cadastrada: o tempo de trabalho não foi limitado.",
  janelas_de_entrega_sem_dados:
    "Nenhum pedido com janela de entrega: o horário não foi restringido.",
  janelas_de_entrega_sem_hora_de_saida:
    "Há janela de entrega, mas falta a hora de saída: o horário não foi restringido.",
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
    rota_geojson: {
      geometria?: number[][];
      provedor?: string;
      ruas?: boolean;
      modo?: string;
    } | null;
    rota_em: string | null;
    rota_versao: number;
    rota_versao_confirmada: number | null;
    rota_confirmada_em: string | null;
    saida_prevista: string | null;
    started_at: string | null;
    finished_at: string | null;
  };
  paradas: ParadaRotaApi[];
  ultima_posicao: { latitude: number; longitude: number; em: string } | null;
  gps_sem_sinal_minutos?: number;
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
 * Pino que NÃO é a porta: rua, bairro ou cidade. Todos os três merecem "Tentar
 * de novo" e correção à mão — antes o "Marcar no mapa" só aparecia para
 * `nominatim:cidade`, então o pino de bairro (o mais comum no interior, e o que
 * fica a quilômetros da rua) não tinha como ser corrigido pelo operador.
 */
function pinoAproximado(fonte: string | null | undefined): boolean {
  return fonte === "nominatim:rua" || fonte === "nominatim:bairro" || fonte === "nominatim:cidade";
}

/**
 * O pino desta parada veio de alguém que marcou a ENTRADA — com memória (0311)
 * ou do tempo do `manual`, quando ainda não havia onde guardar a marcação.
 *
 * A distinção importa na tela: sem a memória o chip diz "Entrada marcada" do
 * mesmo jeito (o pino É a porta), mas sem a referência; o que ele não pode é
 * continuar dizendo "sem número no cadastro" e oferecendo "Marcar no mapa" como
 * se ninguém tivesse respondido.
 */
function entradaMarcada(p: Pick<ParadaRotaApi, "entrada" | "geo_fonte">): boolean {
  return Boolean(p.entrada) || p.geo_fonte === FONTE_ENTRADA || p.geo_fonte === FONTE_MANUAL;
}

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
  /**
   * ERRO DE GEOCODIFICAÇÃO NÃO SOME COM A LISTA.
   *
   * Antes a falha virava toast de 4 s e a tela seguia igual: quem não estava
   * olhando no segundo do clique ficava sem saber que N endereços continuaram
   * fora do mapa. Agora a falha tem lugar fixo acima dos painéis, com o texto
   * do servidor e o botão de tentar de novo.
   */
  const [erroGeo, setErroGeo] = React.useState<string | null>(null);
  const [retornar, setRetornar] = React.useState(false);
  const [tempoParada, setTempoParada] = React.useState(8);
  const [trabalhando, setTrabalhando] = React.useState<string | null>(null);
  const [progressoGeo, setProgressoGeo] = React.useState<string | null>(null);
  const [marcarPara, setMarcarPara] = React.useState<string | null>(null);
  const [pinoPendente, setPinoPendente] = React.useState<{ lat: number; lng: number } | null>(null);
  /**
   * "portão azul", "entrada pelos fundos". Vai junto com o alfinete: o ponto
   * sozinho para na esquina, e a última centena de metros é onde a entrega
   * atrasa. Some ao cancelar — referência sem ponto não é entrada.
   */
  const [referenciaEntrada, setReferenciaEntrada] = React.useState("");
  const [rastro, setRastro] = React.useState<[number, number][]>([]);
  const [motorista, setMotorista] = React.useState<{ lat: number; lng: number } | null>(null);
  /** Instante da última posição recebida — a tela nunca chama isto de "online". */
  const [ultimaPosicaoEm, setUltimaPosicaoEm] = React.useState<string | null>(null);
  const [agora, setAgora] = React.useState(() => Date.now());
  const [limiarGps, setLimiarGps] = React.useState(15);
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
      const corpo = await apiClient.get<{ data: RotaCarregada }>(
        `/api/v1/shipments/${cargaId}/rota`,
      );
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
      setOrigemTexto((atual) =>
        atual === "" && d.carga.origem_endereco ? d.carga.origem_endereco : atual,
      );
      setRetornar(d.carga.retornar_origem);
      setTempoParada(d.carga.tempo_parada_min);
      if (d.ultima_posicao) {
        setMotorista({ lat: d.ultima_posicao.latitude, lng: d.ultima_posicao.longitude });
        setUltimaPosicaoEm(d.ultima_posicao.em);
        if (d.gps_sem_sinal_minutos) setLimiarGps(d.gps_sem_sinal_minutos);
      } else {
        setMotorista(null);
        setUltimaPosicaoEm(null);
      }
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

  React.useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
        {
          event: "INSERT",
          schema: "public",
          table: "shipment_positions",
          filter: `shipment_id=eq.${cargaId}`,
        },
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
  /**
   * Quantas paradas vão sair sem ninguém ter dito onde é a porta (0311).
   *
   * É gate, não enfeite: 37% dos destinos não têm número de casa, e para eles
   * o pino de rua/bairro/cidade fica a centenas de metros da entrada. O número
   * aparece antes de despachar, junto da ordem, porque é aí que ainda dá para
   * resolver — depois do caminhão na rua, só o telefone resolve.
   */
  const semEntrada = paradasOrdenadas.filter((p) => precisaDeEntrada(p));
  const totalClientes = new Set(rota.paradas.map((p) => p.contact_id ?? p.chave)).size;
  // Planejador vale montando E em rota (reotimizar no meio do caminho é
  // operação normal — o motorista confirma a nova sequência no app).
  const editavel =
    podeOperar && (rota.carga.status === "montando" || rota.carga.status === "em_rota");
  const valorTotal = rota.paradas.reduce((s, p) => s + p.total_cents, 0);
  const ordemSalva = rota.paradas.map((p) => p.chave);
  const ordemMudou = ordem.join("|") !== ordemSalva.join("|") && ordem.length === ordemSalva.length;
  const configMudou =
    retornar !== rota.carga.retornar_origem || tempoParada !== rota.carga.tempo_parada_min;
  /**
   * PUBLICAR — o gesto que manda a rota para a rua.
   *
   * A decisão do que mostrar é tabela (`lib/rotas/publicacao`, testada sem
   * browser): publicar, já publicada, encerrada ou vazia. Aqui só se aplica.
   */
  /**
   * O QUE JÁ FOI PUBLICADO × O QUE ESTÁ NA TELA.
   *
   * `ordemMudou` dizia só "mudou". Depois de publicado, quem despacha precisa
   * de **quantas** e **quais**: o motorista recebe a mudança como VERSÃO NOVA e
   * só aplica quando confirma no aparelho (0231) — a tela diz isso em vez de
   * fingir que a alteração já chegou.
   */
  const diferenca = diferencaDaOrdem(ordem, ordemSalva);

  const publicacao = estadoDaPublicacao({
    statusDaCarga: rota.carga.status,
    ordemMudou,
    paradas: paradasOrdenadas.length,
  });

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
  const assinaturaDe = (
    veiculos: { veiculo_id: string | null; motorista_id?: string | null; paradas: string[] }[],
  ) =>
    [...veiculos]
      .sort((a, b) => (a.veiculo_id ?? "").localeCompare(b.veiculo_id ?? ""))
      .map((v) => `${v.veiculo_id ?? ""}:${v.motorista_id ?? ""}:${v.paradas.join(",")}`)
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
      if (p.pedidos.some((x) => ["na_carga", "em_rota", "em_atendimento"].includes(x.status)))
        return p.chave;
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
      entrada: entradaMarcada(p)
        ? { referencia: p.entrada?.referencia ?? null, confirmacoes: p.entrada?.confirmacoes ?? 0 }
        : null,
      semNumero: situacaoDoNumero(p.numero) === "sem_numero",
    };
  });

  const geometria = proposta?.geometria ?? rota.carga.rota_geojson?.geometria ?? [];
  const modoSalvo = rota.carga.rota_geojson?.modo ?? null;
  const provedorRota = proposta
    ? { nome: proposta.provedor, ruas: proposta.ruas }
    : rota.carga.rota_geojson
      ? {
          nome: rota.carga.rota_geojson.provedor ?? "?",
          ruas: rota.carga.rota_geojson.ruas ?? false,
        }
      : null;
  const modoEfetivo = proposta?.modo ?? modoSalvo;
  const distanciaM = proposta?.distancia_m ?? rota.carga.distancia_m;
  const duracaoTotalS = proposta
    ? proposta.duracao_total_s
    : rota.carga.duracao_s != null
      ? rota.carga.duracao_s + paradasOrdenadas.length * rota.carga.tempo_parada_min * 60
      : null;

  // Realizado do rastro (haversine + ponta a ponta) — só com dado suficiente.
  let realizado: { km: string; tempo: string } | null = null;
  if (rastro.length >= 2) {
    let m = 0;
    for (let i = 1; i < rastro.length; i++)
      m += haversineM(
        { lat: rastro[i - 1]![0], lng: rastro[i - 1]![1] },
        { lat: rastro[i]![0], lng: rastro[i]![1] },
      );
    realizado = { km: formatarDistancia(m), tempo: "—" };
  }
  const tempoRealizado =
    rota.carga.started_at && (rota.carga.finished_at || rastro.length > 0)
      ? Math.round(
          (new Date(rota.carga.finished_at ?? new Date().toISOString()).getTime() -
            new Date(rota.carga.started_at).getTime()) /
            1000,
        )
      : null;
  if (realizado && tempoRealizado != null)
    realizado = { ...realizado, tempo: formatarDuracao(tempoRealizado) };

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
  async function geocodificarTudo(rotulo = "geo", destinationIds?: string[]): Promise<number> {
    setTrabalhando(rotulo);
    setProgressoGeo(t("Localizando…"));
    let localizadas = 0;
    let semResultado = 0;
    let comErro = 0;
    let ultima: RotaCarregada | null = null;
    try {
      for (;;) {
        const corpo = await apiClient.post<{
          data: { estados: { estado: string }[]; restantes: number };
        }>(
          `/api/v1/shipments/${cargaId}/rota/geocodificar`,
          // `destination_ids` só vai quando é um DESTINO específico ("Tentar
          // de novo" num pino aproximado): é o que autoriza regeocodificar
          // quem já tem coordenada, sem varrer a carga inteira a cada clique.
          destinationIds ? { destination_ids: destinationIds } : {},
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
        // `estado: "erro"` é o PROVEDOR fora (fetch falhou/HTTP != 200), e a
        // rota segue devolvendo 200 — por isso o `catch` abaixo não vê isso.
        // Sem separar os dois, a falha de serviço virava "endereço não achado".
        comErro += d.estados.filter((e) => e.estado === "erro").length;
        setProgressoGeo(d.restantes > 0 ? t(`Faltam ${d.restantes}…`) : t("Pronto."));
        ultima = (await recarregar()) ?? ultima;
        // Um lote sem estado nenhum não é "faltam N": é a rota sem alvo (sem
        // endereço ou contato fora do alcance). Sem esta saída, `restantes > 0`
        // com `estados` vazio girava para sempre.
        if (d.restantes <= 0 || d.estados.length === 0) break;
      }
      const paradas = ultima?.paradas ?? [];
      const noMapa = paradas.filter((p) => p.latitude != null && p.longitude != null).length;
      /*
       * A RODADA QUE NÃO LOCALIZOU NADA TAMBÉM É FALHA NA TELA.
       *
       * O provedor fora não lança: a rota devolve 200 com `estado: "erro"` por
       * parada. Antes isso virava toast de 4 s ("Nenhuma parada localizada") e
       * a tela ficava igual — o mesmo buraco do catch, um nível abaixo. Agora
       * os dois casos viram o banner único, com texto diferente: serviço fora
       * pede "tentar de novo"; endereço não achado pede correção.
       */
      if (comErro > 0) {
        setErroGeo(
          `${comErro} ${
            comErro === 1
              ? t("parada não foi localizada: o serviço de mapas não respondeu.")
              : t("paradas não foram localizadas: o serviço de mapas não respondeu.")
          } ${t("Tente de novo em instantes.")}`,
        );
      } else if (localizadas === 0 && semResultado > 0) {
        setErroGeo(
          `${semResultado} ${
            semResultado === 1
              ? t("parada sem endereço localizável. Corrija o cadastro ou marque no mapa.")
              : t("paradas sem endereço localizável. Corrija o cadastro ou marque no mapa.")
          }`,
        );
      } else {
        setErroGeo(null);
      }
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
      // O erro tem lugar na tela: banner acima dos painéis, com retry. Nada de
      // toast — e a lista de paradas continua exatamente onde estava.
      setErroGeo(mensagemDeErro(e, t("Não consegui localizar os endereços.")));
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
        title: t(
          "A rota está em andamento — o motorista verá a nova sequência. Reotimizar mesmo assim?",
        ),
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
            t(
              "Nenhuma parada localizada — sem endereço não há ordem. Corrija o cadastro ou marque no mapa.",
            ),
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
      // Gate do Address Recovery Engine (§3): com endereço não resolvido o
      // servidor recusa com 422 e a lista dos pendentes. Aqui o operador vê
      // QUAIS são e decide — seguir mesmo assim é ato explícito, não um
      // caminho que ele descobre clicando de novo.
      let corpo: { data: PropostaRota };
      try {
        corpo = await apiClient.post<{ data: PropostaRota }>(
          `/api/v1/shipments/${cargaId}/rota/otimizar`,
          {
            origem,
            retornar_origem: retornar,
            tempo_parada_min: tempoParada,
            modo: modoEscolhido,
          },
        );
      } catch (e) {
        const pendentes =
          e instanceof ApiError && e.status === 422 && Array.isArray(e.details?.pendentes)
            ? (e.details.pendentes as { enderecoOriginal?: string | null }[])
            : null;
        if (!pendentes || pendentes.length === 0) throw e;
        const seguir = await confirmar({
          title: `${pendentes.length} ${
            pendentes.length === 1
              ? t("endereço ainda não foi confirmado. A rota pode sair com um ponto errado.")
              : t("endereços ainda não foram confirmados. A rota pode sair com pontos errados.")
          } ${t("Otimizar mesmo assim?")}`,
          confirmLabel: t("Otimizar mesmo assim"),
        });
        if (!seguir) return;
        corpo = await apiClient.post<{ data: PropostaRota }>(
          `/api/v1/shipments/${cargaId}/rota/otimizar`,
          {
            origem,
            retornar_origem: retornar,
            tempo_parada_min: tempoParada,
            modo: modoEscolhido,
            ignorar_pendentes: true,
          },
        );
      }
      const p = corpo.data;
      setProposta(p);
      // A proposta só traz as paradas COM coordenada. Jogar fora as demais
      // sumia com elas da lista e fazia o "Salvar ordem" ser recusado ("a
      // ordem precisa cobrir todas as paradas"): elas vão para o fim, que é
      // onde a operação as trata — sem mapa, rota manual.
      setOrdem(ordemCompleta(p.ordem, p.nao_roteirizaveis));
      if (!p.ruas)
        toast.warning(t("Serviço de ruas fora do ar — ordem aproximada (linha reta ×1,3)."));
      else toast.success(t("Rota otimizada. Confira e salve."));
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  /**
   * PUBLICAR A ROTA — salvar (se preciso) e pôr na rua, num clique.
   *
   * Antes o gesto morava na tela vizinha, como botão de STATUS ("Iniciar
   * rota"): quem terminava de ordenar aqui tinha de sair da tela da rota para
   * publicá-la. As duas consequências — o cliente é avisado e a rota passa a
   * existir no aparelho do entregador — vão na confirmação, porque nenhuma
   * delas é reversível pelo botão.
   */
  async function publicarRota() {
    if (publicacao.tipo !== "publicar") return;
    const seguir = await confirmar({
      title: publicacao.precisaSalvar
        ? t("Publicar a rota com a ordem que está na tela?")
        : t("Publicar a rota?"),
      description: (
        <span>
          {t('A carga sai de "montando" e a rota passa a aparecer no aparelho do entregador.')}{" "}
          <strong>{t("Os clientes serão avisados por WhatsApp.")}</strong>{" "}
          {t("Não dá para desfazer por este botão.")}
        </span>
      ),
      confirmLabel: t("Publicar rota"),
      cancelLabel: t("Cancelar"),
    });
    if (!seguir) return;

    setTrabalhando("publicar");
    try {
      if (publicacao.precisaSalvar) {
        // A ordem na tela vence: sem isso o entregador receberia a anterior.
        await apiClient.patch(`/api/v1/shipments/${cargaId}/rota/ordem`, {
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
        setProposta(null);
      }
      await apiClient.post(`/api/v1/shipments/${cargaId}/rota/iniciar`, {});
      toast.success(t("Rota publicada. O entregador já vê a sequência."));
      aoMudar();
    } catch (e) {
      showApiError(e);
    } finally {
      setTrabalhando(null);
    }
  }

  async function salvarOrdem() {
    setTrabalhando("salvar");
    try {
      const corpo = await apiClient.patch<{ data: RotaCarregada }>(
        `/api/v1/shipments/${cargaId}/rota/ordem`,
        {
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
        },
      );
      setRota(corpo.data);
      setProposta(null);
      toast.success(`${t("Rota salva.")} ${t("Versão")} ${corpo.data.carga.rota_versao}`);
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
    if (
      ordemMudou &&
      !(await confirmar({
        title: t("A ordem manual será substituída pela distribuição. Continuar?"),
        confirmLabel: t("Distribuir"),
      }))
    )
      return;
    if (
      rota?.carga.status === "em_rota" &&
      !(await confirmar({
        title: t(
          "A rota está em andamento — o motorista verá a nova sequência. Reotimizar mesmo assim?",
        ),
        confirmLabel: t("Reotimizar"),
      }))
    )
      return;
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
          ...(sequenciaIntacta && base?.chegadas_s ? { chegadas_s: base.chegadas_s } : {}),
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

  /** `destino` é o id do DESTINO (0308) — ou o contato, em carga legada. */
  function alternarMarcar(destino: string) {
    const proximo = marcarPara === destino ? null : destino;
    setMarcarPara(proximo);
    setPinoPendente(null);
    // Reabrir a marcação de quem já tem entrada mostra a referência que existe:
    // apagar o "portão azul" ao corrigir o ponto seria perder o que o motorista
    // já sabe.
    const parada = rota?.paradas.find((p) => (p.destination_id ?? p.contact_id) === proximo);
    setReferenciaEntrada(proximo ? (parada?.entrada?.referencia ?? "") : "");
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
        destination_id: marcarPara,
        latitude: Number(pinoPendente.lat.toFixed(6)),
        longitude: Number(pinoPendente.lng.toFixed(6)),
        ...(referenciaEntrada.trim() ? { referencia: referenciaEntrada.trim() } : {}),
      });
      toast.success(t("Entrada marcada."));
      setMarcarPara(null);
      setPinoPendente(null);
      setReferenciaEntrada("");
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
    setReferenciaEntrada("");
  }

  async function acaoParada(chave: string, acao: "cheguei" | "entregue") {
    if (!rota) return;
    const parada = rota.paradas.find((p) => p.chave === chave);
    const alvo = parada?.pedidos.find((x) =>
      ["na_carga", "em_rota", "em_atendimento"].includes(x.status),
    );
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
    proposta?.origem ??
    (rota.carga.origem_lat != null && rota.carga.origem_lng != null
      ? {
          lat: rota.carga.origem_lat,
          lng: rota.carga.origem_lng,
          endereco: rota.carga.origem_endereco,
        }
      : null);

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho da seção ─────────────────────────────────────────────
          Mesmo peso e mesma forma do cabeçalho da seção "Paradas" desta ficha
          (`h2 text-base`), porque esta é uma seção dela — um segundo `h1` de
          24px competiria com o número da carga, que é o título da página. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-text">{t("Mapa e ordem de entrega")}</h2>
          {/*
            O `<details>` É IRMÃO DO `<p>` — nunca filho.
            Medido na captura da rota em 20/11/2026: com o recolhido dentro do
            parágrafo, o navegador fecha o `<p>` sozinho e o React acusa
            "In HTML, <summary> cannot be a descendant of <p>" — erro de
            HIDRATAÇÃO, cinco ocorrências por carga, nos dois temas. O texto
            curto fica no parágrafo; o detalhe recolhido fica ao lado dele.
          */}
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <p>{t("A ordem da lista é a ordem da rua.")}</p>
            <details className="inline-block">
              <summary className="cursor-pointer text-[11px] text-text-muted hover:text-text">
                {t("Detalhes do cálculo")}
              </summary>
              <p className="mt-1 text-[11px] text-text-muted">
                {provedorRota
                  ? provedorRota.ruas
                    ? t("O trajeto segue as ruas (OSRM).")
                    : t("Ordem aproximada por distância em linha reta.")
                  : t("Nenhum cálculo aplicado ainda.")}
                {selecionados.length > 0
                  ? ` ${t("Distribuição com OR-Tools: respeita capacidade e jornada.")}`
                  : ""}
              </p>
            </details>
          </div>
        </div>
        {/* UM SELO, UM ESTADO — e o jargão do provedor sai da frente.
            Antes o selo dizia "Sem rota calculada" / "Ordem aproximada" /
            "Pelas ruas": três nomes de ALGORITMO no lugar onde o operador
            precisa saber se a rota está publicada. O detalhe do cálculo vai
            para baixo, recolhido. */}
        {(() => {
          const estado =
            rota.carga.status === "concluida"
              ? { rotulo: t("Concluída"), variante: "success" as const }
              : rota.carga.status === "em_rota"
                ? { rotulo: t("Em andamento"), variante: "info" as const }
                : ordemMudou || ordemSalva.length === 0
                  ? { rotulo: t("Proposta"), variante: "warning" as const }
                  : { rotulo: t("Publicada"), variante: "success" as const };
          return <Badge variant={estado.variante}>{estado.rotulo}</Badge>;
        })()}

        {/*
          PUBLICAR — a ação primária desta tela, onde ela é decidida.
          O botão só existe quando publicar FAZ sentido (carga montando, com
          parada): na rua ele vira o atalho do entregador, e em carga concluída
          ou vazia não aparece — oferecer o gesto onde ele não existe é o
          controle decorativo que esta base já pagou caro.
        */}
        {publicacao.tipo === "publicar" && podeOperar && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => void publicarRota()}
            disabled={trabalhando !== null}
            data-testid="publicar-rota"
          >
            <PaperPlaneTilt className="h-3.5 w-3.5" aria-hidden />
            {trabalhando === "publicar" ? t("Publicando…") : t("Publicar rota")}
          </Button>
        )}
        {publicacao.tipo === "publicada" && rota.carga.rota_em ? (
          <p className="text-xs text-text-muted tabular-nums">
            {t("Publicada em")} {new Date(rota.carga.rota_em).toLocaleString(tagDeIdioma)} ·{" "}
            {t("versão")} {rota.carga.rota_versao}
            {rota.carga.rota_versao_confirmada === null ? (
              <span className="block">{t("Motorista ainda não confirmou esta rota.")}</span>
            ) : rota.carga.rota_versao_confirmada < rota.carga.rota_versao ? (
              <span className="block text-warning-fg">
                {t("Motorista ainda na versão anterior")} {rota.carga.rota_versao_confirmada} ·{" "}
                {rota.carga.rota_confirmada_em
                  ? new Date(rota.carga.rota_confirmada_em).toLocaleString(tagDeIdioma)
                  : ""}
              </span>
            ) : (
              <span className="block">
                {t("Confirmada na versão")} {rota.carga.rota_versao_confirmada}
                {rota.carga.rota_confirmada_em
                  ? ` ${t("às")} ${new Date(rota.carga.rota_confirmada_em).toLocaleString(tagDeIdioma)}`
                  : ""}
              </span>
            )}
          </p>
        ) : null}
        {publicacao.tipo === "publicada" && (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`/app/expedicao/${cargaId}/motorista`}>
              {t("Abrir no modo entregador")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </div>

      {/* ── OS NÚMEROS DA CARGA, NUMA FAIXA SÓ ──────────────────────────────
          Mesmo desenho da ficha da carga (seção Paradas): uma faixa com
          divisórias, não quatro cartões iguais. Cada célula responde a uma
          pergunta que a operação faz antes de sair — e só aparece com número
          quando há número: "Distância —" não informa nada. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs sm:grid-cols-3 xl:grid-cols-5">
        <div className="border-r border-b border-border px-3.5 py-3 sm:border-b-0">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Entregas")}
          </p>
          <p className="mt-0.5 text-lg font-semibold whitespace-nowrap text-text tabular-nums sm:text-2xl">
            {paradasOrdenadas.length}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {totalClientes} {totalClientes === 1 ? t("cliente") : t("clientes")}
          </p>
        </div>

        <div className="border-b border-border px-3.5 py-3 sm:border-r sm:border-b-0">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("No mapa")}
          </p>
          <p
            className={cn(
              "mt-0.5 text-lg font-semibold whitespace-nowrap tabular-nums sm:text-2xl",
              semCoord.length > 0 ? "text-warning-fg" : "text-text",
            )}
          >
            {comCoord.length}/{paradasOrdenadas.length}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {semCoord.length > 0
              ? semCoord.length === 1
                ? t("1 sem localização")
                : `${semCoord.length} ${t("sem localização")}`
              : t("todas localizadas")}
          </p>
        </div>

        <div className="border-r border-border px-3.5 py-3">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Distância")}
          </p>
          <p className="mt-0.5 text-lg font-semibold whitespace-nowrap text-text tabular-nums sm:text-2xl">
            {distanciaM != null ? formatarDistancia(distanciaM) : "—"}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {provedorRota?.ruas
              ? t("pelas ruas")
              : provedorRota
                ? t("aproximada")
                : t("não calculada")}
          </p>
        </div>

        <div className="border-b border-border px-3.5 py-3 sm:border-r sm:border-b-0 2xl:border-b-0">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Tempo")}
          </p>
          <p className="mt-0.5 text-lg font-semibold whitespace-nowrap text-text tabular-nums sm:text-2xl">
            {duracaoTotalS != null ? formatarDuracao(duracaoTotalS) : "—"}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {rota.carga.tempo_parada_min > 0
              ? `${rota.carga.tempo_parada_min} ${t("min por parada")}`
              : t("sem parada prevista")}
          </p>
        </div>

        <div className="col-span-2 px-3.5 py-3 sm:col-span-1">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("Mercadorias")}
          </p>
          <p className="mt-0.5 text-lg font-semibold whitespace-nowrap text-text tabular-nums sm:text-2xl">
            {comoMoeda(valorTotal, "BRL")}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {t("para entregar nesta rota")}
          </p>
        </div>
      </div>

      {/* ── O MAPA FICA EM CIMA, E GRANDE ────────────────────────────────────
          A ordem desta página é: o desenho, os números, e só então os
          controles. Antes eram três colunas lado a lado com o mapa espremido
          no meio e cinco cartões à direita — a rota, que é a razão da tela,
          virava a menor coisa nela. */}
      {/* O PISO DO MAPA É 50vh — e ele não é preferência de estilo: o gate
          `expedicao-pagina-de-rota-layout` exige altura em vh ≥ 50, porque abaixo
          disso o mapa deixa de ser o motivo da tela e vira miniatura. A primeira
          versão desta fatia tentou 42vh para trazer a lista à primeira dobra, e o
          gate reprovou — corretamente. O que sobra é descer do 58vh original até
          o piso: 50vh, com o teto em 520px (antes 640px). Trazer a lista para a
          primeira dobra é trabalho da fatia 2 (ação primária e ordem sincronizada),
          não de encolher o mapa abaixo do que a tela precisa. */}
      <div className="min-w-0">
        <p data-testid="gps-estado" className="mb-2 text-xs text-text-muted">
          {estadoDoGps(
            ultimaPosicaoEm,
            agora,
            limiarGps,
            (iso) => new Date(iso).toLocaleTimeString(tagDeIdioma, { hour: "2-digit", minute: "2-digit" }),
            t,
          ) ?? t("Sem posição recebida do motorista.")}
        </p>
        <MapaRota
          altura="min(50vh, 520px)"
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
        />

        {marcarPara && (
          <div className="mt-2 space-y-2 rounded-xl border border-warning/40 bg-warning-bg p-2.5 text-sm text-warning-fg">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {pinoPendente
                  ? t("Alfinete no lugar? Confirme para valer.")
                  : t("Clique no mapa onde fica a entrada.")}
              </span>
              <span className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void confirmarPino()}
                  disabled={!pinoPendente || trabalhando !== null}
                >
                  {t("Confirmar entrada")}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelarPino}>
                  {t("Cancelar")}
                </Button>
              </span>
            </div>
            {/* O ponto sozinho para na esquina. A referência é o que atravessa
                a última centena de metros — e é texto de quem conhece o lugar,
                não campo do cadastro do cliente. */}
            <Input
              value={referenciaEntrada}
              onChange={(e) => setReferenciaEntrada(e.target.value)}
              maxLength={160}
              placeholder={t("Referência para o motorista: “portão azul”, “entrada pelos fundos”")}
              aria-label={t("Referência da entrada")}
              className="h-9 bg-surface text-text"
            />
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
                {provedorRota.ruas ? t("Pelas ruas (OSRM)") : t("Aproximado — sem serviço de ruas")}
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

      {rota.carga.status === "em_rota" && diferenca.mudou ? (
        <div
          role="status"
          data-testid="alteracoes-nao-publicadas"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-sm text-warning-fg"
        >
          <span>
            {t("A rota está publicada e tem alterações que o motorista ainda não recebeu:")}{" "}
            <strong className="font-semibold tabular-nums">
              {diferenca.moveram} {t("moveram")}
              {diferenca.novas > 0 ? ` · ${diferenca.novas} ${t("novas")}` : ""}
              {diferenca.sairam > 0 ? ` · ${diferenca.sairam} ${t("saíram")}` : ""}
            </strong>
            {". "}
            {t("Ao salvar, a versão sobe e o motorista confirma a nova sequência no aparelho.")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void salvarOrdem()}
            disabled={trabalhando !== null || ordem.length === 0}
          >
            {t("Publicar nova versão")}
          </Button>
        </div>
      ) : null}

      {erroGeo ? (
        <div
          role="alert"
          data-testid="erro-geocodificacao"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-error/40 bg-error-bg px-3.5 py-2.5 text-sm text-error-fg"
        >
          <span>{erroGeo}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void geocodificarTudo()}
            disabled={trabalhando !== null}
          >
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : null}

      {/* ── OS PAINÉIS, ABAIXO DO MAPA ──────────────────────────────────────
          Depois do desenho, o trabalho: a ordem de entrega, o planejamento e,
          ao lado dele, o que impede a rota de sair (endereço sem confirmação e
          distribuição por veículo). Em telas largas ficam lado a lado; no
          celular empilham na ordem em que se usa. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {editavel && (
          <div className="min-w-0 space-y-4">
            <Card className="min-w-0 overflow-hidden p-0">
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
                    <label htmlFor="rota-origem" className="block text-xs font-medium text-text">
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
                        {t(
                          "Ainda sem parada no mapa: ao calcular, localizamos os endereços primeiro.",
                        )}
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
          </div>
        )}

        {editavel && (
          <div className="min-w-0 space-y-4">
            {/* Recuperação de endereços (Address Recovery Engine, 0309) — logo
              acima da distribuição porque é pré-requisito dela: com endereço
              sem confirmação o servidor recusa otimizar. */}
            <PainelRecuperacao cargaId={cargaId} podeOperar={podeOperar} aoAtualizar={recarregar} />

            {/* ── Distribuição por veículo (F5 / VRPTW) ──────────────────────
              O passo que faltava: sem esta tela, a distribuição do OR-Tools
              morria na resposta HTTP. Aqui o operador escolhe QUEM participa,
              define a hora de saída, vê a sequência de cada veículo com ETA e
              confirma — e a confirmação grava uma versão imutável da rota. */}
            {frota !== null && (
              <Card className="min-w-0 overflow-hidden p-0">
                <header className="flex items-center justify-between gap-2 border-b border-border bg-stage-2/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      {t("Frota")}
                    </p>
                    <p className="text-sm font-medium text-text">{t("Distribuição por veículo")}</p>
                  </div>
                  <Badge
                    variant={propostaMulti ? "info" : rota.distribuicao ? "success" : "neutral"}
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
                      <Link
                        href="/app/frota"
                        className="text-accent-ink underline underline-offset-2"
                      >
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
                          : t(
                              "Sem hora de saída a janela de entrega não é aplicada — o solver declara.",
                            )}
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
                          {trabalhando === "multi"
                            ? t("Distribuindo…")
                            : t("Distribuir com OR-Tools")}
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
          </div>
        )}

        {/* ── A ordem de entrega ────────────────────────────────────────── */}
        <Card className="order-first min-w-0 overflow-hidden p-0">
          <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border px-3.5 py-2.5">
            <p className="text-sm font-medium text-text">
              {t("Ordem de entrega")}{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                ({paradasOrdenadas.length})
              </span>
            </p>
            <p className="text-[11px] text-text-subtle">
              {t("A ordem da lista é a ordem da rua.")}
            </p>
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
                    {/* DE ONDE VEM O PINO (0311). Três estados diferentes que
                        antes saíam iguais:
                        · entrada marcada — o pino é a porta, e a referência vai
                          junto porque o ponto sozinho para na esquina;
                        · geocode — o que o mapa conseguiu (rua/bairro/cidade);
                        · sem número — o cadastro não tem número, e é por isso
                          que o pino não pode ser a porta. */}
                    {entradaMarcada(p) ? (
                      <span
                        className="inline-flex min-w-0 items-center gap-1 text-success-fg"
                        title={p.entrada?.referencia ?? undefined}
                      >
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="font-medium">{t("Entrada marcada")}</span>
                        {p.entrada?.referencia && (
                          <span className="truncate text-text-subtle">
                            · {p.entrada.referencia}
                          </span>
                        )}
                      </span>
                    ) : (
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
                    )}
                    {!entradaMarcada(p) && situacaoDoNumero(p.numero) === "sem_numero" && (
                      <span className="inline-flex items-center rounded-md bg-warning-bg px-1.5 py-0.5 font-medium text-warning-fg">
                        {t("sem número no cadastro")}
                      </span>
                    )}
                    {podeOperar && (p.destination_id ?? p.contact_id) && (
                      <>
                        {/* "Tentar de novo" só existe quando há número. Sem
                            número, o Nominatim não tem o que achar — o botão
                            era uma promessa que o código não podia cumprir, e
                            o operador lia a falha dele como falha do mapa. */}
                        {p.geo_status !== "ok" || pinoAproximado(p.geo_fonte) ? (
                          situacaoDoNumero(p.numero) !== "sem_numero" ? (
                            <button
                              type="button"
                              className="text-muted-foreground underline underline-offset-2 hover:text-text"
                              onClick={() =>
                                void geocodificarTudo("geo", [
                                  (p.destination_id ?? p.contact_id) as string,
                                ])
                              }
                            >
                              {t("Tentar de novo")}
                            </button>
                          ) : null
                        ) : null}
                        {/* Ponto aproximado também se corrige à mão: no endereço
                            rural o pino de cidade é só o começo, e o motorista
                            marca a porteira. Antes o "Marcar no mapa" sumia
                            justamente quando o pino estava no lugar errado. */}
                        {precisaDeEntrada(p) || entradaMarcada(p) ? (
                          <button
                            type="button"
                            className="text-muted-foreground underline underline-offset-2 hover:text-text"
                            onClick={() =>
                              alternarMarcar((p.destination_id ?? p.contact_id) as string)
                            }
                          >
                            {marcarPara === (p.destination_id ?? p.contact_id)
                              ? t("Cancelar marcação")
                              : entradaMarcada(p)
                                ? t("Corrigir entrada")
                                : t("Marcar no mapa")}
                          </button>
                        ) : null}
                        {p.contact_id && (p.geo_status !== "ok" || pinoAproximado(p.geo_fonte)) && (
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

          {/* O resumo antes de despachar. Fica junto da ordem, não num canto:
              é a última chance de marcar a entrada com o caminhão ainda na
              base. */}
          {semEntrada.length > 0 && (
            <p className="border-t border-border px-3.5 py-2 text-xs text-text-subtle">
              {semEntrada.length === 1
                ? t("1 parada sem entrada marcada — o pino é aproximado.")
                : `${semEntrada.length} ${t("paradas sem entrada marcada — o pino é aproximado.")}`}
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
