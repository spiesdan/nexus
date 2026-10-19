"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { EmptyFilterResults, EmptyState } from "@/components/empty";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import {
  FilterActions,
  FilterChips,
  FilterNumber,
  SavedFilters,
  type ActiveChip,
} from "@/components/filters/FilterBar";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarBlank, MagnifyingGlass, Plus, Printer, Receipt, Storefront } from "@/lib/ui/icons";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { paraCSV } from "@/lib/comercial/relatorios";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { idsDoLote } from "@/lib/comercial/ids-do-lote";
import { chaveDoDia } from "@/lib/tempo/dia";
import { FUSO_PADRAO } from "@/lib/tempo/fusos";

import { FiltroPorPeriodo, hojeEmChave } from "./_periodo";
import {
  badgeDaOrigem,
  ROTULO_DO_STATUS,
  STATUS_DO_PEDIDO,
  type PedidoComercial,
  type StatusDoPedido,
} from "@/lib/schemas/pedidos";

import { PillDoStatus } from "./_pills";

interface Textos {
  titulo: string;
  subtitulo: string;
  vazio: string;
  vazioDica: string;
  novo: string;
  relatorios: string;
  todosStatus: string;
  todasOrigens: string;
  verPdf: string;
  baixarPdf: string;
  buscar: string;
  condicao: string;
  valorMin: string;
  valorMax: string;
  meus: string;
  salvarFiltro: string;
  nomeFiltro: string;
  statusLabel: string;
  avancados: string;
  limpar: string;
  salvos: string;
  excluir: string;
  tabela: string;
  quadro: string;
  cartoes: string;
  selecionarTodos: string;
  avancarSelecionados: string;
  aprovarSelecionados: string;
  cancelarSelecionados: string;
  excluirSelecionados: string;
  exportar: string;
  imprimirSelecionados: string;
  duplicar: string;
  historico: string;
  avancar: string;
  cancelar: string;
  verDetalhe: string;
}

interface Filtros {
  status: string;
  origem: string;
  busca: string;
  condicao: string;
  valorMin: string;
  valorMax: string;
  meus: boolean;
  /** Drill-down via URL (dashboard): janela e vendedor, sem UI própria. */
  de: string;
  ate: string;
  vendedorId: string;
}

/** Filtros que a página aceita via URL. */
export interface FiltrosIniciais {
  status: string;
  origem: string;
  vendedor: string;
  de: string;
  ate: string;
}

const FILTROS_VAZIOS: Filtros = {
  status: "",
  origem: "",
  busca: "",
  condicao: "",
  valorMin: "",
  valorMax: "",
  meus: false,
  de: "",
  ate: "",
  vendedorId: "",
};

const ROTULO_DA_ORIGEM: Record<string, string> = {
  ia: "IA",
  vendedor: "Vendedor",
  whatsapp: "WhatsApp",
  b2b: "B2B",
};

function temAvancado(f: Filtros): boolean {
  return Boolean(f.condicao.trim() || f.valorMin || f.valorMax || f.meus);
}

function contaAvancados(f: Filtros): number {
  return [f.condicao.trim(), f.valorMin, f.valorMax, f.meus ? "x" : ""].filter(Boolean).length;
}

const PROXIMO_STATUS: Partial<Record<StatusDoPedido, StatusDoPedido>> = {
  rascunho: "aprovado",
  em_analise: "aprovado",
  aprovado: "faturado",
  faturado: "expedido",
  expedido: "entregue",
};

const FINALIZADOS: StatusDoPedido[] = ["entregue", "cancelado"];

