"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { EmptyFilterResults } from "@/components/empty";
import {
  FilterActions,
  FilterBar,
  FilterPrimary,
  FilterSearch,
} from "@/components/filters/FilterBar";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { Boxes, Eye, EyeOff, ImageUp, Plus, Star, Table2 } from "lucide-react";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import type { CandidatoDeNcm } from "@/lib/catalogo/sugerir-ncm";
import { janelaDePaginas, totalDePaginas, urlDoCatalogo } from "@/lib/catalogo/paginacao";
import { comoMoeda } from "@/lib/format/moeda";
import type { Categoria, TabelaDePreco } from "@/lib/schemas/precos";
import {
  numeroDecimal,
  numeroParaTexto,
  pctParaNumero,
  precoDeVitrine,
  precoParaCentavos,
  type OrigemDoNcm,
  type Produto,
} from "@/lib/schemas/produtos";

import {
  FichaDoProduto,
  RASCUNHO_VAZIO,
  listaDeTexto,
  textoDeLista,
  type Rascunho,
} from "./_ficha";
import { FotosDoProduto, type Foto } from "./_fotos";

/**
 * Array vazio ESTÁVEL, para o produto que não tem foto.
 *
 * `fotosPorProduto[p.id] ?? []` cria um array NOVO a cada render — e o
 * `FotosDoProduto` tem `useEffect(..., [fotosIniciais])`, que compara
 * IDENTIDADE. O efeito então dispara a cada render do pai e chama `setFotos`,
 * o que renderiza o filho de novo.
 *
 * Medido nesta instalação: 641 produtos, e a imensa maioria sem foto. Abrir a
 * edição de um produto re-renderiza o pai, e os 641 filhos faziam o ciclo
 * inteiro de novo. Uma constante resolve sem tocar no filho: é a mesma
 * referência sempre, e o efeito não tem o queComparar.
 */
const FOTOS_NENHUMA: Foto[] = [];

interface Textos {
  titulo: string;
  subtitulo: string;
  vazio: string;
  vazioDica: string;
}

interface ResumoDaImportacao {
  total_linhas: number;
  criados: number;
  atualizados: number;
  erros: Array<{ linha: number; motivo: string }>;
  colunas_ignoradas: string[];
}

/** O formulário e o formulário vazio vivem em `_ficha.tsx` — um só, para os dois lados. */
const VAZIO: Rascunho = RASCUNHO_VAZIO;

/**
 * O NCM que a busca devolveu, ou `null`.
 *
 * Só serve enquanto o campo continua VAZIO: se a pessoa digitar antes da
 * resposta chegar, o valor dela ganha (a busca nunca sobrescreve o que já
 * está escrito) — a guarda está em `rascunhoRef`/`rascunhoEdicaoRef`.
 */
async function buscarSugestaoDeNcm(nome: string): Promise<CandidatoDeNcm | null> {
  try {
    const corpo = await apiClient.get<{ data: { sugestao: CandidatoDeNcm | null } | null }>(
      `/api/v1/products/ncm-sugestao?nome=${encodeURIComponent(nome)}`,
    );
    return corpo?.data?.sugestao ?? null;
  } catch {
    // Sem tabela IBPT importada, sem rede, sem permissão: a tela não muda.
    return null;
  }
}

function doRascunho(
  r: Rascunho,
  t: (s: string) => string,
  origemDoNcm: OrigemDoNcm | null,
): Record<string, unknown> | { erro: string } {
  const preco_cents = precoParaCentavos(r.preco);
  if (preco_cents === null) return { erro: t("Preço inválido. Escreva assim: 5.499,00") };
  const custo_cents = r.custo.trim() === "" ? null : precoParaCentavos(r.custo);
  if (r.custo.trim() !== "" && custo_cents === null) return { erro: t("Custo inválido.") };

  const ncm = r.ncm.replace(/\D/g, "");
  if (ncm !== "" && !/^\d{8}$/.test(ncm)) return { erro: t("NCM tem 8 dígitos (só números).") };

  // 0275 — percentuais e dimensões. Vazio é `null` (não informado), e não 0:
  // "isento de IPI" e "ninguém preencheu" são coisas diferentes na nota.
  // Texto que não é número é ERRO, não null silencioso — a pessoa digitou algo.
  const percentual = (texto: string, rotulo: string): number | null => {
    const limpo = texto.trim();
    if (limpo === "") return null;
    const n = pctParaNumero(limpo);
    if (n === null || n < 0 || n > 100) {
      throw new Error(t(`${rotulo} inválido: use um número de 0 a 100.`));
    }
    return n;
  };

  const pesos: Record<string, number | null> = {};
  let ipi_pct: number | null = null;
  let comissao_pct: number | null = null;
  try {
    ipi_pct = percentual(r.ipi, t("IPI"));
    comissao_pct = percentual(r.comissao, t("Comissão"));
    const dimensoes: Array<[string, string, string]> = [
      ["peso_bruto_kg", r.pesoBruto, t("Peso bruto")],
      ["largura_cm", r.largura, t("Largura")],
      ["altura_cm", r.altura, t("Altura")],
      ["comprimento_cm", r.comprimento, t("Comprimento")],
      ["caixa_peso_bruto_kg", r.caixaPeso, t("Peso da caixa")],
      ["caixa_largura_cm", r.caixaLargura, t("Largura da caixa")],
      ["caixa_altura_cm", r.caixaAltura, t("Altura da caixa")],
      ["caixa_comprimento_cm", r.caixaComprimento, t("Comprimento da caixa")],
    ];
    for (const [campo, texto, rotulo] of dimensoes) {
      if (texto.trim() === "") {
        pesos[campo] = null;
        continue;
      }
      const n = numeroDecimal(texto);
      if (n === null || n < 0) throw new Error(t(`${rotulo} inválido.`));
      pesos[campo] = n;
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : t("Número inválido.") };
  }

  // Cores e tamanhos: lista curta e aberta. Sem nada, `null` (produto simples).
  const cores = listaDeTexto(r.cores);
  const tamanhos = listaDeTexto(r.tamanhos);
  const variacoes = cores.length > 0 || tamanhos.length > 0 ? { cores, tamanhos } : null;

  const multiplo = Math.trunc(Number(r.multiplo) || 1);
  if (multiplo < 1) return { erro: t("Venda em múltiplos de: mínimo 1.") };

  let promo: Record<string, unknown> = {};
  if (r.emPromocao) {
    const promoCents = precoParaCentavos(r.precoPromocional);
    if (promoCents === null) return { erro: t("Preço promocional inválido.") };
    if (r.promocaoAte.trim() !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(r.promocaoAte.trim())) {
      return { erro: t("Validade da promoção usa AAAA-MM-DD.") };
    }
    promo = {
      preco_promocional_cents: promoCents,
      ...(r.promocaoAte.trim() ? { promocao_ate: r.promocaoAte.trim() } : { promocao_ate: null }),
    };
  } else {
    promo = { preco_promocional_cents: null, promocao_ate: null };
  }

  return {
    codigo: r.codigo.trim(),
    nome: r.nome.trim(),
    ...(r.marca.trim() ? { marca: r.marca.trim() } : {}),
    ...(r.categoria.trim() ? { categoria: r.categoria.trim() } : {}),
    moeda: r.moeda || "BRL",
    preco_cents,
    custo_cents,
    controla_estoque: r.controla_estoque,
    quantidade: Number(r.quantidade) || 0,
    destaque: r.destaque,
    ...promo,
    // 0256: a origem do NCM viaja junto (sugerido x manual). Sem NCM não há
    // origem a dizer — a coluna fica NULL, como numa linha anterior à 0256.
    ...(ncm !== "" ? { ncm, ncm_origem: origemDoNcm } : {}),
    ...(r.unidade.trim() ? { unidade: r.unidade.trim().toUpperCase().slice(0, 10) } : {}),
    ipi_pct,
    comissao_pct,
    multiplo,
    observacoes: r.observacoes.trim() === "" ? null : r.observacoes.trim(),
    ...pesos,
    variacoes,
  };
}


