"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Buildings, PaperPlaneTilt } from "@phosphor-icons/react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { EmptyFilterResults } from "@/components/empty";
import {
  FilterActions,
  FilterAdvanced,
  FilterBar,
  FilterChips,
  FilterNumber,
  FilterPrimary,
  FilterSearch,
  FilterSelect,
  type ActiveChip,
} from "@/components/filters/FilterBar";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { ImportarArquivoDialog } from "./_importar-arquivo";
import { ContextualDrawer } from "@/components/shell/ContextualDrawer";
import {
  distanciaKm,
  limitesDosPontos,
  centroERaioDoBbox,
  ordemDeVisita,
  comprimentoDaRota,
} from "@/lib/prospeccao/geo";
import { abrirConversaDoProspect } from "@/lib/prospeccao/conversa";
import { prioridadeAlta } from "@/lib/prospeccao/score";
import { ROTULO_CLASSIFICACAO, type Classificacao } from "@/lib/prospeccao/classificacao";
import type { PontoMapa } from "./_mapa";
import { ROTULO_STATUS_COMERCIAL, STATUS_COMERCIAL, type Prospect } from "@/lib/schemas/prospeccao";

/** Origem comercial do prospect — nome cru de provider (google_places) não é linguagem de vendedor (§1 da spec 19). */
const ROTULO_ORIGEM: Record<string, string> = {
  google_places: "Busca de prospecção",
  osm_overpass: "Busca de prospecção",
  maps_browser: "Busca de prospecção",
  maps_arquivo: "Arquivo importado",
  maps_scraper: "Arquivo importado",
};

/** Cores da classificação (§10) — badge lê "Novo prospect", nunca "novo" cru. */
const CLASSE_COR: Record<Classificacao, string> = {
  cliente_existente: "bg-green-100 text-green-800",
  em_negociacao: "bg-blue-100 text-blue-800",
  lead_existente: "bg-sky-100 text-sky-800",
  sem_potencial: "bg-muted text-muted-foreground",
  ja_abordado: "bg-orange-100 text-orange-800",
  qualificado: "bg-purple-100 text-purple-800",
  aguardando_qualificacao: "bg-yellow-100 text-yellow-800",
  novo: "bg-teal-100 text-teal-800",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIT_COR: Record<string, string> = {
  potencial: "bg-emerald-100 text-emerald-800",
  duvidoso: "bg-yellow-100 text-yellow-900",
  sem_potencial: "bg-muted text-muted-foreground",
};
const FIT_ROTULO: Record<string, string> = {
  potencial: "Potencial",
  duvidoso: "Duvidoso",
  sem_potencial: "Sem potencial (IA)",
};

/** Selo da qualificação automática pelo laya local (0260) — a primeira triagem. */
function BadgeFit({ fit, t }: { fit: string | null | undefined; t: (s: string) => string }) {
  if (!fit || !FIT_COR[fit]) return null;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${FIT_COR[fit]}`}>
      {t(FIT_ROTULO[fit] as string)}
    </span>
  );
}

function BadgeClassificacao({
  classe,
  score,
  t,
}: {
  classe: Classificacao;
  score: number;
  t: (s: string) => string;
}) {
  return (
    <>
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${CLASSE_COR[classe]}`}>
        {t(ROTULO_CLASSIFICACAO[classe])}
      </span>
      {prioridadeAlta(score) && (
        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
          {t("Alta prioridade")}
        </span>
      )}
    </>
  );
}

/**
 * Aba EMPRESAS — tabela + mapa sincronizados (§§14, 20 do plano).
 *
 * Filtros e lista vivem aqui; o mapa (`_mapa.tsx`, leaflet via dynamic +
 * ssr:false para não pesar o bundle) recebe a MESMA lista filtrada — tabela
 * e mapa sempre mostram o mesmo conjunto. Ações: Iniciar conversa (abre o
 * Inbox com contexto do prospect, §17), WhatsApp (wa.me no drawer, nunca
 * campanha automática), status, excluir (LGPD), importar ao CRM (unitário e
 * em lote).
 */