function TimelineDoPedido({ id }: { id: string }) {
  const tagIdioma = useTagDeIdioma();
  const [linhas, setLinhas] = React.useState<{ acao: string; por: string; em: string }[] | null>(
    null,
  );
  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: { acao: string; por: string; em: string }[] }>(
        `/api/v1/commercial-orders/${id}/timeline`,
      )
      .then((l) => {
        if (vivo) setLinhas(l.data ?? []);
      })
      .catch((e) => {
        if (vivo) showApiError(e);
      });
    return () => {
      vivo = false;
    };
  }, [id]);
  if (linhas === null) return <p className="text-xs text-muted-foreground">…</p>;
  if (linhas.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1 text-xs">
      {linhas.map((l, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-medium">{l.acao}</span>
          <span className="text-muted-foreground">
            {l.por} · {new Date(l.em).toLocaleString(tagIdioma)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PedidosClient({
  vendedorNome = "",
  inicial,
  iniciais,
  podeCriar,
  podeExcluir,
  meuId,
  textos,
}: {
  inicial: PedidoComercial[];
  iniciais: FiltrosIniciais;
  /**
   * Nome de quem o drill-down `?vendedor=<id>` está apontando.
   *
   * Vem do servidor e NÃO é derivado dos pedidos carregados: a lista já chega
   * filtrada por esse vendedor, e quando o filtro acha zero pedidos não há
   * linha de onde tirar o nome — que é quando o rótulo voltaria a ser
   * `a1b2c3d4`. Ver o comentário em `page.tsx`.
   */
  vendedorNome?: string;
  podeCriar: boolean;
  podeExcluir: boolean;
  meuId: string;
  textos: Textos;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [pedidos, setPedidos] = React.useState(inicial);
  const filtrosIniciais = React.useMemo<Filtros>(
    () => ({
      ...FILTROS_VAZIOS,
      status: iniciais.status,
      origem: iniciais.origem,
      vendedorId: iniciais.vendedor,
      de: iniciais.de,
      ate: iniciais.ate,
    }),
    [iniciais],
  );
  const [filtros, setFiltros] = React.useState<Filtros>(filtrosIniciais);
  /**
   * Como chamar o vendedor nos rótulos.
   *
   * Nome quando o servidor resolveu; os 8 primeiros do UUID só quando não
   * resolveu (usuário fora da equipe, ou filtro guardado antigo). Não há
   * terceira opção de despejar o UUID inteiro — 36 caracteres num rótulo de
   * filtro não é informação para quem opera.
   */
  const rotuloDoVendedor = React.useMemo(
    () => vendedorNome || filtros.vendedorId.slice(0, 8),
    [vendedorNome, filtros.vendedorId],
  );
  const [carregando, setCarregando] = React.useState(false);
  const [visao, setVisao] = React.useState<"tabela" | "quadro" | "cartoes">("cartoes");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [imprimindoDia, setImprimindoDia] = React.useState(false);
  const [expandido, setExpandido] = React.useState<string | null>(null);
  // Os filtros salvos vêm do `localStorage`, que não existe no servidor. Ler no
  // inicializador do `useState` fazia o HTML do SSR (sem filtro nenhum)
  // discordar do primeiro render do cliente (com os filtros) — erro #418. Depois
  // da hidratação é uma atualização de estado comum, sem mismatch.
  const [filtrosSalvos, setFiltrosSalvos] = React.useState<Record<string, Filtros>>({});
  React.useEffect(() => {
    try {
      const cru = window.localStorage.getItem("pedidos-filtros-salvos");
      if (!cru) return;
      const parsed = JSON.parse(cru) as Record<string, Partial<Filtros>>;
      // Salvos antigos não têm de/ate/vendedorId — completa com o vazio.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiltrosSalvos(
        Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, { ...FILTROS_VAZIOS, ...v }]),
        ),
      );
    } catch {
      // Cortesia, nunca erro.
    }
  }, []);
  const [avancadosAbertos, setAvancadosAbertos] = React.useState(() =>
    temAvancado(filtrosIniciais),
  );

  function gravarSalvos(prox: Record<string, Filtros>) {
    setFiltrosSalvos(prox);
    try {
      window.localStorage.setItem("pedidos-filtros-salvos", JSON.stringify(prox));
    } catch {
      // Cortesia, nunca erro.
    }
  }

  async function recarregar(f: Filtros) {
    setCarregando(true);
    try {
      const qs = new URLSearchParams();
      if (f.status) qs.set("status", f.status);
      if (f.origem) qs.set("origem", f.origem);
      if (f.busca.trim()) qs.set("busca", f.busca.trim());
      if (f.condicao.trim()) qs.set("condicao", f.condicao.trim());
      if (f.valorMin) qs.set("valor_min", f.valorMin);
      if (f.valorMax) qs.set("valor_max", f.valorMax);
      if (f.meus) qs.set("vendedor_user_id", meuId);
      if (f.vendedorId) qs.set("vendedor_user_id", f.vendedorId);
      if (f.de) qs.set("de", f.de);
      if (f.ate) qs.set("ate", f.ate);
      const corpo = await apiClient.get<{ data: unknown }>(
        `/api/v1/commercial-orders${qs.toString() ? `?${qs}` : ""}`,
      );
      const dados = (corpo as { data?: unknown } | null)?.data;
      setPedidos(Array.isArray(dados) ? dados : []);
      setSelecionados([]);
    } catch (e) {
      showApiError(e);
    } finally {
      setCarregando(false);
    }
  }

  // A busca no servidor espera 350ms parada: digitar não dispara request por
  // tecla. O campo reflete na hora; só o fetch é debounced.
  const recarregarDevagar = useDebouncedCallback((f: Filtros) => void recarregar(f), 350);

  function mudar(patch: Partial<Filtros>, devagar = false) {
    const f = { ...filtros, ...patch };
    setFiltros(f);
    if (devagar) recarregarDevagar(f);
    else void recarregar(f);
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
    setAvancadosAbertos(false);
    void recarregar(FILTROS_VAZIOS);
  }

  function aplicarSalvo(f: Filtros) {
    const completo = { ...FILTROS_VAZIOS, ...f };
    setFiltros(completo);
    setAvancadosAbertos(temAvancado(completo));
    void recarregar(completo);
  }

  const chips: ActiveChip[] = [];
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
      label: `${textos.statusLabel}: ${ROTULO_DO_STATUS[filtros.status as StatusDoPedido] ?? filtros.status}`,
      onRemove: () => mudar({ status: "" }),
    });
  }
  if (filtros.origem) {
    chips.push({
      key: "origem",
      label: `${t("Origem")}: ${ROTULO_DA_ORIGEM[filtros.origem] ?? filtros.origem}`,
      onRemove: () => mudar({ origem: "" }),
    });
  }
  if (filtros.condicao.trim()) {
    chips.push({
      key: "condicao",
      label: `${textos.condicao}: ${filtros.condicao.trim()}`,
      onRemove: () => mudar({ condicao: "" }),
    });
  }
  if (filtros.valorMin) {
    chips.push({
      key: "valorMin",
      label: `${textos.valorMin}: ${filtros.valorMin}`,
      onRemove: () => mudar({ valorMin: "" }),
    });
  }
  if (filtros.valorMax) {
    chips.push({
      key: "valorMax",
      label: `${textos.valorMax}: ${filtros.valorMax}`,
      onRemove: () => mudar({ valorMax: "" }),
    });
  }
  if (filtros.meus) {
    chips.push({ key: "meus", label: textos.meus, onRemove: () => mudar({ meus: false }) });
  }
  if (filtros.vendedorId) {
    chips.push({
      key: "vendedor",
      label: `${t("Vendedor")}: ${rotuloDoVendedor}`,
      onRemove: () => mudar({ vendedorId: "" }),
    });
  }
  if (filtros.de || filtros.ate) {
    const rotulo = `${(filtros.de || "…").slice(0, 10)} – ${(filtros.ate || "…").slice(0, 10)}`;
    chips.push({ key: "periodo", label: rotulo, onRemove: () => mudar({ de: "", ate: "" }) });
  }

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function mudarStatus(id: string, status: StatusDoPedido) {
    try {
      await apiClient.patch(`/api/v1/commercial-orders/${id}`, { status });
      await recarregar(filtros);
    } catch (e) {
      showApiError(e);
    }
  }

  async function duplicar(id: string) {
    try {
      const corpo = await apiClient.post<{ data: { numero: number } | null }>(
        `/api/v1/commercial-orders/${id}/duplicar`,
        {},
      );
      const novo = corpo?.data;
      if (!novo) throw new Error(t("O servidor não devolveu o pedido duplicado."));
      toast.success(`${t("Duplicado como")} ${numeroDoPedido(novo.numero)}`);
      await recarregar(filtros);
    } catch (e) {
      showApiError(e);
    }
  }

  async function aprovarEmMassa() {
    const alvos = pedidos.filter((p) => selecionados.includes(p.id) && p.status === "em_analise");
    let ok = 0;
    for (const p of alvos) {
      try {
        await apiClient.patch(`/api/v1/commercial-orders/${p.id}`, { status: "aprovado" });
        ok++;
      } catch (e) {
        showApiError(e);
      }
    }
    toast.success(t(`${ok} de ${alvos.length} aprovados`));
    await recarregar(filtros);
  }

  async function avancarEmMassa() {
    const alvos = pedidos.filter(
      (p) =>
        selecionados.includes(p.id) &&
        PROXIMO_STATUS[p.status as StatusDoPedido] &&
        !(FINALIZADOS as string[]).includes(p.status),
    );
    let ok = 0;
    for (const p of alvos) {
      try {
        await apiClient.patch(`/api/v1/commercial-orders/${p.id}`, {
          status: PROXIMO_STATUS[p.status as StatusDoPedido],
        });
        ok++;
      } catch (e) {
        showApiError(e);
      }
    }
    toast.success(t(`${ok} de ${alvos.length} avançados`));
    await recarregar(filtros);
  }

  async function cancelarEmMassa() {
    const alvos = pedidos.filter(
      (p) => selecionados.includes(p.id) && !(FINALIZADOS as string[]).includes(p.status),
    );
    for (const p of alvos) {
      try {
        await apiClient.patch(`/api/v1/commercial-orders/${p.id}`, { status: "cancelado" });
      } catch (e) {
        showApiError(e);
      }
    }
    await recarregar(filtros);
  }

  async function excluirEmMassa() {
    const alvos = pedidos.filter((p) => selecionados.includes(p.id));
    const confirmado = await confirmar({
      title: t(
        `Excluir ${alvos.length} pedido(s)? Estoque baixado volta. Com NF ou em carga, o pedido é pulado com aviso.`,
      ),
      confirmLabel: t("Excluir"),
    });
    if (!confirmado) {
      return;
    }
    let ok = 0;
    for (const p of alvos) {
      try {
        await apiClient.delete(`/api/v1/commercial-orders/${p.id}`);
        ok++;
      } catch (e) {
        showApiError(e);
      }
    }
    toast.success(t(`${ok} de ${alvos.length} excluídos`));
    await recarregar(filtros);
  }

  function exportar() {
    const alvo = pedidos.filter((p) => selecionados.length === 0 || selecionados.includes(p.id));
    const blob = new Blob(
      [
        "\uFEFF" +
          paraCSV(
            ["Número", "Cliente", "Data", "Total (R$)", "Status", "Origem"],
            alvo.map((p) => [
              numeroDoPedido(p.numero),
              p.cliente_nome,
              new Date(p.created_at).toLocaleDateString(tagIdioma),
              (p.total_cents / 100).toLocaleString(tagIdioma, { minimumFractionDigits: 2 }),
              ROTULO_DO_STATUS[p.status as StatusDoPedido] ?? p.status,
              p.origem,
            ]),
          ),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pedidos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // O que o botão de imprimir realmente leva. O teto vem de `idsDoLote` /
  // `MAXIMO_PEDIDOS_NO_LOTE` — a MESMA regra que a página de impressão e a rota
  // de PDF aplicam, importada de lá em vez de repetida como um `50` solto.
  // Repetir o número é como as duas pontas divergem: um dia o teto sobe para 60
  // e a tela continua mandando 50, sem erro nenhum.
  const idsDoLoteImpresso = React.useMemo(
    () =>
      selecionados.length > 0 ? selecionados : idsDoLote(pedidos.map((x) => x.id).join(",")),
    [selecionados, pedidos],
  );

  /**
   * Imprime TODOS os pedidos do dia, num clique só.
   *
   * O botão "Imprimir pedidos" imprime o que a lista mostra (seleção ou os
   * 50 primeiros do filtro). Este zera o filtro para o dia e busca os ids
   * direto na API — porque a lista na tela pode estar paginada ou filtrada,
   * e o "todos do dia" não pode depender do que por acaso está visível.
   *
   * Dia = `YYYY-MM-DD` local, o mesmo dos atalhos e do agrupamento "Hoje".
   */
  async function imprimirODia(): Promise<void> {
    const hoje = hojeEmChave();
    setImprimindoDia(true);
    try {
      const qs = new URLSearchParams({ de: hoje, ate: hoje });
      const corpo = await apiClient.get<{ data: unknown }>(
        `/api/v1/commercial-orders?${qs.toString()}`,
      );
      const dados = (corpo as { data?: unknown } | null)?.data;
      const lista = Array.isArray(dados) ? (dados as { id: string }[]) : [];
      if (lista.length === 0) {
        toast.info(t("Nenhum pedido hoje."));
        return;
      }
      // A tela passa a mostrar o dia impresso — o que sai no papel é o que
      // fica na tela, sem surpresa.
      mudar({ ...FILTROS_VAZIOS, de: hoje, ate: hoje });
      const ids = idsDoLote(lista.map((x) => x.id).join(","));
      if (ids.length < lista.length) {
        toast.warning(
          t("O dia tem {total} pedidos; o impresso leva os 50 mais recentes.").replace(
            "{total}",
            String(lista.length),
          ),
        );
      }
      router.push(`/app/pedidos/imprimir?ids=${ids.join(",")}`);
    } catch (e) {
      showApiError(e);
    } finally {
      setImprimindoDia(false);
    }
  }

  const porStatus = React.useMemo(() => {
    const mapa = new Map<StatusDoPedido, PedidoComercial[]>();
    for (const s of STATUS_DO_PEDIDO) mapa.set(s, []);
    for (const p of pedidos) {
      const lista = mapa.get(p.status as StatusDoPedido) ?? [];
      lista.push(p);
      mapa.set(p.status as StatusDoPedido, lista);
    }
    return mapa;
  }, [pedidos]);

  /** Cartões agrupados por dia, como no Mercos (ONTEM, SEXTA-FEIRA, 04/09…). */
  const porDia = React.useMemo(() => {
    const grupos = new Map<string, { chave: string; rotulo: string; itens: PedidoComercial[] }>();
    // A chave do dia sai de `chaveDoDia`, que lê o fuso da ORGANIZAÇÃO — e não
    // de `getFullYear()/getMonth()/getDate()`, que leem o fuso do runtime e
    // faziam o servidor (UTC) e o navegador (UTC−3) discordarem na hidratação.
    const hoje = new Date();
    const hojeChave = chaveDoDia(hoje);
    const ontemChave = chaveDoDia(new Date(hoje.getTime() - 86400000));
    for (const p of pedidos) {
      const d = new Date(p.created_at);
      const chave = chaveDoDia(d);
      let rotulo: string;
      // Pedido sem data válida: grupo próprio, com nome, e no FIM da lista (a
      // chave vazia é a menor em ordem decrescente). Sem este ramo a tela
      // imprimia "INVALID DATE" no cabeçalho — quando o `chaveDoDia` devolvia
      // data inventada, a tela nem chegava a renderizar.
      if (chave === "") rotulo = t("Sem data");
      else if (chave === hojeChave) rotulo = t("Hoje");
      else if (chave === ontemChave) rotulo = t("Ontem");
      else
        rotulo = d
          .toLocaleDateString(tagIdioma, {
            timeZone: FUSO_PADRAO,
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
          .toUpperCase();
      const g = grupos.get(chave) ?? { chave, rotulo, itens: [] };
      g.itens.push(p);
      grupos.set(chave, g);
    }
    return [...grupos.values()].sort((a, b) => (a.chave < b.chave ? 1 : -1));
  }, [pedidos, tagIdioma, t]);

  return (
    <div className="min-h-full space-y-3 p-4 sm:p-6">
      <NexusPageHeader
        title={textos.titulo}
        subtitle={textos.subtitulo}
        actions={
          <>
            <Button
              variant="outline"
              className="w-full bg-surface sm:w-auto"
              disabled={imprimindoDia}
              onClick={() => void imprimirODia()}
              title={t("Filtra o dia de hoje e imprime todos os pedidos dele.")}
            >
              <Printer size={16} /> {imprimindoDia ? t("Buscando o dia…") : t("Imprimir o dia")}
            </Button>
            {podeCriar && (
              <Button asChild className="w-full font-semibold sm:w-auto">
                <Link href="/app/pedidos/novo">
                  <Plus size={16} weight="bold" /> {t("Criar pedido / orçamento")}
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild className="w-full bg-surface sm:w-auto">
              <Link
                href={
                  selecionados.length > 0
                    ? `/app/pedidos/imprimir?ids=${selecionados.join(",")}`
                    : `/app/pedidos/imprimir?ids=${idsDoLoteImpresso.join(",")}`
                }
                // O teto de 50 é deliberado (`lib/comercial/ids-do-lote.ts`) —
                // um PDF com 50 páginas fecha; 500 não. Mas um teto mudo é pior
                // que a falta dele: o dono pede "os pedidos do dia", recebe 50
                // e não tem como saber que 30 ficaram de fora. O `title` diz
                // antes do clique.
                title={
                  selecionados.length === 0 && idsDoLoteImpresso.length < pedidos.length
                    ? t(
                        "Vai imprimir os 50 pedidos mais recentes de {total}. Para o resto, marque-os e imprima de novo.",
                      ).replace("{total}", String(pedidos.length))
                    : undefined
                }
              >
                <Printer size={16} /> {t("Imprimir pedidos")}
              </Link>
            </Button>
            {selecionados.length === 0 && idsDoLoteImpresso.length < pedidos.length && (
              <span className="text-xs text-muted-foreground">
                {t("imprimindo os 50 mais recentes de")} <strong>{pedidos.length}</strong>
              </span>
            )}
          </>
        }
      />

      {/* Filtros: um painel só, com rótulo em cada controle. Antes eram quatro
        zonas espalhadas (busca solta + frase com selects + chips + avançados),
        e no meio um select "Envio" que não filtrava nada — controle morto que
        mente é pior que controle ausente. A frase ("Mostrando X feitos por Y")
        economizava pixels e cobrava legibilidade: 13px, sem rótulo, embrulhando
        mal no mobile. Comportamento 100% preservado; só o layout mudou. */}
      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex">
          <Input
            value={filtros.busca}
            onChange={(e) => mudar({ busca: e.target.value }, true)}
            placeholder={t("Pedido, cliente ou representada")}
            aria-label={textos.buscar}
            className="h-9 w-full rounded-r-none bg-surface sm:max-w-md"
          />
          <Button
            type="button"
            variant="outline"
            aria-label={textos.buscar}
            className="rounded-l-none border-l-0 bg-surface"
            onClick={() => void recarregar(filtros)}
          >
            <MagnifyingGlass size={16} />
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="space-y-1">
            <Label htmlFor="f-status">{textos.statusLabel}</Label>
            <select
              id="f-status"
              value={filtros.status}
              onChange={(e) => mudar({ status: e.target.value })}
              className="h-9 cursor-pointer rounded-md border border-input bg-surface px-2 text-sm font-medium"
            >
              <option value="">{t("Pedidos ativos")}</option>
              {STATUS_DO_PEDIDO.map((st) => (
                <option key={st} value={st}>
                  {ROTULO_DO_STATUS[st]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-vendedor">{t("Vendedor")}</Label>
            <select
              id="f-vendedor"
              value={filtros.meus ? "meus" : filtros.vendedorId || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "meus") mudar({ meus: true, vendedorId: "" });
                else if (v === "") mudar({ meus: false, vendedorId: "" });
                else mudar({ meus: false, vendedorId: v });
              }}
              className="h-9 cursor-pointer rounded-md border border-input bg-surface px-2 text-sm font-medium"
            >
              <option value="">{t("Todos os vendedores")}</option>
              <option value="meus">{textos.meus}</option>
              {filtros.vendedorId && !filtros.meus && (
                <option value={filtros.vendedorId}>{rotuloDoVendedor}</option>
              )}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-origem">{t("Origem")}</Label>
            <select
              id="f-origem"
              value={filtros.origem}
              onChange={(e) => mudar({ origem: e.target.value })}
              className="h-9 cursor-pointer rounded-md border border-input bg-surface px-2 text-sm font-medium"
            >
              <option value="">{t("Todas as plataformas")}</option>
              {Object.entries(ROTULO_DA_ORIGEM).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {/*
            PERÍODO. Fica na linha dos outros filtros porque é um filtro como
            qualquer outro — e não dentro dos "avançados", porque o pedido mais
            comum desta tela é "os pedidos de hoje", e quem procura coisa comum
            dentro do que está marcado como avançado não encontra.

            Um dia em `de` e `ate` é o que o botão de atalho preenche. A conversão
            para instante UTC é do servidor, no fuso de quem pediu
            (`lib/comercial/janela-do-dia.ts`) — aqui a data vai crua.
          */}
          <div className="space-y-1">
            <span className="block text-sm font-medium">{t("Período")}</span>
            <FiltroPorPeriodo
              de={filtros.de}
              ate={filtros.ate}
              aoMudar={(patch) => mudar(patch)}
            />
          </div>
        </div>

        <FilterChips chips={chips} onClearAll={limparFiltros} clearLabel={textos.limpar} />
      </Card>

        {/* Avancados + salvos + troca de visao (colapsado para nao poluir o molde) */}
        <div className="flex flex-wrap items-center gap-2">
          <details open={avancadosAbertos} className="text-sm">
            <summary className="cursor-pointer text-xs text-accent hover:underline">
              {textos.avancados}
              {contaAvancados(filtros) > 0 ? ` (${contaAvancados(filtros)})` : ""}
            </summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="w-full space-y-1.5 sm:w-44">
                <label className="block text-sm font-medium" htmlFor="f-condicao">
                  {textos.condicao}
                </label>
                <Input
                  id="f-condicao"
                  value={filtros.condicao}
                  onChange={(e) => mudar({ condicao: e.target.value }, true)}
                  placeholder="30/60"
                  className="h-9 bg-surface"
                />
              </div>
              <FilterNumber
                id="f-vmin"
                label={textos.valorMin}
                value={filtros.valorMin}
                onChange={(valorMin) => mudar({ valorMin })}
                placeholder="0,00"
              />
              <FilterNumber
                id="f-vmax"
                label={textos.valorMax}
                value={filtros.valorMax}
                onChange={(valorMax) => mudar({ valorMax })}
                placeholder="0,00"
              />
            </div>
          </details>
        <FilterActions>
          <SavedFilters
            names={Object.keys(filtrosSalvos)}
            onApply={(nome) => {
              const f = filtrosSalvos[nome];
              if (f) aplicarSalvo(f);
            }}
            onSave={(nome) => gravarSalvos({ ...filtrosSalvos, [nome]: filtros })}
            onRemove={(nome) => {
              const prox = { ...filtrosSalvos };
              delete prox[nome];
              gravarSalvos(prox);
            }}
            texts={{
              savePlaceholder: textos.nomeFiltro,
              saveButton: textos.salvarFiltro,
              applyPlaceholder: textos.salvos,
              removeLabel: textos.excluir,
            }}
          />
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant={visao === "cartoes" ? "default" : "outline"}
              onClick={() => setVisao("cartoes")}
            >
              {textos.cartoes}
            </Button>
            <Button
              size="sm"
              variant={visao === "tabela" ? "default" : "outline"}
              onClick={() => setVisao("tabela")}
            >
              {textos.tabela}
            </Button>
            <Button
              size="sm"
              variant={visao === "quadro" ? "default" : "outline"}
              onClick={() => setVisao("quadro")}
            >
              {textos.quadro}
            </Button>
          </div>
        </FilterActions>
      </div>

      {/* Barra de massa */}
      {podeCriar && selecionados.length > 0 && (
        <Card className="hover-raise flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="text-muted-foreground">
            {selecionados.length} {t("selecionados")}
          </span>
          <Button size="sm" onClick={() => void avancarEmMassa()}>
            {textos.avancarSelecionados}
          </Button>
          <Button size="sm" onClick={aprovarEmMassa}>
            {textos.aprovarSelecionados}
          </Button>
          <Button size="sm" variant="outline" onClick={cancelarEmMassa}>
            {textos.cancelarSelecionados}
          </Button>
          {podeExcluir && (
            <Button size="sm" variant="destructive" onClick={() => void excluirEmMassa()}>
              {textos.excluirSelecionados}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportar}>
            {textos.exportar}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/pedidos/imprimir?ids=${selecionados.join(",")}`}>
              {textos.imprimirSelecionados}
            </Link>
          </Button>
        </Card>
      )}

      {carregando ? (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : pedidos.length === 0 && chips.length > 0 ? (
        <EmptyFilterResults primary={{ label: textos.limpar, onClick: limparFiltros }} />
      ) : pedidos.length === 0 ? (
        <EmptyState
          icon={Receipt}
          headline={textos.vazio}
          subcopy={textos.vazioDica}
          primary={podeCriar ? { label: textos.novo, href: "/app/pedidos/novo" } : undefined}
        />
      ) : visao === "cartoes" ? (
        <div className="space-y-5">
          {porDia.map((g) => (
            <section key={g.chave} aria-label={g.rotulo}>
              <p className="mb-2 text-[13px] font-normal tracking-wide text-text-subtle uppercase">
                {g.rotulo.toUpperCase()}
              </p>
              <div className="space-y-3">
                {g.itens.map((p) => {
                  // Quem EMITIU (created_by) antes do badge de origem: o
                  // rótulo "Vendedor" dizia a procedência, não a pessoa.
                  const emissor = p.emitente_nome ?? ROTULO_DA_ORIGEM[p.origem] ?? p.origem;
                  const segundaLinha = p.cliente_documento || badgeDaOrigem(p.origem).rotulo;
                  return (
                    <article
                      key={p.id}
                      className="overflow-hidden rounded-xl border border-border fill-well"
                    >
                      <div className="flex items-center justify-between gap-2 bg-stage-2 px-3 py-2">
                        <p className="flex min-w-0 items-center gap-2 text-[13px]">
                          {podeCriar && (
                            <input
                              type="checkbox"
                              checked={selecionados.includes(p.id)}
                              onChange={() => alternar(p.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={numeroDoPedido(p.numero)}
                            />
                          )}
                          <span className="truncate">
                            <Link
                              href={`/app/pedidos/${p.id}`}
                              className="font-bold text-accent hover:underline"
                            >
                              {numeroDoPedido(p.numero)}
                            </Link>{" "}
                            <span className="text-muted-foreground">
                              {t("emitido por")} {emissor}
                            </span>
                          </span>
                        </p>
                        <PillDoStatus status={p.status as StatusDoPedido} />
                      </div>
                      <Link
                        href={`/app/pedidos/${p.id}`}
                        className="block space-y-1 px-3 py-2.5 text-[13px] leading-5 text-text"
                      >
                        <span className="flex items-center gap-1.5">
                          <Storefront size={13} className="shrink-0 text-text-subtle" />
                          <span className="truncate font-medium uppercase">{p.cliente_nome}</span>
                        </span>
                        {segundaLinha && (
                          <span className="block truncate pl-5 text-muted-foreground">
                            {segundaLinha}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarBlank size={13} className="shrink-0 text-text-subtle" />
                          <span className="truncate uppercase">{p.condicao_pagamento || "—"}</span>
                        </span>
                        <span className="block pl-5 font-bold text-text">
                          {comoMoeda(p.total_cents, p.moeda)}
                        </span>
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : visao === "quadro" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_DO_PEDIDO.map((s) => (
            <div key={s} className="w-64 shrink-0 rounded-lg border bg-muted/30 p-2">
              <p className="mb-2 px-1 text-sm font-medium text-text">
                {ROTULO_DO_STATUS[s]} ({porStatus.get(s)?.length ?? 0})
              </p>
              <div className="space-y-2">
                {(porStatus.get(s) ?? []).map((p) => (
                  <Card key={p.id} className="p-3">
                    <p className="text-sm font-medium">{numeroDoPedido(p.numero)}</p>
                    <p className="truncate text-sm">{p.cliente_nome}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {comoMoeda(p.total_cents, p.moeda)}
                    </p>
                    {podeCriar && PROXIMO_STATUS[p.status as StatusDoPedido] && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() =>
                          void mudarStatus(p.id, PROXIMO_STATUS[p.status as StatusDoPedido]!)
                        }
                      >
                        {textos.avancar} →
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border fill-well">
          <Table>
            <TableHeader>
              <TableRow className="bg-stage-2/60 hover:bg-stage-2/60">
                {podeCriar && (
                  <TableHead className="px-3">
                    <input
                      type="checkbox"
                      checked={selecionados.length === pedidos.length && pedidos.length > 0}
                      onChange={(e) =>
                        setSelecionados(e.target.checked ? pedidos.map((p) => p.id) : [])
                      }
                      aria-label={textos.selecionarTodos}
                    />
                  </TableHead>
                )}
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead>{textos.verDetalhe}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.map((p) => {
                const badge = badgeDaOrigem(p.origem);
                const aberto = expandido === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <TableRow className="row-hover">
                      {podeCriar && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selecionados.includes(p.id)}
                            onChange={() => alternar(p.id)}
                            aria-label={numeroDoPedido(p.numero)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{numeroDoPedido(p.numero)}</TableCell>
                      <TableCell>{p.cliente_nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString(tagIdioma, {
                          timeZone: FUSO_PADRAO,
                        })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {comoMoeda(p.total_cents, p.moeda)}
                      </TableCell>
                      <TableCell>
                        <PillDoStatus status={p.status as StatusDoPedido} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classe}`}
                        >
                          {badge.rotulo}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/api/v1/commercial-orders/${p.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4"
                        >
                          {textos.verPdf}
                        </Link>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <Link
                          href={`/api/v1/commercial-orders/${p.id}/pdf?destino=baixar`}
                          className="underline underline-offset-4"
                        >
                          {textos.baixarPdf}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          onClick={() => setExpandido(aberto ? null : p.id)}
                        >
                          {aberto ? "−" : "+"}
                        </button>
                        {podeCriar && (
                          <>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <button
                              type="button"
                              className="underline underline-offset-4"
                              onClick={() => void duplicar(p.id)}
                            >
                              {textos.duplicar}
                            </button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={podeCriar ? 9 : 8}>
                          <TimelineDoPedido id={p.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pedidos.length > 0 && (
        <Button size="sm" variant="outline" onClick={exportar}>
          {textos.exportar} (CSV)
        </Button>
      )}
    </div>
  );
}