/** "70,00 %" — ou "---", como o Mercos mostra quando não há valor. */
function comoPorcentagem(n: number | null): string {
  if (n == null) return "---";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/**
 * O "+" da coluna "Preço de Tabela" (no Mercos: "Adicionar preço").
 *
 * ⚠️ A rota de itens é PUT que TROCA o conjunto inteiro. Mandar só o produto
 * novo apagaria todos os outros da tabela — por isso lemos a tabela antes e
 * reenviamos a lista completa. É a diferença entre "adicionar" e "substituir
 * tudo por um item".
 */
function AdicionarATabela({
  produto,
  tabelas,
}: {
  produto: Produto;
  tabelas: TabelaDePreco[];
}) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [salvando, setSalvando] = React.useState<string | null>(null);

  async function adicionar(tabela: TabelaDePreco) {
    setSalvando(tabela.id);
    try {
      const atual = await apiClient.get<{
        data: { itens?: Array<{ product_id: string; preco_cents: number | null }> };
      }>(`/api/v1/price-tables/${tabela.id}`);
      const itens = atual?.data?.itens ?? [];
      if (itens.some((i) => i.product_id === produto.id)) {
        toast.success(t(`Já está em ${tabela.nome}`));
        setAberto(false);
        return;
      }
      await apiClient.put(`/api/v1/price-tables/${tabela.id}/items`, {
        itens: [
          ...itens.map((i) => ({ product_id: i.product_id, preco_cents: i.preco_cents })),
          // `null` = usa o desconto padrão da tabela (ver `lib/schemas/precos.ts`).
          { product_id: produto.id, preco_cents: null },
        ],
      });
      toast.success(t(`Adicionado em ${tabela.nome}`));
      setAberto(false);
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(null);
    }
  }

  if (tabelas.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" title={t("Nenhuma tabela de preço cadastrada")}>
        +
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("Adicionar a uma tabela de preço")}
        aria-expanded={aberto}
        data-testid={`add-tabela-${produto.codigo}`}
        onClick={() => setAberto((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
      {aberto ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-popover p-1 shadow-md">
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("Adicionar em")}</p>
          {tabelas.map((tabela) => (
            <button
              key={tabela.id}
              type="button"
              disabled={salvando !== null}
              onClick={() => void adicionar(tabela)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              {salvando === tabela.id ? t("Salvando…") : tabela.nome}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProdutosClient({
  inicial,
  fotosIniciais = {},
  podeEditar,
  textos,
  /**
   * Embutido nas abas do catálogo: pula o contêiner e o cabeçalho próprios,
   * que a concha das abas já provê. Default mantém o comportamento atual —
   * nenhuma tela existente muda.
   */
  esconderCabecalho,
  /**
   * Termo que veio na URL (`/app/products?busca=`), o caminho de quem clicou
   * num produto na busca global (§17): o campo já nasce com o que a pessoa
   * digitou, em vez de pedir para digitar de novo na lista inteira.
   */
  buscaInicial,
  semFotoInicial,
  categoriaInicial,
  statusInicial,
  promoInicial,
  destaqueInicial,
  total,
  pagina,
  porPagina,
  categorias = [],
  tabelas = [],
}: {
  inicial: Produto[];
  /**
   * Fotos prontas, montadas pelo servidor e chegam no HTML inicial. Sem isto a
   * coluna aparecia vazia e preenchia depois — ver o bloco `fotosPorProduto`.
   */
  fotosIniciais?: Record<string, Foto[]>;
  podeEditar: boolean;
  textos: Textos;
  esconderCabecalho?: boolean;
  buscaInicial?: string;
  /** Aba ativa vinda da URL (`?sem_foto=1`): filtra no SERVIDOR, não na página. */
  semFotoInicial?: boolean;
  /** Categoria escolhida na barra (`?categoria=`), do SERVIDOR. */
  categoriaInicial?: string;
  /** Situação (`?status=ativos|inativos`), do SERVIDOR. Default: todos. */
  statusInicial?: "todos" | "ativos" | "inativos";
  /** Aba Promoções (`?promo=1`), do SERVIDOR. */
  promoInicial?: boolean;
  /** Aba Destaques (`?destaque=1`), do SERVIDOR. */
  destaqueInicial?: boolean;
  /**
   * Total EXATO do servidor (tamanho da lista de ids, com busca e aba
   * aplicados). Nunca amostra — é o que permite afirmar "não há" com a
   * busca vazia.
   */
  total: number;
  /** Página que o servidor entregou (1-based). */
  pagina: number;
  /** Itens por página — 50, para o navegador não receber o catálogo inteiro. */
  porPagina: number;
  /** As categorias da loja — a coluna "Categoria" da ficha é uma lista, não texto. */
  categorias?: Categoria[];
  /** As tabelas de preço — o "+" da linha adiciona o produto a uma delas. */
  tabelas?: TabelaDePreco[];
}) {
  const t = useT();
  const router = useRouter();
  const confirmar = useConfirmar();
  const [busca, setBusca] = React.useState(buscaInicial ?? "");

  /** Os filtros que vivem na URL, num lugar só: toda navegação os preserva. */
  const filtrosDaUrl = {
    busca: buscaInicial,
    categoria: categoriaInicial,
    status: statusInicial,
  };

  /** Qual das quatro abas está acesa — a URL é a única fonte. */
  const aba: "todos" | "promocoes" | "destaques" | "sem_fotos" = semFotoInicial
    ? "sem_fotos"
    : promoInicial
      ? "promocoes"
      : destaqueInicial
        ? "destaques"
        : "todos";

  // A busca da TELA vira busca do SERVIDOR (?busca=): a página entrega 50 por
  // vez e o filtro local nunca alcançaria o resto do catálogo (medido: "saco
  // de lixo" mora nas posições 904–958 de 1141). Nova busca recomeça da
  // página 1, preservando a aba. O hook com debounce já existe para isso — o
  // estado reflete na hora, a ida ao servidor espera a pessoa parar de digitar.
  const levarBuscaAoServidor = useDebouncedCallback((termo: string) => {
    const atual = termo.trim();
    if (atual === (buscaInicial ?? "").trim()) return;
    router.replace(urlDoCatalogo({ ...filtrosDaUrl, busca: atual, pagina: 1 }));
  }, 400);

  function aoMudarBusca(valor: string) {
    setBusca(valor);
    levarBuscaAoServidor(valor);
  }

  // Troca de página preserva o termo JÁ confirmado na URL (buscaInicial), não
  // o que está meio digitado no campo — senão um clique no meio da digitação
  // congela o rascunho como busca. E preserva os filtros todos.
  function irParaPagina(p: number) {
    router.replace(urlDoCatalogo({ ...filtrosDaUrl, pagina: p }));
  }

  /**
   * As QUATRO abas do Mercos são navegação, não estado local.
   *
   * Antes, "Promoções" e "Destaques" filtravam a fatia de 50 já baixada — a
   * mesma mentira que a busca contava antes de virar servidor: dizia "nenhuma
   * promoção" com o catálogo cheio delas. Agora cada aba escreve o filtro na
   * URL, e quem filtra é o banco.
   */
  function aoMudarAba(valor: string) {
    const comum = {
      busca: buscaInicial,
      categoria: categoriaInicial,
      status: statusInicial,
    };
    if (valor === "sem_fotos") {
      router.replace(urlDoCatalogo({ ...comum, semFoto: true, pagina: 1 }));
      return;
    }
    if (valor === "promocoes") {
      router.replace(urlDoCatalogo({ ...comum, promo: true, pagina: 1 }));
      return;
    }
    if (valor === "destaques") {
      router.replace(urlDoCatalogo({ ...comum, destaque: true, pagina: 1 }));
      return;
    }
    router.replace(urlDoCatalogo({ ...comum, pagina: 1 }));
  }

  /** Troca de categoria/situação: mesmo caminho, do servidor. */
  function aoMudarFiltro(campo: "categoria" | "status", valor: string) {
    router.replace(
      urlDoCatalogo({
        busca: buscaInicial,
        categoria: campo === "categoria" ? valor : categoriaInicial,
        status: campo === "status" ? (valor as "todos" | "ativos" | "inativos") : statusInicial,
        promo: promoInicial,
        destaque: destaqueInicial,
        pagina: 1,
      }),
    );
  }
  const [criando, setCriando] = React.useState(false);
  const [rascunho, setRascunho] = React.useState<Rascunho>(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [editando, setEditando] = React.useState<Produto | null>(null);
  const [rascunhoEdicao, setRascunhoEdicao] = React.useState<Rascunho>(VAZIO);
  const [salvandoEdicao, setSalvandoEdicao] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);
  const [importando, setImportando] = React.useState(false);
  const [resumo, setResumo] = React.useState<ResumoDaImportacao | null>(null);
  const [completandoNcm, setCompletandoNcm] = React.useState(false);
  const [resumoNcm, setResumoNcm] = React.useState<{
    /** Quantos a REGRA sozinha fechou. */
    aplicados: number;
    /** Quantos a regra e a IA fecharam juntas (concordância). */
    aplicadosComIa: number;
    para_revisar: { id: string; nome: string; motivo: string }[];
    /** O passe de IA batou no teto por chamada e sobrou item cinzento. */
    continuar: boolean;
    iaChamadas: number;
    /** Qual chave o passe de IA usou — ou `null` se ele nem rodou. */
    iaOrigem: {
      origem: "credencial_da_organizacao" | "chave_da_instalacao";
      rotulo: string | null;
      avisos: string[];
    } | null;
  } | null>(null);

  /**
   * Completa o NCM em lote (0267): auto-aplica o casamento certo, devolve o
   * resto para revisar na edição (que já mostra sugestão por produto).
   */
  async function completarNcm(): Promise<void> {
    setCompletandoNcm(true);
    setResumoNcm(null);
    try {
      const r = await apiClient.post<{
        data: {
          aplicados: { id: string; via: "regra" | "regra+ia" }[];
          para_revisar: { id: string; nome: string; motivo: string }[];
          ia_chamadas: number;
          continuar: boolean;
          ia_origem: {
            origem: "credencial_da_organizacao" | "chave_da_instalacao";
            rotulo: string | null;
            avisos: string[];
          } | null;
        };
      }>("/api/v1/products/ncm-completar", {});
      setResumoNcm({
        aplicados: r.data.aplicados.filter((a) => a.via === "regra").length,
        aplicadosComIa: r.data.aplicados.filter((a) => a.via === "regra+ia").length,
        para_revisar: r.data.para_revisar,
        continuar: r.data.continuar,
        iaChamadas: r.data.ia_chamadas,
        iaOrigem: r.data.ia_origem,
      });
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setCompletandoNcm(false);
    }
  }
  const arquivoRef = React.useRef<HTMLInputElement>(null);

  // ── NCM pelo nome (0256) ──────────────────────────────────────────────────
  const [sugestaoCriar, setSugestaoCriar] = React.useState<CandidatoDeNcm | null>(null);
  const [origemNcmCriar, setOrigemNcmCriar] = React.useState<OrigemDoNcm | null>(null);
  const [sugestaoEditar, setSugestaoEditar] = React.useState<CandidatoDeNcm | null>(null);
  const [origemNcmEditar, setOrigemNcmEditar] = React.useState<OrigemDoNcm | null>(null);
  const rascunhoRef = React.useRef(rascunho);
  const rascunhoEdicaoRef = React.useRef(rascunhoEdicao);
  React.useEffect(() => {
    rascunhoRef.current = rascunho;
    rascunhoEdicaoRef.current = rascunhoEdicao;
  }, [rascunho, rascunhoEdicao]);

  /** Deixa o campo vazio um tempinho, e a busca só escreve se ele SEGUE vazio. */
  const sugerirNcmNoCriar = useDebouncedCallback((nome: string) => {
    void buscarSugestaoDeNcm(nome).then((candidato) => {
      const atual = rascunhoRef.current;
      if (!candidato || atual.nome.trim() !== nome || atual.ncm.trim() !== "") return;
      setRascunho({ ...atual, ncm: candidato.ncm });
      setSugestaoCriar(candidato);
      setOrigemNcmCriar("sugerido");
    });
  }, 500);

  const sugerirNcmNaEdicao = useDebouncedCallback((nome: string) => {
    void buscarSugestaoDeNcm(nome).then((candidato) => {
      const atual = rascunhoEdicaoRef.current;
      if (!candidato || atual.nome.trim() !== nome || atual.ncm.trim() !== "") return;
      setRascunhoEdicao({ ...atual, ncm: candidato.ncm });
      setSugestaoEditar(candidato);
      setOrigemNcmEditar("sugerido");
    });
  }, 500);

  function nomeNoCriar(nome: string) {
    setRascunho({ ...rascunho, nome });
    if (rascunho.ncm.trim() === "" && nome.trim().length >= 3) sugerirNcmNoCriar(nome.trim());
  }

  /** Digitou NCM à mão → é `manual`; apagou → volta a poder ser sugerido. */
  function ncmNoCriar(ncm: string) {
    setRascunho({ ...rascunho, ncm });
    const vazio = ncm.trim() === "";
    setSugestaoCriar(null);
    setOrigemNcmCriar(vazio ? null : "manual");
    if (vazio && rascunho.nome.trim().length >= 3) sugerirNcmNoCriar(rascunho.nome.trim());
  }

  function nomeNaEdicao(nome: string) {
    setRascunhoEdicao({ ...rascunhoEdicao, nome });
    if (rascunhoEdicao.ncm.trim() === "" && nome.trim().length >= 3)
      sugerirNcmNaEdicao(nome.trim());
  }

  function ncmNaEdicao(ncm: string) {
    setRascunhoEdicao({ ...rascunhoEdicao, ncm });
    const vazio = ncm.trim() === "";
    setSugestaoEditar(null);
    setOrigemNcmEditar(vazio ? (editando?.ncm_origem ?? null) : "manual");
    if (vazio && rascunhoEdicao.nome.trim().length >= 3)
      sugerirNcmNaEdicao(rascunhoEdicao.nome.trim());
  }

  /** O badge só fica de pé enquanto o valor da busca é o que está no campo. */
  function badgeDeNcm(
    sugestao: CandidatoDeNcm | null,
    valor: string,
    teste: string,
  ): React.ReactNode {
    if (!sugestao || valor.trim() !== sugestao.ncm) return null;
    return (
      <span
        className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-muted-foreground"
        data-testid={teste}
      >
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-accent">
          {t("Sugerido")}
        </span>
        <span className="min-w-0 break-words">{sugestao.descricao ?? sugestao.ncm}</span>
      </span>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);
  // O filtro de verdade — busca, categoria, situação, promoção, destaque — roda
  // no SERVIDOR (page.tsx). Aqui resta o eco do campo de busca enquanto o
  // debounce não dispara: a lista responde na hora ao que está sendo digitado,
  // sem afirmar ausência (quem responde "não existe" é o servidor, quando o
  // termo chega lá).
  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q === "") return inicial;
    return inicial.filter((p) =>
      [p.nome, p.codigo, p.marca ?? "", p.categoria ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [inicial, busca]);

  // As fotos JÁ CHEGAM no HTML inicial, montadas pelo servidor
  // (`fotosDosProdutos`, em `page.tsx`). Aqui não há mais nenhuma requisição.
  //
  // Antes este bloco buscava o lote num efeito, DEPOIS da página desenhada: a
  // lista aparecia inteira sem foto e as imagens preenchiam segundos depois —
  // o piscar que o dono descreveu ("aparece os produtos sem foto e depois de
  // alguns segundos carrega as imagens"). Buscar no servidor não custou uma
  // requisição a mais: a página já ia ao banco pelos produtos.
  const [fotosPorProduto, setFotosPorProduto] =
    React.useState<Record<string, Foto[]>>(fotosIniciais);

  // Só quem EDITA precisa recarregar: enviar ou apagar foto. Buscar e apagar
  // devolvem o registro novo ao componente, que manda de volta para o mapa
  // inteiro — assim a linha atualiza na hora sem esperar a próxima navegação.
  const recarregarFotos = React.useCallback(async (productId: string) => {
    try {
      const r = await apiClient.get<{ data: Foto[] }>(`/api/v1/products/${productId}/images`);
      setFotosPorProduto((atual) => ({ ...atual, [productId]: r.data ?? [] }));
    } catch {
      // Sem a nova lista, a foto continua como está. Não é motivo para
      // apagar o que já aparece na tela.
    }
  }, []);

  async function salvar(opcoes?: { eCadastrarOutro?: boolean }) {
    const corpo = doRascunho(rascunho, t, origemNcmCriar);
    if ("erro" in corpo) {
      toast.error(corpo.erro as string);
      return;
    }
    setSalvando(true);
    try {
      await apiClient.post("/api/v1/products", corpo);
      toast.success(t("Produto cadastrado"));
      if (opcoes?.eCadastrarOutro) {
        // "Salvar e cadastrar outro" (Mercos): limpa a ficha e mantém o que
        // costuma se repetir no próximo item — unidade, categoria e marca.
        setRascunho({
          ...VAZIO,
          unidade: rascunho.unidade,
          categoria: rascunho.categoria,
          marca: rascunho.marca,
        });
        setSugestaoCriar(null);
        setOrigemNcmCriar(null);
      } else {
        setRascunho(VAZIO);
        setSugestaoCriar(null);
        setOrigemNcmCriar(null);
        setCriando(false);
      }
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(p: Produto) {
    const promoAtiva =
      p.preco_promocional_cents != null &&
      (!p.promocao_ate || new Date().toISOString().slice(0, 10) <= p.promocao_ate);
    setRascunhoEdicao({
      codigo: p.codigo,
      nome: p.nome,
      marca: p.marca ?? "",
      categoria: p.categoria ?? "",
      moeda: p.moeda || "BRL",
      preco: (p.preco_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      custo:
        p.custo_cents == null
          ? ""
          : (p.custo_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      quantidade: String(p.quantidade),
      controla_estoque: p.controla_estoque,
      ncm: p.ncm ?? "",
      unidade: p.unidade ?? "",
      multiplo: String(p.multiplo ?? 1),
      ipi: numeroParaTexto(p.ipi_pct),
      comissao: numeroParaTexto(p.comissao_pct),
      observacoes: p.observacoes ?? "",
      pesoBruto: numeroParaTexto(p.peso_bruto_kg),
      largura: numeroParaTexto(p.largura_cm),
      altura: numeroParaTexto(p.altura_cm),
      comprimento: numeroParaTexto(p.comprimento_cm),
      caixaPeso: numeroParaTexto(p.caixa_peso_bruto_kg),
      caixaLargura: numeroParaTexto(p.caixa_largura_cm),
      caixaAltura: numeroParaTexto(p.caixa_altura_cm),
      caixaComprimento: numeroParaTexto(p.caixa_comprimento_cm),
      cores: textoDeLista(p.variacoes?.cores),
      tamanhos: textoDeLista(p.variacoes?.tamanhos),
      destaque: p.destaque,
      emPromocao: promoAtiva,
      precoPromocional:
        p.preco_promocional_cents == null
          ? ""
          : (p.preco_promocional_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      promocaoAte: p.promocao_ate ?? "",
    });
    // A origem do NCM atual viaja na abertura: se a pessoa não mexer no
    // campo, o PATCH reenvia o mesmo valor em vez de marcar tudo como manual.
    setOrigemNcmEditar(p.ncm_origem ?? null);
    setSugestaoEditar(null);
    setEditando(p);
  }

  async function salvarEdicao() {
    if (!editando) return;
    const corpo = doRascunho(rascunhoEdicao, t, origemNcmEditar);
    if ("erro" in corpo) {
      toast.error(corpo.erro as string);
      return;
    }
    // Código é identidade do upsert: não muda na edição.
    const { codigo: _codigo, ...patch } = corpo as Record<string, unknown>;
    void _codigo;
    setSalvandoEdicao(true);
    try {
      await apiClient.patch(`/api/v1/products/${editando.id}`, patch);
      toast.success(t("Produto atualizado"));
      setEditando(null);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  /**
   * Excluir produto (o Mercos oferece dentro da ficha, não na lista).
   *
   * A confirmação é a `useConfirmar` do design system — o produto não abre mais
   * caixa do navegador. Exclusão de catálogo é irreversível pela tela e o item
   * pode estar em pedido: se a FK barrar, o erro da rota é mostrado e nada é
   * apagado.
   */
  async function excluirProduto() {
    if (!editando) return;
    const confirmou = await confirmar({
      title: t("Excluir este produto?"),
      description: t(`${editando.nome} sai do catálogo. Isso não pode ser desfeito.`),
      confirmLabel: t("Excluir produto"),
      cancelLabel: t("Cancelar"),
      danger: true,
    });
    if (!confirmou) return;
    setExcluindo(true);
    try {
      await apiClient.delete(`/api/v1/products/${editando.id}`);
      toast.success(t("Produto excluído"));
      setEditando(null);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setExcluindo(false);
    }
  }

  async function importar(arquivo: File) {
    setImportando(true);
    setResumo(null);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch("/api/v1/products/import", { method: "POST", body: form });
      const json = (await res.json()) as
        { data: ResumoDaImportacao } | { error?: { message?: string } };
      if (!res.ok || !("data" in json)) {
        const msg = "error" in json ? json.error?.message : undefined;
        toast.error(msg ?? t("Não consegui ler essa planilha."));
        return;
      }
      // O resumo fica NA TELA, não num toast que some em 4 segundos: quem
      // importou 300 produtos precisa ler quais linhas foram recusadas e por quê.
      setResumo(json.data);
      router.refresh();
    } catch {
      toast.error(t("Não consegui enviar o arquivo."));
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  async function alternarAtivo(p: Produto) {
    try {
      await apiClient.patch(`/api/v1/products/${p.id}`, { ativo: !p.ativo });
      toast.success(t(p.ativo ? "Produto desativado" : "Produto reativado"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  async function alternarDestaque(p: Produto) {
    try {
      await apiClient.patch(`/api/v1/products/${p.id}`, { destaque: !p.destaque });
      toast.success(t(p.destaque ? "Destaque removido" : "Produto em destaque"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  const cabecalho = esconderCabecalho ? null : (
    <NexusPageHeader title={textos.titulo} subtitle={textos.subtitulo} />
  );

  const corpo = (
    <div className="space-y-4">
      <input
        ref={arquivoRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="arquivo-planilha"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importar(f);
        }}
      />
      <FilterBar>
        <FilterPrimary>
          <FilterSearch
            id="busca-produto"
            label={t("Buscar")}
            value={busca}
            onChange={aoMudarBusca}
            placeholder={t("Pesquise por código ou nome")}
            dataTestId="busca-produto"
          />
          {/* As duas listas do Mercos. Nativas de propósito: o valor vai para a
              URL e o `select` nativo já é navegável por teclado sem portal. */}
          <label className="text-sm" htmlFor="filtro-categoria">
            <span className="sr-only">{t("Categoria")}</span>
            <select
              id="filtro-categoria"
              data-testid="filtro-categoria"
              value={categoriaInicial ?? ""}
              onChange={(e) => aoMudarFiltro("categoria", e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="">{t("Todas as categorias")}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm" htmlFor="filtro-status">
            <span className="sr-only">{t("Situação")}</span>
            <select
              id="filtro-status"
              data-testid="filtro-status"
              value={statusInicial ?? "todos"}
              onChange={(e) => aoMudarFiltro("status", e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="todos">{t("Todos os produtos")}</option>
              <option value="ativos">{t("Exibir produtos ativos")}</option>
              <option value="inativos">{t("Exibir produtos inativos")}</option>
            </select>
          </label>
        </FilterPrimary>
        {podeEditar ? (
          // A ordem é a do Mercos: Cadastrar produto · Importar produtos ·
          // Mais opções. O que é NOSSO e lá não existe (sugestão de NCM em
          // lote e planilha modelo) vive dentro de "Mais opções" — nada some,
          // só deixa de competir com a ação principal.
          //
          // Este bloco vivia no cabeçalho, que o catálogo em abas esconde
          // (esconderCabecalho): o botão de novo produto sumia em
          // /app/products inteiro. Aqui o FilterBar é renderizado sempre.
          <FilterActions>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setCriando((v) => !v)}
              data-testid="novo-produto"
            >
              {t(criando ? "Cancelar" : "Cadastrar produto")}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={importando}
              onClick={() => arquivoRef.current?.click()}
              data-testid="importar-planilha"
            >
              {t(importando ? "Importando…" : "Importar produtos")}
            </Button>
            <details className="relative w-full sm:w-auto">
              <summary className="inline-flex h-9 w-full cursor-pointer list-none items-center justify-between rounded-lg border border-input px-3 text-sm sm:w-auto sm:justify-start [&::-webkit-details-marker]:hidden">
                {t("Mais opções")}
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-popover p-1 shadow-md">
                <button
                  type="button"
                  disabled={completandoNcm}
                  onClick={() => void completarNcm()}
                  data-testid="completar-ncm"
                  title={t(
                    "Preenche o NCM dos produtos sem código: casamento certo pela regra e, na dúvida, a IA desempata. O resto volta para revisar",
                  )}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  {t(completandoNcm ? "Completando…" : "Completar NCM")}
                </button>
                {/* Rota de API que devolve o arquivo com `content-disposition:
                    attachment` — é download, não navegação de página, e `<Link>`
                    do Next faria navegação de cliente para algo que não é tela. */}
                <a
                  href="/api/v1/products/import"
                  download="modelo-catalogo.csv"
                  data-testid="modelo-planilha"
                  className="block rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {t("Baixar planilha modelo")}
                </a>
              </div>
            </details>
          </FilterActions>
        ) : null}
      </FilterBar>
      {resumoNcm ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("NCM aplicado em")} {resumoNcm.aplicados}
          {resumoNcm.aplicadosComIa > 0
            ? " (" + t("com IA") + ": " + resumoNcm.aplicadosComIa + ")"
            : ""}{" "}
          ·{" "}
          {resumoNcm.para_revisar.length > 0
            ? t("para revisar na edição") +
              ": " +
              resumoNcm.para_revisar
                .slice(0, 5)
                .map((x) => x.nome)
                .join(", ") +
              (resumoNcm.para_revisar.length > 5 ? "…" : "")
            : t("nada pendente")}
          {t("IA:")}{" "}
          {resumoNcm.iaOrigem === null
            ? t("sem chave configurada — só regra")
            : resumoNcm.iaOrigem.rotulo
              ? t("chave") + " " + resumoNcm.iaOrigem.rotulo
              : t("chave da instalação")}{" "}
          {resumoNcm.continuar ? (
            <>
              {" "}
              <button
                type="button"
                className="underline"
                disabled={completandoNcm}
                onClick={() => void completarNcm()}
                data-testid="continuar-ncm"
              >
                {t("Rodar de novo para o resto")}
              </button>
            </>
          ) : null}
          {/* As incoerências que NÃO impedem a chamada, mas alguém precisa ver.
              Ex.: com duas chaves Google ativas o desempate é pela mais antiga
              — se isso não for dito, o dono acha que a chave nova está valendo. */}
          {resumoNcm.iaOrigem?.avisos.map((aviso) => (
            <span key={aviso} className="block text-xs text-muted-foreground">
              {aviso}
            </span>
          ))}
        </p>
      ) : null}

      {/*
        A segunda fileira do Mercos, dentro de "Produtos": Produtos e tabelas ·
        Gerenciar estoque · Importar fotos.

        "Importar fotos" não é um importador de arquivo em lote — é a lista dos
        produtos SEM foto, que é onde a foto entra (uma por produto, pela coluna
        Fotos da tabela). O nome é o de lá porque o destino é o mesmo: deixar o
        catálogo com imagem.
      */}
      {/* A fileira de baixo só existe DENTRO de "Produtos", como no Mercos:
          em Promoções/Destaques ela não é o contexto da tela. */}
      <nav
        className="flex flex-wrap items-center gap-1 border-b"
        aria-label={t("Seções de produtos")}
        hidden={Boolean(promoInicial || destaqueInicial)}
      >
        <button
          type="button"
          onClick={() => aoMudarAba("todos")}
          aria-current={aba === "todos" ? "page" : undefined}
          className={`px-3 py-2 text-sm ${
            aba === "todos"
              ? "border-b-2 border-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Table2 className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
          {t("Produtos e tabelas")}
        </button>
        <Link
          href="/app/estoque"
          className="inline-flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Boxes className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {t("Gerenciar estoque")}
        </Link>
        <button
          type="button"
          onClick={() => aoMudarAba("sem_fotos")}
          aria-current={aba === "sem_fotos" ? "page" : undefined}
          data-testid="aba-sem-fotos"
          className={`px-3 py-2 text-sm ${
            aba === "sem_fotos"
              ? "border-b-2 border-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImageUp className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
          {t("Importar fotos")}
          {aba === "sem_fotos" ? ` (${total})` : ""}
        </button>
      </nav>

      {resumo ? (
        <div className="mb-6 rounded-lg border p-4 text-sm" data-testid="resumo-importacao">
          <p className="font-medium">
            {resumo.criados} {t("novos")} · {resumo.atualizados} {t("atualizados")} ·{" "}
            {resumo.total_linhas} {t("linhas na planilha")}
          </p>
          {resumo.colunas_ignoradas.length > 0 ? (
            <p className="mt-2 text-muted-foreground">
              {t("Não usei estas colunas:")} {resumo.colunas_ignoradas.join(", ")}.
            </p>
          ) : null}
          {resumo.erros.length > 0 ? (
            <div className="mt-3">
              <p className="font-medium">{t("Linhas que não entraram:")}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {resumo.erros.slice(0, 20).map((e) => (
                  <li key={`${e.linha}-${e.motivo}`}>
                    {t("Linha")} {e.linha}: {e.motivo}
                  </li>
                ))}
              </ul>
              {resumo.erros.length > 20 ? (
                <p className="mt-1 text-muted-foreground">
                  {t("…e mais")} {resumo.erros.length - 20}.
                </p>
              ) : null}
            </div>
          ) : null}
          <button className="mt-3 text-xs underline" onClick={() => setResumo(null)}>
            {t("Fechar")}
          </button>
        </div>
      ) : null}

      {criando && podeEditar ? (
        <div className="mb-6 rounded-lg border p-4" data-testid="form-produto">
          <FichaDoProduto
            prefixo="produto"
            rascunho={rascunho}
            setRascunho={setRascunho}
            categorias={categorias}
            aoMudarNome={nomeNoCriar}
            aoMudarNcm={ncmNoCriar}
            badgeNcm={badgeDeNcm(sugestaoCriar, rascunho.ncm, "ncm-sugerido-criar")}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void salvar()} disabled={salvando} data-testid="salvar-produto">
              {t(salvando ? "Salvando…" : "Salvar")}
            </Button>
            <Button
              variant="outline"
              onClick={() => void salvar({ eCadastrarOutro: true })}
              disabled={salvando}
              data-testid="salvar-e-novo"
            >
              {t("Salvar e cadastrar outro")}
            </Button>
            <Button variant="ghost" onClick={() => setCriando(false)}>
              {t("Cancelar")}
            </Button>
          </div>
        </div>
      ) : null}

      {filtrados.length === 0 ? (
        busca.trim() ? (
          <EmptyFilterResults
            primary={{ label: t("Limpar filtros"), onClick: () => aoMudarBusca("") }}
          />
        ) : semFotoInicial && total === 0 ? (
          <div
            className="rounded-lg border border-dashed p-8 text-center"
            data-testid="sem-fotos-vazio"
          >
            <p className="font-medium">{t("Nenhum produto sem foto")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Todo o catálogo tem imagem.")}
            </p>
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed p-8 text-center"
            data-testid="produtos-vazio"
          >
            <p className="font-medium">{textos.vazio}</p>
            <p className="mt-1 text-sm text-muted-foreground">{textos.vazioDica}</p>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border" data-testid="lista-produtos">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">{t("Ativo")}</span>
                </TableHead>
                <TableHead className="w-16">{t("Fotos")}</TableHead>
                <TableHead className="w-20">{t("Código")}</TableHead>
                <TableHead className="min-w-[14rem]">{t("Nome")}</TableHead>
                <TableHead className="w-16">{t("IPI")}</TableHead>
                <TableHead className="w-20">{t("Unidade")}</TableHead>
                <TableHead className="w-20">{t("Comissão")}</TableHead>
                <TableHead className="w-28 text-right">{t("Preço de Tabela")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t("Adicionar a uma tabela de preço")}</span>
                </TableHead>
                <TableHead className="w-24 text-right">{t("Ações")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const vitrine = precoDeVitrine(p, hoje);
                return (
                  <TableRow key={p.id} className="even:bg-muted/30" data-testid={`produto-${p.codigo}`}>
                    {/* O olho do Mercos: clicado, ativa/inativa o produto. */}
                    <TableCell className="align-middle">
                      <button
                        type="button"
                        disabled={!podeEditar}
                        onClick={() => {
                          if (podeEditar) void alternarAtivo(p);
                        }}
                        title={t(p.ativo ? "Clique para inativar" : "Clique para ativar")}
                        aria-label={t(p.ativo ? "Inativar" : "Ativar")}
                        data-testid={`alternar-${p.codigo}`}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        {p.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <FotosDoProduto
                        productId={p.id}
                        podeEditar={podeEditar}
                        fotosIniciais={fotosPorProduto[p.id] ?? FOTOS_NENHUMA}
                        aoMudar={recarregarFotos}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{p.codigo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!podeEditar}
                          onClick={() => abrirEdicao(p)}
                          data-testid={`editar-${p.codigo}`}
                          title={t("Abrir a ficha do produto")}
                          className={`min-w-0 break-words text-left underline-offset-2 hover:underline disabled:no-underline ${
                            p.ativo ? "" : "text-muted-foreground line-through"
                          }`}
                        >
                          {p.nome}
                        </button>
                        {p.destaque ? (
                          <Star
                            className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500"
                            aria-label={t("Destaque")}
                          />
                        ) : null}
                        {vitrine.emPromocao ? (
                          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                            {t("Promoção")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.marca ? `${p.marca} · ` : ""}
                        {p.controla_estoque
                          ? `${p.quantidade} ${t("em estoque")}`
                          : t("sem controle de estoque")}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {comoPorcentagem(p.ipi_pct)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{p.unidade ?? "---"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {comoPorcentagem(p.comissao_pct)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {vitrine.emPromocao ? (
                        <span className="mr-1 text-xs text-muted-foreground line-through">
                          {comoMoeda(p.preco_cents, p.moeda)}
                        </span>
                      ) : null}
                      <span className="font-medium">{comoMoeda(vitrine.cents, p.moeda)}</span>
                    </TableCell>
                    <TableCell>
                      {podeEditar ? <AdicionarATabela produto={p} tabelas={tabelas} /> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditar ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void alternarDestaque(p)}
                          data-testid={`destaque-${p.codigo}`}
                        >
                          {t(p.destaque ? "Tirar destaque" : "Destacar")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {(() => {
        // 50 por página: o navegador não recebe o catálogo inteiro, e a troca
        // de página é navegação (?pagina=) para o servidor entregar a fatia.
        // O total é EXATO (tamanho da lista de ids) — nunca amostra.
        const totalPaginas = totalDePaginas(total, porPagina) ?? 1;
        // O rodapé do Mercos aparece SEMPRE ("Resultados 1 - 15"), mesmo com
        // uma página só: é ele que responde "quantos produtos existem?" sem
        // obrigar a pessoa a somar páginas. Só os botões somem.
        const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
        // O fim é o último item DESTA página, não o fim da fatia: na última
        // página cheia pela metade, "1 - 50" mentiria sobre o que está na tela.
        const ate = total === 0 ? 0 : Math.min(de + inicial.length - 1, total);
        const numeros = janelaDePaginas(pagina, totalPaginas);
        const temAnterior = pagina > 1;
        const temProxima = pagina < totalPaginas;
        return (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 pt-2"
            aria-label={t("Paginação do catálogo")}
            data-testid="paginacao"
          >
            <p className="text-sm text-muted-foreground" role="status" data-testid="resultados">
              {total === 0
                ? t("Nenhum resultado")
                : `${t("Resultados")} ${de} - ${ate} ${t("de")} ${total}`}
              {totalPaginas > 1 ? ` · ${t("Página")} ${pagina} ${t("de")} ${totalPaginas}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-1" hidden={totalPaginas <= 1}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!temAnterior}
                onClick={() => irParaPagina(pagina - 1)}
                data-testid="pagina-anterior"
              >
                {t("Anterior")}
              </Button>
              {numeros.map((n, i) =>
                n === "…" ? (
                  <span key={`vazio-${i}`} className="px-1 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    type="button"
                    variant={n === pagina ? "default" : "ghost"}
                    size="sm"
                    onClick={() => irParaPagina(n)}
                    aria-current={n === pagina ? "page" : undefined}
                    data-testid={`pagina-${n}`}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!temProxima}
                onClick={() => irParaPagina(pagina + 1)}
                data-testid="pagina-proxima"
              >
                {t("Próxima")}
              </Button>
            </div>
          </nav>
        );
      })()}

      {editando && podeEditar ? (
        <div className="rounded-lg border p-4" data-testid="form-editar-produto">
          <p className="mb-3 font-medium">
            {t("Editar")} · {editando.codigo} — {editando.nome}
          </p>
          <FichaDoProduto
            prefixo="editar"
            rascunho={rascunhoEdicao}
            setRascunho={setRascunhoEdicao}
            categorias={categorias}
            aoMudarNome={nomeNaEdicao}
            aoMudarNcm={ncmNaEdicao}
            badgeNcm={badgeDeNcm(sugestaoEditar, rascunhoEdicao.ncm, "ncm-sugerido-editar")}
            fotoSlot={
              <FotosDoProduto
                productId={editando.id}
                podeEditar={podeEditar}
                fotosIniciais={fotosPorProduto[editando.id] ?? FOTOS_NENHUMA}
                aoMudar={recarregarFotos}
              />
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void salvarEdicao()}
              disabled={salvandoEdicao}
              data-testid="salvar-edicao"
            >
              {t(salvandoEdicao ? "Salvando…" : "Salvar")}
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              disabled={excluindo}
              onClick={() => void excluirProduto()}
              data-testid="excluir-produto"
            >
              {t(excluindo ? "Excluindo…" : "Excluir produto")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (esconderCabecalho) {
    return <div data-testid="tela-produtos">{corpo}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6" data-testid="tela-produtos">
      {cabecalho}
      {corpo}
    </div>
  );
}