const MapaProspects = dynamic(() => import("./_mapa").then((m) => m.MapaProspects), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center p-6">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

interface Filtros {
  busca: string;
  categoria: string;
  cidade: string;
  estado: string;
  status: string;
  comTelefone: boolean;
  comWebsite: boolean;
  comWhatsapp: boolean;
  notaMin: string;
  soSemCliente: boolean;
  minhaFila: boolean;
}

const VAZIOS: Filtros = {
  busca: "",
  categoria: "",
  cidade: "",
  estado: "",
  status: "",
  comTelefone: false,
  comWebsite: false,
  comWhatsapp: false,
  notaMin: "",
  soSemCliente: false,
  minhaFila: false,
};

export function EmpresasTab({
  podeOperar,
  usuarioId,
}: {
  podeOperar: boolean;
  /** O usuário da sessão — dono da "Minha fila" (item 16). */
  usuarioId: string;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const router = useRouter();
  const paramsUrl = useSearchParams();
  // "Ver empresas" desta busca (B1): uuid vive em busca_id, nunca no campo
  // de texto — link antigo `?busca=<uuid>` também é reconhecido.
  const [buscaId, setBuscaId] = React.useState<string | null>(() => {
    const id = paramsUrl.get("busca_id");
    if (id) return id;
    const texto = paramsUrl.get("busca") ?? "";
    return UUID_RE.test(texto) ? texto : null;
  });
  const [filtros, setFiltros] = React.useState<Filtros>(() => {
    const texto = paramsUrl.get("busca") ?? "";
    return {
      ...VAZIOS,
      busca: UUID_RE.test(texto) ? "" : texto,
      categoria: paramsUrl.get("categoria") ?? "",
      cidade: paramsUrl.get("cidade") ?? "",
      estado: paramsUrl.get("estado") ?? "",
      status: paramsUrl.get("status") ?? "",
      notaMin: paramsUrl.get("nota_min") ?? "",
      comTelefone: paramsUrl.get("com_telefone") === "true",
      comWebsite: paramsUrl.get("com_website") === "true",
      comWhatsapp: paramsUrl.get("com_whatsapp") === "true",
      soSemCliente: paramsUrl.get("so_sem_cliente") === "true",
      minhaFila: paramsUrl.get("minha_fila") === "true",
    };
  });
  // B2: o 1º fetch tem que partir da URL, não de VAZIOS — senão deep-link
  // carrega os campos e a lista ignora tudo. Congelado no primeiro render.
  const iniciaisRef = React.useRef({ filtros, buscaId });
  const [lista, setLista] = React.useState<(Prospect & { ja_e_cliente: boolean })[] | null>(null);
  // B3/FASE 15: paginação de verdade — `total` é o do servidor (meta.total,
  // todas as linhas do recorte), não o tamanho da janela que coube na resposta.
  const [total, setTotal] = React.useState(0);
  const [temMais, setTemMais] = React.useState(false);
  const [carregandoMais, setCarregandoMais] = React.useState(false);
  const [erro, setErro] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  // §37: cards + mapa são o modo PRINCIPAL; a tabela é o modo secundário
  // (ações em lote) — quem entra vê a tela comercial, não a planilha.
  const [visao, setVisao] = React.useState<"tabela" | "mapa">("mapa");
  const [dono, setDono] = React.useState("");
  const [vendedores, setVendedores] = React.useState<
    { user_id: string; full_name: string | null }[]
  >([]);
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(() =>
    paramsUrl.get("empresa"),
  );
  const [modoMapa, setModoMapa] = React.useState<"marcadores" | "densidade">("marcadores");
  const [ordem, setOrdem] = React.useState<string>(() => paramsUrl.get("ordem") ?? "relevancia");
  const [detalheId, setDetalheId] = React.useState<string | null>(null);
  // FASE 11 (§30): o "Abrir" do Radar chega como ?prospect=<uuid>. O prospect
  // pode não estar na lista (fora da janela de 200 ou fora do recorte), então o
  // id é capturado uma única vez na entrada e o detalhe vem da rota por id — o
  // sync de URL abaixo nunca o reescreve porque este estado só é lido.
  const [prospectAbertoId] = React.useState<string | null>(() => {
    const v = paramsUrl.get("prospect");
    return v && UUID_RE.test(v) ? v : null;
  });
  const [detalheExtra, setDetalheExtra] = React.useState<
    (Prospect & { ja_e_cliente: boolean }) | null
  >(null);
  // Rascunho da próxima ação (§16): ancorado no id aberto — trocar de prospect
  // descarta o rascunho velho sem precisar de effect (react-hooks/set-state-in-effect)
  // e a refetch pós-save não engole o que a pessoa acabou de digitar.
  const [proximoRascunho, setProximoRascunho] = React.useState<{
    id: string;
    texto: string;
  } | null>(null);
  const [rotaIds, setRotaIds] = React.useState<string[] | null>(null);
  const [visiveis, setVisiveis] = React.useState(100);
  const [importandoArquivo, setImportandoArquivo] = React.useState(false);
  // Chips de resultado (§36) — recorte do que JÁ foi buscado, sem request novo.
  const [soAlta, setSoAlta] = React.useState(false);
  const [soNovos, setSoNovos] = React.useState(false);
  const [soAbordados, setSoAbordados] = React.useState(false);
  // §16: "Minha fila" virou recorte SERVER-SIDE na FASE 15 — o corte é o
  // param `minha_fila` da API (o dono sai do authz), junto com a paginação:
  // cliente cortava só a janela carregada, e a fila de verdade é maior.
  const refsLinhas = React.useRef(new Map<string, HTMLDivElement>());

  React.useEffect(() => {
    if (!podeOperar) return;
    apiClient
      .get<{ data: { user_id: string; full_name: string | null }[] }>("/api/v1/team/assignable")
      .then((r) => setVendedores(Array.isArray(r?.data) ? r.data : []))
      .catch(() => undefined);
  }, [podeOperar]);

  // FASE 11: deep-link ?prospect= → traz o detalhe mesmo fora da lista.
  React.useEffect(() => {
    if (!prospectAbertoId) return;
    apiClient
      .get<{ data: unknown }>(`/api/v1/prospecting/prospects?id=${prospectAbertoId}&limite=1`)
      .then((corpo) => {
        const dados = (corpo as { data?: unknown } | null)?.data;
        const linha = Array.isArray(dados)
          ? ((dados[0] as (Prospect & { ja_e_cliente: boolean }) | undefined) ?? null)
          : null;
        if (linha) {
          setDetalheExtra(linha);
          setDetalheId(linha.id);
        }
      })
      .catch(() => undefined);
  }, [prospectAbertoId]);

  const buscar = React.useCallback(
    async (
      f: Filtros,
      idBusca: string | null,
      opcoes?: { acrescentar?: boolean; offset?: number },
    ) => {
      const acrescentar = opcoes?.acrescentar === true;
      if (acrescentar) setCarregandoMais(true);
      try {
        const qs = new URLSearchParams();
        // Página de 200 (máximo da API); carregar mais desce pelo offset
        // estável (score desc, id como desempate — B3/FASE 15).
        qs.set("limite", "200");
        if (acrescentar) qs.set("offset", String(opcoes?.offset ?? 0));
        if (idBusca) qs.set("busca_id", idBusca);
        if (f.busca.trim()) qs.set("busca", f.busca.trim());
        if (f.categoria.trim()) qs.set("categoria", f.categoria.trim());
        if (f.cidade.trim()) qs.set("cidade", f.cidade.trim());
        if (f.estado.trim()) qs.set("estado", f.estado.trim());
        if (f.status) qs.set("status", f.status);
        if (f.comTelefone) qs.set("com_telefone", "true");
        if (f.comWebsite) qs.set("com_website", "true");
        if (f.comWhatsapp) qs.set("com_whatsapp", "true");
        if (f.notaMin) qs.set("nota_min", f.notaMin);
        if (f.soSemCliente) qs.set("so_sem_cliente", "true");
        if (f.minhaFila) qs.set("minha_fila", "true");
        const corpo = await apiClient.get<{ data: unknown }>(
          `/api/v1/prospecting/prospects?${qs.toString()}`,
        );
        const dados = (corpo as { data?: unknown } | null)?.data;
        const meta = (corpo as { meta?: { total?: number; has_more?: boolean } } | null)?.meta;
        const novos = Array.isArray(dados) ? dados : [];
        setTotal(typeof meta?.total === "number" ? meta.total : novos.length);
        setTemMais(meta?.has_more === true);
        setLista((atual) => (acrescentar && atual ? [...atual, ...novos] : novos));
        // Anexar sobe a janela de render junto — sem isso as linhas novas ficam
        // atrás do slice de 100 e o "Carregar mais" parece não fazer nada;
        // busca nova recorta na janela inicial de novo.
        setVisiveis((v) => (acrescentar ? v + novos.length : 100));
        if (!acrescentar) setSelecionados([]);
        setErro(false);
      } catch (e) {
        setErro(true);
        showApiError(e);
      } finally {
        if (acrescentar) setCarregandoMais(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void buscar(iniciaisRef.current.filtros, iniciaisRef.current.buscaId);
  }, [buscar]);

  // Texto espera 350ms parada; selects e toggles aplicam na hora — o mesmo
  // vocabulário da tela de pedidos.
  const buscarDevagar = useDebouncedCallback((f: Filtros) => void buscar(f, buscaId), 350);

  function mudar(patch: Partial<Filtros>, devagar = false) {
    setFiltros((atual) => {
      const f = { ...atual, ...patch };
      if (devagar) buscarDevagar(f);
      else void buscar(f, buscaId);
      return f;
    });
  }

  // B3/FASE 15: próxima página do MESMO recorte — o offset é o nº de linhas
  // já carregadas (ordem estável no servidor: score desc, id como desempate).
  function carregarMais() {
    if (carregandoMais || !temMais) return;
    void buscar(filtros, buscaId, { acrescentar: true, offset: lista?.length ?? 0 });
  }

  const [avancadosAbertos, setAvancadosAbertos] = React.useState(false);
  const avancadosAtivos = [
    filtros.cidade.trim(),
    filtros.notaMin,
    filtros.comTelefone ? "x" : "",
    filtros.comWebsite ? "x" : "",
    filtros.comWhatsapp ? "x" : "",
    filtros.soSemCliente ? "x" : "",
  ].filter(Boolean).length;

  const chips: ActiveChip[] = [];
  if (buscaId) {
    chips.push({
      key: "busca_id",
      label: `${t("Busca específica")}: ${buscaId.slice(0, 8)}…`,
      onRemove: () => {
        setBuscaId(null);
        void buscar(filtros, null);
      },
    });
  }
  if (filtros.busca.trim()) {
    chips.push({
      key: "busca",
      label: filtros.busca.trim(),
      onRemove: () => mudar({ busca: "" }, true),
    });
  }
  if (filtros.status) {
    chips.push({
      key: "status",
      label: `${t("Status")}: ${ROTULO_STATUS_COMERCIAL[filtros.status as keyof typeof ROTULO_STATUS_COMERCIAL] ?? filtros.status}`,
      onRemove: () => mudar({ status: "" }),
    });
  }
  if (filtros.cidade.trim()) {
    chips.push({
      key: "cidade",
      label: `${t("Cidade")}: ${filtros.cidade.trim()}`,
      onRemove: () => mudar({ cidade: "" }, true),
    });
  }
  if (filtros.notaMin) {
    chips.push({
      key: "notaMin",
      label: `${t("Nota mínima")}: ${filtros.notaMin}`,
      onRemove: () => mudar({ notaMin: "" }),
    });
  }
  for (const [campo, rotulo] of [
    ["comTelefone", t("Com telefone")],
    ["comWebsite", t("Com website")],
    ["comWhatsapp", t("Com WhatsApp")],
    ["soSemCliente", t("Ainda não é cliente")],
  ] as const) {
    if (filtros[campo]) {
      chips.push({ key: campo, label: rotulo, onRemove: () => mudar({ [campo]: false }) });
    }
  }

  function limparFiltros() {
    setFiltros(VAZIOS);
    setBuscaId(null);
    setSoAlta(false);
    setSoNovos(false);
    setSoAbordados(false);
    setAvancadosAbertos(false);
    void buscar(VAZIOS, null);
  }

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  // URL state (§40): filtros + ordem + empresa sobrevivem a reload e link.
  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (buscaId) qs.set("busca_id", buscaId);
    if (filtros.busca.trim()) qs.set("busca", filtros.busca.trim());
    if (filtros.categoria.trim()) qs.set("categoria", filtros.categoria.trim());
    if (filtros.cidade.trim()) qs.set("cidade", filtros.cidade.trim());
    if (filtros.estado.trim()) qs.set("estado", filtros.estado.trim());
    if (filtros.status) qs.set("status", filtros.status);
    if (filtros.notaMin) qs.set("nota_min", filtros.notaMin);
    if (filtros.comTelefone) qs.set("com_telefone", "true");
    if (filtros.comWebsite) qs.set("com_website", "true");
    if (filtros.comWhatsapp) qs.set("com_whatsapp", "true");
    if (filtros.soSemCliente) qs.set("so_sem_cliente", "true");
    if (filtros.minhaFila) qs.set("minha_fila", "true");
    if (ordem !== "relevancia") qs.set("ordem", ordem);
    if (selecionadoId) qs.set("empresa", selecionadoId);
    router.replace(`/app/prospeccao${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
  }, [
    buscaId,
    filtros.busca,
    filtros.categoria,
    filtros.cidade,
    filtros.estado,
    filtros.status,
    filtros.notaMin,
    filtros.comTelefone,
    filtros.comWebsite,
    filtros.comWhatsapp,
    filtros.soSemCliente,
    filtros.minhaFila,
    ordem,
    selecionadoId,
    router,
  ]);

  type ItemLista = Prospect & { ja_e_cliente: boolean };

  // Recorte dos chips de resultado (§36) — alta prioridade (D14), novos e já
  // abordados vêm da classificação derivada (§10/D13) devolvida pela API.
  const listaFiltrada = React.useMemo(
    () =>
      (lista ?? []).filter((p) => {
        if (soAlta && !prioridadeAlta(p.score)) return false;
        if (soNovos && p.classificacao !== "novo") return false;
        if (soAbordados && p.classificacao !== "ja_abordado") return false;
        return true;
      }),
    [lista, soAlta, soNovos, soAbordados],
  );
  // Chips de RESULTADO = recortes client-side (contam no totalExibido porque
  // o servidor não os conhece); "minha fila" é filtro do servidor e já vem
  // no meta.total (FASE 15).
  const chipsResultadoAtivos = soAlta || soNovos || soAbordados;
  const temFiltroAtivo = chips.length > 0 || chipsResultadoAtivos || filtros.minhaFila;

  const comGeo = React.useMemo(
    () => listaFiltrada.filter((p) => p.latitude !== null && p.longitude !== null),
    [listaFiltrada],
  );
  const pontos: PontoMapa[] = React.useMemo(
    () =>
      comGeo.map((p) => ({
        id: p.id,
        nome: p.nome,
        latitude: p.latitude as number,
        longitude: p.longitude as number,
        categoria: p.categoria,
        cidade: p.cidade,
        estado: p.estado,
        telefone: p.telefone,
        website: p.website,
        status:
          p.status_comercial === "cliente" || p.ja_e_cliente
            ? ("cliente" as const)
            : p.contact_id || p.lead_id
              ? ("crm" as const)
              : ("novo" as const),
        score: p.score,
      })),
    [comGeo],
  );
  const limites = React.useMemo(
    () =>
      limitesDosPontos(
        pontos.map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })),
      ),
    [pontos],
  );
  const centroRaio = React.useMemo(() => (limites ? centroERaioDoBbox(limites) : null), [limites]);

  const ordenada = React.useMemo(() => {
    const base = [...listaFiltrada];
    const ref = centroRaio;
    const dist = (p: ItemLista): number =>
      ref && p.latitude !== null && p.longitude !== null
        ? distanciaKm(ref.latitude, ref.longitude, p.latitude, p.longitude)
        : Number.POSITIVE_INFINITY;
    switch (ordem) {
      case "distancia":
        return base.sort((a, b) => dist(a) - dist(b));
      case "rating":
        return base.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
      case "avaliacoes":
        return base.sort((a, b) => b.total_avaliacoes - a.total_avaliacoes);
      case "nome":
        return base.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      case "recentes":
        return base.sort((a, b) => (a.discovered_at < b.discovered_at ? 1 : -1));
      default:
        return base.sort((a, b) => b.score - a.score);
    }
  }, [listaFiltrada, ordem, centroRaio]);

  const analise = React.useMemo(() => {
    const l = listaFiltrada;
    const comFone = l.filter((p) => p.telefone).length;
    const comSite = l.filter((p) => p.website).length;
    const notas = l.map((p) => p.nota).filter((n): n is number => n !== null);
    return {
      total: l.length,
      novas: l.filter((p) => !p.contact_id && !p.ja_e_cliente).length,
      noCrm: l.filter((p) => p.contact_id || p.lead_id).length,
      clientes: l.filter((p) => p.ja_e_cliente).length,
      comFone,
      comSite,
      ratingMedio: notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    };
  }, [listaFiltrada]);

  // B3/FASE 15: o número da busca vem do servidor (meta.total — TODAS as
  // linhas do recorte). Os chips de resultado cortam dentro da janela já
  // carregada (são client-side), então nesse caso o número honesto é o da
  // tela: o servidor não os conhece.
  const totalExibido = chipsResultadoAtivos ? analise.total : total;

  function selecionar(id: string | null) {
    setSelecionadoId(id);
    if (id) {
      setDetalheId(null);
      requestAnimationFrame(() => {
        refsLinhas.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  async function buscarNestaArea(lim: {
    sul: number;
    oeste: number;
    norte: number;
    leste: number;
  }) {
    const categorias = [...new Set(listaFiltrada.map((p) => p.categoria).filter(Boolean))].slice(
      0,
      10,
    ) as string[];
    if (categorias.length === 0) {
      toast.error(t("Sem categorias nos resultados para buscar na área."));
      return;
    }
    const centro = { latitude: (lim.sul + lim.norte) / 2, longitude: (lim.oeste + lim.leste) / 2 };
    const raio = Math.max(1, Math.ceil(distanciaKm(lim.sul, lim.oeste, lim.norte, lim.leste) / 2));
    try {
      await apiClient.post("/api/v1/prospecting/searches", {
        categorias,
        latitude: Math.round(centro.latitude * 10000) / 10000,
        longitude: Math.round(centro.longitude * 10000) / 10000,
        raio_km: Math.min(500, raio),
        rotulo: "Área do mapa",
      });
      toast.success(t("Busca da área criada — acompanhe na aba Pesquisas."));
    } catch (e) {
      showApiError(e);
    }
  }

  function criarRota(ids: string[]) {
    const pts = ids
      .map((id) => pontos.find((p) => p.id === id))
      .filter((p): p is PontoMapa => !!p && p.latitude !== null);
    if (pts.length < 2) {
      toast.error(t("Selecione ao menos 2 empresas com localização."));
      return;
    }
    setRotaIds(
      ordemDeVisita(
        pts.map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })),
      ).map((p) => p.id),
    );
    setVisao("mapa");
  }

  const rota = React.useMemo(() => {
    if (!rotaIds) return null;
    const pts = rotaIds
      .map((id) => pontos.find((p) => p.id === id))
      .filter((p): p is PontoMapa => !!p);
    if (pts.length === 0) return null;
    return {
      pontos: pts,
      km: comprimentoDaRota(
        pts.map((p) => ({ id: p.id, latitude: p.latitude, longitude: p.longitude })),
      ),
    };
  }, [rotaIds, pontos]);

  // O detalhe vivo é o da lista; ?prospect= (FASE 11) cai no extra quando o
  // id não está na janela carregada.
  const detalhe = detalheId
    ? ((lista ?? []).find((p) => p.id === detalheId) ??
      (detalheExtra && detalheExtra.id === detalheId ? detalheExtra : null))
    : null;

  function navegarHref(p: { latitude: number | null; longitude: number | null }): string {
    return `https://www.openstreetmap.org/directions?to=${p.latitude},${p.longitude}`;
  }

  async function importar(ids: string[]) {
    if (ids.length === 0) {
      toast.error(t("Selecione ao menos 1 empresa."));
      return;
    }
    try {
      const corpo = await apiClient.post<{
        data: { vinculados: number; criados: number; recusados: number; detalhes: string[] } | null;
      }>("/api/v1/prospecting/prospects/import", {
        prospect_ids: ids,
        ...(dono.trim() ? { owner_user_id: dono.trim() } : {}),
      });
      const r = corpo?.data ?? {
        vinculados: 0,
        criados: 0,
        recusados: 0,
        detalhes: [] as string[],
      };
      toast.success(
        t(`CRM: ${r.criados} criados, ${r.vinculados} vinculados, ${r.recusados} recusados`),
      );
      if (Array.isArray(r.detalhes) && r.detalhes.length > 0)
        toast.info(r.detalhes.slice(0, 3).join(" "));
      await buscar(filtros, buscaId);
      // FASE 11: o detalhe de ?prospect= pode ter sido um dos importados —
      // a verdade de "já é cliente" muda na hora.
      if (detalheExtra && ids.includes(detalheExtra.id)) await refetchDetalheExtra(detalheExtra.id);
    } catch (e) {
      showApiError(e);
    }
  }

  /**
   * §24 do spec da Venda Automática: a ação nasce do filtro ATUAL — cidade,
   * categoria e a quantidade que a lista (ou a seleção) já mostrou. A cidade é
   * obrigatória porque a elegibilidade da campanha casa por cidade; sem ela o
   * botão fica desligado em vez de criar campanha que nunca casa candidato.
   */
  async function criarVendaAutomatica(): Promise<void> {
    const cidade = filtros.cidade.trim();
    if (!cidade) return;
    const quantidade = Math.min(
      Math.max(selecionados.length > 0 ? selecionados.length : listaFiltrada.length, 1),
      500,
    );
    try {
      const corpo = await apiClient.post<{ data: { id: string } | null }>(
        "/api/v1/automatic-sales/campaigns",
        {
          nome: `Radar ${cidade}${filtros.categoria.trim() ? ` · ${filtros.categoria.trim()}` : ""}`,
          cidade,
          uf: filtros.estado.trim() ? filtros.estado.trim().toUpperCase() : null,
          categorias: filtros.categoria.trim() ? [filtros.categoria.trim()] : [],
          limite_diario: quantidade,
          janela_inicio: "09:00",
          janela_fim: "17:30",
          followup_horas: [24, 48],
        },
      );
      if (corpo?.data?.id) {
        toast.success(t("Campanha de venda automática criada"));
        router.push("/app/venda-automatica");
      }
    } catch (e) {
      showApiError(e);
    }
  }

  // Detalhe vindo de ?prospect= (fora da lista): refaz o GET para a
  // classificação derivada (§10/D13) não ficar velha depois do PATCH.
  async function refetchDetalheExtra(id: string) {
    try {
      const corpo = await apiClient.get<{ data: unknown }>(
        `/api/v1/prospecting/prospects?id=${id}&limite=1`,
      );
      const dados = (corpo as { data?: unknown } | null)?.data;
      const linha = Array.isArray(dados)
        ? ((dados[0] as (Prospect & { ja_e_cliente: boolean }) | undefined) ?? null)
        : null;
      setDetalheExtra((atual) => (atual && atual.id === id ? (linha ?? atual) : atual));
    } catch {
      // deep-link é cortesia da FASE 11 — falhou, a lista continua a verdade.
    }
  }

  async function atualizarProspect(id: string, patch: Record<string, unknown>) {
    try {
      await apiClient.patch(`/api/v1/prospecting/prospects/${id}`, patch);
      await buscar(filtros, buscaId);
      if (detalheExtra?.id === id) await refetchDetalheExtra(id);
    } catch (e) {
      showApiError(e);
    }
  }

  async function mudarStatus(id: string, status_comercial: string) {
    await atualizarProspect(id, { status_comercial });
  }

  // §13/§14: "Adicionar à fila" = eu viro o dono. Sem dono nenhum a fila não
  // existe; o primeiro passo é sempre "assumir".
  function adicionarNaFila(id: string) {
    return atualizarProspect(id, { owner_user_id: usuarioId || null });
  }

  async function ignorar(id: string, nome: string) {
    const sim = await confirmar({
      title: t(`Marcar "${nome}" como sem interesse?`),
      confirmLabel: t("Ignorar"),
    });
    if (!sim) return;
    await mudarStatus(id, "sem_interesse");
  }

  // §17: o botão abre o Inbox EXISTENTE com o contexto do prospect (origem,
  // categoria/cidade em tag, conversa etiquetada como "prospeccao") — nunca um
  // sistema de mensagens novo. A payload/claim moram em
  // lib/prospeccao/conversa.ts porque o Radar faz a MESMA chamada (FASE 11).
  async function iniciarConversa(p: Prospect): Promise<void> {
    if (!p.telefone) return;
    try {
      const conversa = await abrirConversaDoProspect(p, usuarioId);
      if (!conversa) return;
      router.push(`/app/inbox?id=${conversa}`);
    } catch (e) {
      showApiError(e);
    }
  }

  async function excluir(id: string, nome: string) {
    const ok = await confirmar({
      title: t(`Excluir "${nome}" da base? (LGPD)`),
      confirmLabel: t("Excluir"),
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/api/v1/prospecting/prospects/${id}`);
      // FASE 11: se o aberto veio de ?prospect=, some com ele — senão o
      // fallback manteria na tela um prospect que o banco já não tem.
      if (detalheExtra?.id === id) {
        setDetalheExtra(null);
        setDetalheId(null);
      }
      await buscar(filtros, buscaId);
    } catch (e) {
      showApiError(e);
    }
  }

  function zapHref(p: Prospect): string | null {
    if (!p.telefone) return null;
    const digitos = p.telefone.replace(/\D/g, "");
    if (digitos.length < 10) return null;
    return `https://wa.me/${digitos}?text=${encodeURIComponent(`Olá ${p.nome}! Posso falar sobre uma condição para sua empresa?`)}`;
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterPrimary>
          <FilterSearch
            id="f-busca"
            label={t("Buscar")}
            value={filtros.busca}
            onChange={(busca) => mudar({ busca }, true)}
            placeholder={t("nome, telefone, cidade, site…")}
          />
          <FilterSelect
            id="f-status"
            label={t("Status")}
            value={filtros.status}
            onChange={(status) => mudar({ status })}
            allLabel={t("Todos")}
            options={STATUS_COMERCIAL.map((s) => ({ value: s, label: ROTULO_STATUS_COMERCIAL[s] }))}
          />
        </FilterPrimary>

        <FilterAdvanced
          open={avancadosAbertos}
          onToggle={() => setAvancadosAbertos((a) => !a)}
          toggleLabel={t("Filtros avançados")}
          activeCount={avancadosAtivos}
        >
          <div className="w-full space-y-1.5 sm:w-44 md:shrink-0">
            <Label htmlFor="f-cidade" className="block text-sm font-medium">
              {t("Cidade")}
            </Label>
            <Input
              id="f-cidade"
              value={filtros.cidade}
              onChange={(e) => mudar({ cidade: e.target.value }, true)}
              className="h-9"
            />
          </div>
          <FilterNumber
            id="f-nota"
            label={t("Nota mínima")}
            value={filtros.notaMin}
            onChange={(notaMin) => mudar({ notaMin })}
            min={0}
          />
          <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
            {(
              [
                ["comTelefone", t("Com telefone")],
                ["comWebsite", t("Com website")],
                ["comWhatsapp", t("Com WhatsApp")],
                ["soSemCliente", t("Ainda não é cliente")],
              ] as const
            ).map(([campo, rotulo]) => (
              <Button
                key={campo}
                type="button"
                size="sm"
                variant={filtros[campo] ? "default" : "outline"}
                onClick={() => mudar({ [campo]: !filtros[campo] })}
                aria-pressed={filtros[campo]}
              >
                {rotulo}
              </Button>
            ))}
          </div>
        </FilterAdvanced>

        <FilterChips chips={chips} onClearAll={limparFiltros} clearLabel={t("Limpar filtros")} />

        <FilterActions>
          <div className="ml-auto flex gap-2">
            {podeOperar && (
              <Button
                size="sm"
                variant="outline"
                disabled={!filtros.cidade.trim()}
                title={!filtros.cidade.trim() ? t("Informe a cidade no filtro") : undefined}
                onClick={() => void criarVendaAutomatica()}
              >
                <PaperPlaneTilt className="h-4 w-4" />
                {t("Criar venda automática")}
              </Button>
            )}
            {podeOperar && (
              <Button size="sm" variant="outline" onClick={() => setImportandoArquivo(true)}>
                {t("Importar arquivo")}
              </Button>
            )}
            <Button
              size="sm"
              variant={visao === "tabela" ? "default" : "outline"}
              onClick={() => setVisao("tabela")}
            >
              {t("Tabela")}
            </Button>
            <Button
              size="sm"
              variant={visao === "mapa" ? "default" : "outline"}
              onClick={() => setVisao("mapa")}
            >
              {t("Mapa")}
            </Button>
          </div>
        </FilterActions>
      </FilterBar>

      {/* §36: "N oportunidades encontradas" + os filtros rápidos do vendedor. */}
      {listaFiltrada.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <p className="text-sm font-semibold">
            {totalExibido} {t("oportunidades encontradas")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={
                chipsResultadoAtivos || filtros.minhaFila || filtros.comWhatsapp
                  ? "outline"
                  : "default"
              }
              onClick={limparFiltros}
            >
              {t("Todos")}
            </Button>
            <Button
              size="sm"
              variant={soAlta ? "default" : "outline"}
              aria-pressed={soAlta}
              onClick={() => setSoAlta((v) => !v)}
            >
              {t("Alta prioridade")}
            </Button>
            <Button
              size="sm"
              variant={filtros.minhaFila ? "default" : "outline"}
              aria-pressed={filtros.minhaFila}
              onClick={() => mudar({ minhaFila: !filtros.minhaFila })}
            >
              {t("Minha fila")}
            </Button>
            <Button
              size="sm"
              variant={filtros.comWhatsapp ? "default" : "outline"}
              aria-pressed={filtros.comWhatsapp}
              onClick={() => mudar({ comWhatsapp: !filtros.comWhatsapp })}
            >
              {t("Com WhatsApp")}
            </Button>
            <Button
              size="sm"
              variant={soNovos ? "default" : "outline"}
              aria-pressed={soNovos}
              onClick={() => {
                setSoNovos((v) => !v);
                setSoAbordados(false);
              }}
            >
              {t("Novos")}
            </Button>
            <Button
              size="sm"
              variant={soAbordados ? "default" : "outline"}
              aria-pressed={soAbordados}
              onClick={() => {
                setSoAbordados((v) => !v);
                setSoNovos(false);
              }}
            >
              {t("Já abordados")}
            </Button>
          </div>
          {temMais && (
            <Button size="sm" variant="outline" onClick={carregarMais} disabled={carregandoMais}>
              {carregandoMais
                ? t("Carregando…")
                : `${t("Carregar mais")} (${Math.max(0, total - (lista?.length ?? 0))} ${t("restantes")})`}
            </Button>
          )}
        </div>
      )}

      {lista === null && erro ? (
        <NexusErrorState onRetry={() => void buscar(filtros, buscaId)} />
      ) : lista === null ? (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : visao === "mapa" && listaFiltrada.length > 0 ? (
        <div className="space-y-3">
          <div
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span>
              <strong className="text-foreground tabular-nums">{totalExibido}</strong>{" "}
              {t("encontradas")}
            </span>
            <span>
              <strong className="text-foreground tabular-nums">{analise.novas}</strong> {t("novas")}
            </span>
            <span>
              <strong className="text-foreground tabular-nums">{analise.noCrm}</strong>{" "}
              {t("no CRM")}
            </span>
            <span>
              <strong className="text-foreground tabular-nums">{analise.clientes}</strong>{" "}
              {t("clientes")}
            </span>
            <span>
              <strong className="text-foreground tabular-nums">{analise.comFone}</strong>{" "}
              {t("com telefone")}
            </span>
            <span>
              <strong className="text-foreground tabular-nums">{analise.comSite}</strong>{" "}
              {t("com site")}
            </span>
            {analise.ratingMedio != null && (
              <span>
                ★{" "}
                <strong className="text-foreground tabular-nums">
                  {analise.ratingMedio.toFixed(1)}
                </strong>{" "}
                {t("médio")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{t("Ordenar")}</span>
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3"
              >
                <option value="relevancia">{t("Relevância")}</option>
                <option value="distancia">{t("Distância")}</option>
                <option value="rating">{t("Rating")}</option>
                <option value="avaliacoes">{t("Avaliações")}</option>
                <option value="nome">{t("Nome")}</option>
                <option value="recentes">{t("Mais recentes")}</option>
              </select>
            </label>
            {podeOperar && selecionados.length >= 2 && (
              <Button size="sm" variant="outline" onClick={() => criarRota(selecionados)}>
                {t("Criar rota")}
              </Button>
            )}
            {rota && (
              <Button size="sm" variant="ghost" onClick={() => setRotaIds(null)}>
                {t("Limpar rota")} ({rota.km} km)
              </Button>
            )}
          </div>
          {rota && (
            <Card className="hover-raise p-3">
              <p className="mb-2 text-sm font-medium">
                {t("Rota")} · {rota.pontos.length} {t("paradas")} · {rota.km} km
              </p>
              <ol className="space-y-1 text-sm">
                {rota.pontos.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <a
                      href={navegarHref(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline underline-offset-4"
                    >
                      {t("Ir até")}
                    </a>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <div className="grid gap-3 lg:grid-cols-[35%_65%]">
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[65vh]">
              {ordenada.slice(0, visiveis).map((p) => (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) refsLinhas.current.set(p.id, el);
                    else refsLinhas.current.delete(p.id);
                  }}
                >
                  <Card
                    className={`cursor-pointer p-2.5 transition-colors hover:border-primary/40 ${selecionadoId === p.id ? "border-primary ring-1 ring-primary" : ""}`}
                    onClick={() => selecionar(p.id === selecionadoId ? null : p.id)}
                  >
                    <p className="truncate text-sm font-medium">{p.nome}</p>
                    {p.classificacao && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1">
                        <BadgeClassificacao classe={p.classificacao} score={p.score} t={t} />
                        <BadgeFit fit={p.laya_fit} t={t} />
                      </p>
                    )}
                    {!p.classificacao && p.laya_fit && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1">
                        <BadgeFit fit={p.laya_fit} t={t} />
                      </p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.categoria, [p.cidade, p.estado].filter(Boolean).join("/")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {p.nota !== null ? `★ ${p.nota} (${p.total_avaliacoes})` : ""}
                      {p.ja_e_cliente
                        ? ` · ${t("Cliente")}`
                        : p.contact_id || p.lead_id
                          ? ` · ${t("No CRM")}`
                          : ""}
                      {` · ${p.score}`}
                    </p>
                    {/* §13: telefone + status na cara do card. */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {p.telefone && <span className="tabular-nums">{p.telefone}</span>}
                      {p.status_comercial !== "novo" && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                          {t(ROTULO_STATUS_COMERCIAL[p.status_comercial])}
                        </span>
                      )}
                    </p>
                    {/* §13/§17: Abrir empresa · Iniciar conversa (Inbox) · fila · CRM. */}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetalheId(p.id);
                        }}
                      >
                        {t("Abrir")}
                      </Button>
                      {podeOperar && p.telefone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void iniciarConversa(p);
                          }}
                        >
                          {t("Iniciar conversa")}
                        </Button>
                      )}
                      {podeOperar && p.owner_user_id !== usuarioId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void adicionarNaFila(p.id);
                          }}
                        >
                          {t("Na fila")}
                        </Button>
                      )}
                      {podeOperar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void importar([p.id]);
                          }}
                        >
                          {t("CRM")}
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              ))}
              {ordenada.length > visiveis && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVisiveis((v) => v + 100)}
                  className="w-full"
                >
                  {t("Mostrar mais")} ({ordenada.length - visiveis} {t("restantes")})
                </Button>
              )}
            </div>
            <MapaProspects
              lista={pontos}
              selecionadoId={selecionadoId}
              selecionados={selecionados}
              onSelecionar={selecionar}
              onVer={(id) => setDetalheId(id)}
              onAdicionar={(ids) => void importar(ids)}
              onFila={podeOperar ? (id) => void adicionarNaFila(id) : undefined}
              centro={
                centroRaio
                  ? { latitude: centroRaio.latitude, longitude: centroRaio.longitude }
                  : null
              }
              raioKm={centroRaio?.raioKm ?? null}
              modo={modoMapa}
              onModo={setModoMapa}
              onArea={(lim) => void buscarNestaArea(lim)}
              rota={
                rota?.pontos.map((p) => ({
                  latitude: p.latitude,
                  longitude: p.longitude,
                  nome: p.nome,
                })) ?? undefined
              }
              alturaClasse="h-[65vh]"
            />
          </div>
        </div>
      ) : listaFiltrada.length === 0 && temFiltroAtivo ? (
        <EmptyFilterResults primary={{ label: t("Limpar filtros"), onClick: limparFiltros }} />
      ) : listaFiltrada.length === 0 ? (
        <NexusEmptyState icon={Buildings} headline={t("Nenhuma empresa com estes filtros.")} />
      ) : (
        <>
          {podeOperar && (
            <Card className="hover-raise flex flex-wrap items-center gap-2 p-3">
              <span className="text-sm text-muted-foreground">
                {selecionados.length} {t("selecionadas")}
              </span>
              <select
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                value={dono}
                onChange={(e) => setDono(e.target.value)}
                aria-label={t("Vendedor responsável (opcional)")}
              >
                <option value="">{t("Sem dono específico")}</option>
                {vendedores.map((v) => (
                  <option key={v.user_id} value={v.user_id}>
                    {v.full_name ?? v.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => void importar(selecionados)}>
                {t("Adicionar ao CRM")}
              </Button>
            </Card>
          )}
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {podeOperar && <TableHead />}
                  <TableHead>{t("Empresa")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("Categoria")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("Cidade")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("Telefone")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    {t("Avaliação")}
                  </TableHead>
                  <TableHead className="text-right">{t("Score")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("Status CRM")}</TableHead>
                  <TableHead>{t("Ações")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenada.slice(0, visiveis).map((p) => (
                  <TableRow key={p.id} className="align-top">
                    {podeOperar && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selecionados.includes(p.id)}
                          onChange={() => alternar(p.id)}
                          aria-label={p.nome}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <p className="font-medium">{p.nome}</p>
                      {p.classificacao && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1">
                          <BadgeClassificacao classe={p.classificacao} score={p.score} t={t} />
                          <BadgeFit fit={p.laya_fit} t={t} />
                        </p>
                      )}
                      {!p.classificacao && p.laya_fit && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1">
                          <BadgeFit fit={p.laya_fit} t={t} />
                        </p>
                      )}
                      {p.website && (
                        <a
                          href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground underline"
                        >
                          {p.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}
                        </a>
                      )}
                      {p.ja_e_cliente && (
                        <p className="text-xs font-medium text-green-600">
                          {t("Cliente já cadastrado")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {p.categoria ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {[p.cidade, p.estado].filter(Boolean).join("/")}
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {p.telefone ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {p.nota !== null ? `★ ${p.nota} (${p.total_avaliacoes})` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{p.score}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {podeOperar ? (
                        <select
                          className="h-8 rounded-lg border bg-background px-2 text-xs"
                          value={p.status_comercial}
                          onChange={(e) => void mudarStatus(p.id, e.target.value)}
                          aria-label={t("Status comercial")}
                        >
                          {STATUS_COMERCIAL.map((s) => (
                            <option key={s} value={s}>
                              {ROTULO_STATUS_COMERCIAL[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROTULO_STATUS_COMERCIAL[p.status_comercial]
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDetalheId(p.id)}>
                          {t("Ver")}
                        </Button>
                        {podeOperar && (
                          <>
                            {p.telefone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void iniciarConversa(p)}
                              >
                                {t("Iniciar conversa")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void importar([p.id])}
                            >
                              {t("CRM")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void excluir(p.id, p.nome)}
                            >
                              {t("Excluir")}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("WhatsApp abre conversa manual — nunca campanha automática sem consentimento.")}
          </p>
          {ordenada.length > visiveis && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisiveis((v) => v + 200)}
              className="w-full"
            >
              {t("Mostrar mais")} ({ordenada.length - visiveis} {t("restantes")})
            </Button>
          )}
        </>
      )}
      {detalhe && (
        <ContextualDrawer
          aberto
          onFechar={() => setDetalheId(null)}
          titulo={detalhe.nome}
          subtitulo={[detalhe.categoria, [detalhe.cidade, detalhe.estado].filter(Boolean).join("/")]
            .filter(Boolean)
            .join(" · ")}
          className="max-w-md"
        >
          <div className="space-y-2 text-sm">
            {detalhe.nota !== null && (
              <p>
                ★ {detalhe.nota} · {detalhe.total_avaliacoes} {t("avaliações")}
              </p>
            )}
            {detalhe.endereco && <p className="text-muted-foreground">{detalhe.endereco}</p>}
            {detalhe.telefone && <p className="tabular-nums">{detalhe.telefone}</p>}
            {detalhe.website && (
              <a
                href={
                  detalhe.website.startsWith("http")
                    ? detalhe.website
                    : `https://${detalhe.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block underline underline-offset-4"
              >
                {detalhe.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
              </a>
            )}
            <p className="text-muted-foreground">
              {t("Origem")}: {t(ROTULO_ORIGEM[detalhe.provider] ?? "Cadastro externo")} ·{" "}
              {t("Score")} {detalhe.score}
              {detalhe.latitude !== null &&
                ` · ${detalhe.latitude.toFixed(4)}, ${detalhe.longitude?.toFixed(4)}`}
            </p>
            <p className="text-muted-foreground">
              {t("Status")}: {ROTULO_STATUS_COMERCIAL[detalhe.status_comercial]}
              {detalhe.ja_e_cliente ? ` · ${t("Cliente já cadastrado")}` : ""}
            </p>
            {detalhe.classificacao && (
              <p className="text-muted-foreground">
                {t("Situação")}: {t(ROTULO_CLASSIFICACAO[detalhe.classificacao])}
                {prioridadeAlta(detalhe.score) ? ` · ${t("Alta prioridade")}` : ""}
              </p>
            )}
            {/* §13: motivo da oportunidade — fato do prospect, não fórmula. */}
            <p className="text-xs text-muted-foreground">
              {detalhe.categoria ?? ""}
              {detalhe.cidade ? ` em ${detalhe.cidade}` : ""} ·{" "}
              {detalhe.ja_e_cliente ? t("já é cliente") : t("ainda não cadastrado como cliente")}
            </p>
            {!podeOperar && detalhe.proximo_passo && (
              <p className="text-xs text-muted-foreground">
                {t("Próxima ação")}: {detalhe.proximo_passo}
              </p>
            )}
            {/* §16: cada prospect da fila tem status, vendedor e próxima ação. */}
            {podeOperar && (
              <div className="space-y-2 border-t pt-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">{t("Status")}</span>
                  <select
                    className="h-9 w-full rounded-lg border bg-background px-3"
                    value={detalhe.status_comercial}
                    onChange={(e) => void mudarStatus(detalhe.id, e.target.value)}
                    aria-label={t("Status comercial")}
                  >
                    {STATUS_COMERCIAL.map((s) => (
                      <option key={s} value={s}>
                        {t(ROTULO_STATUS_COMERCIAL[s])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">{t("Vendedor")}</span>
                  <select
                    className="h-9 w-full rounded-lg border bg-background px-3"
                    value={detalhe.owner_user_id ?? ""}
                    onChange={(e) =>
                      void atualizarProspect(detalhe.id, { owner_user_id: e.target.value || null })
                    }
                    aria-label={t("Vendedor")}
                  >
                    <option value="">{t("Sem vendedor")}</option>
                    {detalhe.owner_user_id &&
                      !vendedores.some((v) => v.user_id === detalhe.owner_user_id) && (
                        <option value={detalhe.owner_user_id}>
                          {detalhe.owner_user_id.slice(0, 8)}…
                        </option>
                      )}
                    {vendedores.map((v) => (
                      <option key={v.user_id} value={v.user_id}>
                        {v.full_name ?? v.user_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <label className="block flex-1 text-sm">
                    <span className="mb-1 block text-muted-foreground">{t("Próxima ação")}</span>
                    <input
                      className="h-9 w-full rounded-lg border bg-background px-3"
                      value={
                        proximoRascunho?.id === detalhe.id
                          ? proximoRascunho.texto
                          : (detalhe.proximo_passo ?? "")
                      }
                      onChange={(e) =>
                        setProximoRascunho({ id: detalhe.id, texto: e.target.value })
                      }
                      placeholder={t("Ex.: ligar amanhã de manhã")}
                      maxLength={300}
                    />
                  </label>
                  {proximoRascunho?.id === detalhe.id &&
                    proximoRascunho.texto.trim() !== (detalhe.proximo_passo ?? "") && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await atualizarProspect(detalhe.id, {
                            proximo_passo: proximoRascunho.texto.trim() || null,
                          });
                          setProximoRascunho(null);
                        }}
                      >
                        {t("Salvar")}
                      </Button>
                    )}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {podeOperar && detalhe.telefone && (
              <Button size="sm" onClick={() => void iniciarConversa(detalhe)}>
                {t("Iniciar conversa")}
              </Button>
            )}
            {(() => {
              const zap = zapHref(detalhe);
              return zap ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={zap} target="_blank" rel="noopener noreferrer">
                    {t("WhatsApp")}
                  </a>
                </Button>
              ) : null;
            })()}
            {podeOperar && (
              <>
                {detalhe.owner_user_id !== usuarioId && (
                  <Button size="sm" onClick={() => void adicionarNaFila(detalhe.id)}>
                    {t("Adicionar à fila")}
                  </Button>
                )}
                <Button size="sm" onClick={() => void importar([detalhe.id])}>
                  {t("Adicionar ao CRM")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelecionados((s) => (s.includes(detalhe.id) ? s : [...s, detalhe.id]));
                    criarRota([...selecionados.filter((id) => id !== detalhe.id), detalhe.id]);
                  }}
                >
                  {t("Criar rota")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void excluir(detalhe.id, detalhe.nome)}
                >
                  {t("Excluir")}
                </Button>
                {detalhe.status_comercial !== "sem_interesse" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void ignorar(detalhe.id, detalhe.nome)}
                  >
                    {t("Ignorar")}
                  </Button>
                )}
              </>
            )}
            {detalhe.latitude !== null && (
              <Button size="sm" variant="outline" asChild>
                <a href={navegarHref(detalhe)} target="_blank" rel="noopener noreferrer">
                  {t("Ir até")}
                </a>
              </Button>
            )}
          </div>
        </ContextualDrawer>
      )}
      {podeOperar && (
        <ImportarArquivoDialog
          aberto={importandoArquivo}
          onFechar={() => setImportandoArquivo(false)}
          onImportado={() => void buscar(filtros, buscaId)}
        />
      )}
    </div>
  );
}
