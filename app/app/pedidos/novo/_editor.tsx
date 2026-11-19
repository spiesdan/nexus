"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown, Eye, Sparkle } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { nomeDeExibicao } from "@/lib/contacts/nome-de-exibicao";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { precoParaCentavos, type Produto } from "@/lib/schemas/produtos";
import { calcularParcelas, subtotalDoItem } from "@/lib/schemas/pedidos";
import { CustomerSelector, type ContatoOpcao } from "./_cliente";
import { ProductSearch, type PrecoDeTabela, type UltimoPreco } from "./_produtos";
import { AdicionarComIa } from "./_ia";
import { OrderItems, type LinhaDoPedido } from "./_itens";
import { AfinsNoPedido } from "./_afins";
import { FORMA_DE_PAGAMENTO_LABEL, type FormaDePagamento } from "@/lib/comercial/pedido-fiscal";
import { OrderSummary } from "./_resumo";
import { haQuantoTempo, chaveDoRascunho, rascunhoDeOutroCliente, useAutosaveDraft } from "./_autosave";
import { useOrderShortcuts } from "./_atalhos";

import { randomId } from "@/lib/random-id";
import { rolarPara } from "@/lib/ui/movimento";

/** O que o autosave guarda — e o que a restauração pode receber de outro dia. */
interface RascunhoDoPedido {
  contatoId: string | null;
  /** A mesma chave sobrevive ao reload: retry não cria pedido duplicado. */
  chavePedido?: string;
  clienteNome: string;
  linhas: LinhaDoPedido[];
  condicao: string;
  formaPagamento?: FormaDePagamento | "";
  exigeNf?: boolean;
  observacoes: string;
  obsInterna?: string;
  endereco?: string;
  transportadora?: string;
  rastreamento?: string;
  contatoNoCliente?: string;
  tabelaId?: string;
  descontoTexto?: string;
  descontoPctTexto?: string;
  freteTexto?: string;
}

interface TextosBase {
  titulo: string;
  subtitulo: string;
  cliente: string;
  buscarCliente: string;
  clienteAvulso: string;
  condicao: string;
  formaPagamento: string;
  prazoLivre: string;
  prazoPrecisaNf: string;
  exigeNf: string;
  exigeNfOpcao: string;
  observacoes: string;
  obsInterna: string;
  endereco: string;
  enderecoExemplo: string;
  transportadora: string;
  tabelaPreco: string;
  semTabela: string;
  relacionados: string;
  adicionar: string;
  historico: string;
  rascunhoRestaurado: string;
  rascunhoDeOutroCliente: string;
  rascunhoDeOutroClienteDesc: string;
  usarClienteDoLink: string;
  continuarRascunho: string;
  produtos: string;
  buscarProduto: string;
  subtotal: string;
  desconto: string;
  frete: string;
  total: string;
  margem: string;
  comissao: string;
  aguardandoAprovacao: string;
  salvarRascunho: string;
  finalizar: string;
  revisar: string;
  pedidoCriado: string;
}

/**
 * O EDITOR (§2–3): 70/30 no desktop, barra sticky no mobile.
 *
 * Monta o rascunho local (com autosave) e só fala com o servidor no
 * Salvar/Finalizar — o backend recalcula tudo e barra o que for inválido.
 * Preço, estoque, crédito e aprovação NUNCA são decididos aqui.
 */
export function OrderEditor({
  produtos,
  contatos,
  contatoInicial,
  tabelas,
  verMargem,
  comissaoPct,
  descontoMaxVendedorPct,
  nomeOrganizacao,
  representada,
  nomeVendedor,
  donoDoRascunho,
  textos,
}: {
  produtos: Produto[];
  contatos: ContatoOpcao[];
  /**
   * Cliente vindo do link da ficha/360° (`/app/pedidos/novo?contato=<id>`).
   * `null` significa "editor aberto sem cliente" — o comportamento de sempre.
   */
  contatoInicial?: string | null;
  tabelas: { id: string; nome: string; desconto_pct: number }[];
  verMargem: boolean;
  comissaoPct: number | null;
  /** O teto do vendedor (política da org; default do servidor = 5%). */
  descontoMaxVendedorPct: number;
  /** A "representada" do Mercos: a empresa que emite este pedido. */
  nomeOrganizacao: string;
  /**
   * O bloco REPRESENTADA do Mercos não mostra só o nome: mostra razão social,
   * CNPJ e telefone (e o logo). Os três primeiros nós temos no banco — este
   * objeto é opcional porque a tela funciona sem ele, e porque inventar dado
   * de emitente é pior do que mostrar menos.
   */
  representada?: {
    razaoSocial?: string | null;
    cnpj?: string | null;
    telefone?: string | null;
  };
  /** Quem está vendendo — o "Vendedor" do bloco de detalhes. */
  nomeVendedor?: string | null;
  /**
   * De quem é o rascunho local. Sem isto, `localStorage` é uma gaveta única
   * para todos os usuários e organizações do mesmo navegador — e o rascunho de
   * uma vendedora aparecia para a outra (ver `chaveDoRascunho`).
   */
  donoDoRascunho: { orgId: string; userId: string };
  textos: TextosBase;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const buscaRef = React.useRef<HTMLInputElement | null>(null);

  const [contatoId, setContatoId] = React.useState<string | null>(contatoInicial ?? null);
  const contatoDoLink = React.useMemo(
    () => (contatoInicial ? contatos.find((c) => c.id === contatoInicial) : undefined),
    [contatoInicial, contatos],
  );
  const [clienteNome, setClienteNome] = React.useState(
    contatoDoLink ? nomeDeExibicao(contatoDoLink, t) : "",
  );
  // A lista vem do servidor no carregamento da página; o estado local existe
  // para o cliente cadastrado AQUI entrar na hora, sem recarregar a tela (e sem
  // perder o rascunho do pedido).
  const [listaDeContatos, setListaDeContatos] = React.useState<ContatoOpcao[]>(contatos);
  const [novoClienteAberto, setNovoClienteAberto] = React.useState(false);
  const [linhas, setLinhas] = React.useState<LinhaDoPedido[]>([]);
  const [condicao, setCondicao] = React.useState("");
  // 0261: o prazo estruturado e a marcação de NF. São dois campos e não um,
  // porque respondem a perguntas diferentes — "quando vence" (que depende da
  // emissão da nota) e "precisa de nota" (que não depende de nada).
  const [formaPagamento, setFormaPagamento] = React.useState<FormaDePagamento | "">("");
  const [exigeNf, setExigeNf] = React.useState(false);
  const [observacoes, setObservacoes] = React.useState("");
  const [obsInterna, setObsInterna] = React.useState("");
  const [endereco, setEndereco] = React.useState("");
  const [transportadora, setTransportadora] = React.useState("");
  // 0276: os dois campos do bloco "Detalhes" do Mercos que não existiam.
  const [rastreamento, setRastreamento] = React.useState("");
  const [contatoNoCliente, setContatoNoCliente] = React.useState("");
  // "Hoje" só depois de montar: o servidor formata em UTC e o navegador no
  // fuso do dono; as duas datas discordam entre 21h e meia-noite e o React
  // acusa hidratação (#418). `null` no primeiro render é o preço de não
  // mentir a data.
  const [hoje, setHoje] = React.useState<string | null>(null);
  React.useEffect(() => {
    setHoje(new Date().toLocaleDateString(tagIdioma));
  }, [tagIdioma]);
  const [tabelaId, setTabelaId] = React.useState("");
  const [tabela, setTabela] = React.useState<PrecoDeTabela | null>(null);
  const [descontoTexto, setDescontoTexto] = React.useState("");
  const [descontoPctTexto, setDescontoPctTexto] = React.useState("");
  const [freteTexto, setFreteTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  // A chave de idempotência nasce com o editor e é GRAVADA no rascunho: se a
  // resposta do POST se perder e a pessoa tentar de novo (ou recarregar e
  // tentar), o servidor devolve o pedido que já existe em vez de criar outro.
  // `randomId` (lib/random-id.ts) e não `crypto.randomUUID` cru: em VPS
  // self-host sem TLS (http://IP) o browser não expõe `randomUUID` — o helper
  // cai em `getRandomValues`. O valor não é renderizado, então servidor e
  // cliente não precisam concordar.
  const [chavePedido, setChavePedido] = React.useState<string>(() => randomId());
  // Guarda SÍNCRONA: `enviando` só desabilita o botão no próximo render — dois
  // cliques (ou Cmd+Enter repetido) no mesmo frame entrariam duas vezes.
  const envioEmVoo = React.useRef(false);
  const [aprovacao, setAprovacao] = React.useState(false);
  // Uma página só, como o Mercos: as quatro seções (cliente, representada,
  // produtos, detalhes) ficam todas visíveis e o estado é único. Nada de passo
  // escondendo campo — o vendedor confere o pedido inteiro antes de gerar.
  const [previaAberta, setPreviaAberta] = React.useState(false);
  const [iaAberta, setIaAberta] = React.useState(false);
  const [ultimos, setUltimos] = React.useState<Map<string, UltimoPreco>>(new Map());
  const [historicoItens, setHistoricoItens] = React.useState<
    {
      product_id: string | null;
      produto_nome: string;
      quantidade: number;
      preco_unit_cents: number;
      criado_em: string;
      dias_desde: number;
    }[]
  >([]);

  const porId = React.useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  // Tabela aplicada: desconto + overrides (para o preço efetivo da busca).
  React.useEffect(() => {
    if (!tabelaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabela(null);
      return;
    }
    let vivo = true;
    apiClient
      .get<{ itens: { product_id: string; preco_cents: number | null }[] }>(
        `/api/v1/price-tables/${tabelaId}`,
      )
      .then((d) => {
        if (!vivo) return;
        const tab = tabelas.find((x) => x.id === tabelaId);
        setTabela({
          desconto_pct: Number(tab?.desconto_pct ?? 0),
          overrides: new Map(d.itens.map((i) => [i.product_id, i.preco_cents])),
        });
      })
      .catch((e) => {
        if (vivo) showApiError(e);
      });
    return () => {
      vivo = false;
    };
  }, [tabelaId, tabelas]);

  // Histórico do cliente: últimos preços + base de relacionados/reposição.
  React.useEffect(() => {
    if (!contatoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUltimos(new Map());
      setHistoricoItens([]);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const { data: pedidos } = await apiClient.get<{
          data: { id: string; created_at: string }[];
        }>(`/api/v1/commercial-orders?contact_id=${contatoId}`);
        const recentes = pedidos.slice(0, 3);
        const mapa = new Map<string, UltimoPreco>();
        const itens: typeof historicoItens = [];
        // Date.now aqui (efeito async), não no render: dias desde a compra
        // viajam prontos nos itens, e o memo abaixo é puro.
        const agoraPid = Date.now();
        for (const ped of recentes) {
          const { data: det } = await apiClient.get<{
            data: {
              itens: {
                product_id: string | null;
                produto_nome: string;
                quantidade: number;
                preco_unit_cents: number;
              }[];
            };
          }>(`/api/v1/commercial-orders/${ped.id}`);
          for (const item of det.itens) {
            if (item.product_id && !mapa.has(item.product_id)) {
              mapa.set(item.product_id, { preco_cents: item.preco_unit_cents, em: ped.created_at });
            }
            itens.push({
              ...item,
              criado_em: ped.created_at,
              dias_desde: Math.floor((agoraPid - new Date(ped.created_at).getTime()) / 86400000),
            });
          }
        }
        if (vivo) {
          setUltimos(mapa);
          setHistoricoItens(itens);
        }
      } catch (e) {
        if (vivo) showApiError(e);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [contatoId]);

  // Endereço de entrega: ao escolher o cliente, sugere o endereço dele
  // quando o campo está vazio (regra do Mercos: "endereço principal do
  // cliente"). Uma chance por cliente (ref) + set funcional (vale o estado
  // mais novo): digitação e restauração do rascunho nunca são atropeladas.
  const sugeridoPara = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!contatoId || contatoId === sugeridoPara.current || endereco.trim()) return;
    sugeridoPara.current = contatoId;
    let vivo = true;
    (async () => {
      try {
        const { data: c } = await apiClient.get<{
          data: {
            logradouro: string | null;
            numero_end: string | null;
            complemento: string | null;
            bairro: string | null;
            cidade: string | null;
            uf: string | null;
            cep: string | null;
          };
        }>(`/api/v1/contacts/${contatoId}`);
        const linha = enderecoEmLinha(c);
        if (vivo && linha) setEndereco((atual) => (atual.trim() ? atual : linha));
      } catch {
        // Cortesia: o campo continua editável à mão.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [contatoId, endereco]);

  // Autosave (§31). Fica DESLIGADO enquanto há um rascunho divergente por
  // decidir: o primeiro debounce (2 s) gravaria o pedido vazio por cima do
  // rascunho do outro cliente antes de a pessoa escolher.
  const [conflitoDeRascunho, setConflitoDeRascunho] = React.useState<RascunhoDoPedido | null>(null);
  const { salvoEm, carregar, limpar, falhaAoSalvar } = useAutosaveDraft(
    chaveDoRascunho(donoDoRascunho.orgId, donoDoRascunho.userId),
    {
      contatoId,
      chavePedido,
      clienteNome,
      linhas,
      condicao,
      formaPagamento,
      exigeNf,
      observacoes,
      obsInterna,
      endereco,
      transportadora,
      rastreamento,
      contatoNoCliente,
      tabelaId,
      descontoTexto,
      descontoPctTexto,
      freteTexto,
    },
    conflitoDeRascunho === null,
  );
  // Restauração única do autosave (montagem): sem ela, fechar o navegador
  // no meio da venda perde tudo (§31).
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const salvo = carregar();
    if (!salvo || linhas.length > 0) return;
    const s = salvo as unknown as RascunhoDoPedido;
    const temItens = Array.isArray(s.linhas) && s.linhas.length > 0;
    const temCliente = Boolean(s.contatoId || s.clienteNome?.trim());
    // Um rascunho só com o cliente escolhido também é intenção e volta. Mas o
    // link da ficha vence esse caso: sem itens não há venda para perder, e o
    // cliente que a pessoa acabou de clicar não pode ser trocado por um resto.
    if (!temItens && !temCliente) return;
    if (rascunhoDeOutroCliente(s, contatoInicial)) {
      // O link manda um cliente; o rascunho salvo pode ser de OUTRO. Com itens,
      // restaurar em silêncio trocaria o cliente e descartar perderia a venda:
      // a decisão é explícita. Sem itens, o link vence (o resto de cliente não
      // é aplicado).
      if (temItens) setConflitoDeRascunho(s);
      return;
    }
    aplicarRascunho(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function aplicarRascunho(s: RascunhoDoPedido) {
    setContatoId(s.contatoId);
    if (s.chavePedido) setChavePedido(s.chavePedido);
    setClienteNome(s.clienteNome);
    setLinhas(Array.isArray(s.linhas) ? s.linhas : []);
    setCondicao(s.condicao ?? "");
    // Rascunho salvo antes da 0261 não tem os dois campos. `|| ""` e `?? false`
    // em vez de acesso direto: um rascunho de ontem não pode fazer a tela
    // quebrar em `undefined`.
    setFormaPagamento(s.formaPagamento ?? "");
    setExigeNf(s.exigeNf ?? false);
    setObservacoes(s.observacoes ?? "");
    // TODO campo editável que entra no autosave volta aqui. O desconto era o
    // caso medido pelo design (salvava e não voltava); a varredura achou mais
    // cinco com a mesma falha: obsInterna, endereco, tabelaId, descontoTexto,
    // descontoPctTexto e freteTexto.
    setObsInterna(s.obsInterna ?? "");
    setEndereco(s.endereco ?? "");
    setTransportadora(s.transportadora ?? "");
    setRastreamento(s.rastreamento ?? "");
    setContatoNoCliente(s.contatoNoCliente ?? "");
    setTabelaId(s.tabelaId ?? "");
    setDescontoTexto(s.descontoTexto ?? "");
    // Input `type=number` só aceita ponto. Um rascunho antigo/colado com vírgula
    // seria rejeitado pelo browser e o campo voltaria vazio — normalizar aqui é
    // o que faz o desconto percentual voltar de fato.
    setDescontoPctTexto((s.descontoPctTexto ?? "").replace(",", "."));
    setFreteTexto(s.freteTexto ?? "");
    nexusToast.info(textos.rascunhoRestaurado);
  }

  // Fechar/recarregar com itens no pedido pede confirmação. O autosave guarda
  // o conteúdo, mas a surpresa de perder a tela sem aviso é outra coisa —
  // e a confirmação nativa é a única disponível antes de `beforeunload`.
  React.useEffect(() => {
    if (linhas.length === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [linhas.length]);

  /** Sai da URL do link sem navegar de novo (não remonta o editor). */
  function esquecerClienteDoLink() {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/app/pedidos/novo");
    }
  }

  function adicionar(produto: Produto, quantidade: number) {
    setLinhas((ls) => {
      // Sem nova linha para o mesmo produto: incrementa (§8).
      const i = ls.findIndex((l) => l.product_id === produto.id);
      if (i >= 0) {
        const copia = [...ls];
        copia[i] = { ...copia[i]!, quantidade: copia[i]!.quantidade + quantidade };
        return copia;
      }
      return [
        ...ls,
        {
          key: `${produto.id}-${Date.now()}`,
          product_id: produto.id,
          codigo: produto.codigo,
          nome: produto.nome,
          quantidade,
          permite_fracao: false,
          precoTexto: (produto.preco_cents / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
          }),
          descontoPct: 0,
          estoque: produto.controla_estoque ? produto.quantidade : null,
          unidade: produto.unidade ?? null,
          multiplo: produto.multiplo ?? 1,
          origemPreco: tabela ? "tabela" : "base",
        },
      ];
    });
  }

  function mudarLinha(key: string, patch: Partial<LinhaDoPedido>) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Totais calculados AQUI para exibição; o servidor recalcula no POST.
  const subtotal = linhas.reduce((s, l) => {
    const unit = precoParaCentavos(l.precoTexto) ?? 0;
    return s + subtotalDoItem(l.quantidade, unit, l.descontoPct);
  }, 0);
  const descontoCents = descontoTexto.trim() === "" ? 0 : (precoParaCentavos(descontoTexto) ?? 0);
  const descontoPct = Math.min(100, Math.max(0, Number(descontoPctTexto) || 0));
  const descontoPctCents = Math.round((subtotal * descontoPct) / 100);
  const freteCents = freteTexto.trim() === "" ? 0 : (precoParaCentavos(freteTexto) ?? 0);
  const total = subtotal - descontoCents - descontoPctCents + freteCents;
  const qtdUnidades = linhas.reduce((s, l) => s + l.quantidade, 0);
  // Aprovação ANTES de gerar: o servidor escala acima do teto (mesma régua do
  // POST). Antes, o aviso só aparecia depois da resposta — o vendedor
  // descobria a consequência quando o pedido já existia.
  const maiorDesconto = Math.max(descontoPct, ...linhas.map((l) => l.descontoPct), 0);
  const aprovacaoNecessaria =
    aprovacao || (linhas.length > 0 && maiorDesconto > descontoMaxVendedorPct);

  const margemPct = React.useMemo(() => {
    if (!verMargem || linhas.length === 0) return null;
    let custo = 0;
    for (const l of linhas) {
      const p = porId.get(l.product_id);
      if (p?.custo_cents === null || p?.custo_cents === undefined) return null;
      custo += p.custo_cents * l.quantidade;
    }
    if (total <= 0) return null;
    return Math.round(((total - custo) / total) * 1000) / 10;
  }, [linhas, porId, verMargem, total]);

  const comissaoCents =
    comissaoPct !== null && total > 0 ? Math.round((total * comissaoPct) / 100) : null;

  // Relacionados: mesma categoria, fora do pedido (§18).
  const noPedido = new Set(linhas.map((l) => l.product_id));
  const relacionados = React.useMemo(() => {
    const cats = new Set(
      linhas.map((l) => porId.get(l.product_id)?.categoria).filter(Boolean) as string[],
    );
    if (cats.size === 0) return [];
    return produtos
      .filter((p) => p.categoria && cats.has(p.categoria) && !noPedido.has(p.id))
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, produtos]);

  // Reposição: compra repetida em intervalo regular, já na hora (§21).
  const reposicoes = React.useMemo(() => {
    const porProd = new Map<
      string,
      { qtds: number[]; datas: number[]; dias: number[]; nome: string; id: string }
    >();
    for (const h of historicoItens) {
      if (!h.product_id || noPedido.has(h.product_id)) continue;
      const e = porProd.get(h.product_id) ?? {
        qtds: [],
        datas: [],
        dias: [],
        nome: h.produto_nome,
        id: h.product_id,
      };
      e.qtds.push(h.quantidade);
      e.datas.push(new Date(h.criado_em).getTime());
      e.dias.push(h.dias_desde);
      porProd.set(h.product_id, e);
    }
    const out: { id: string; nome: string; qtd: number; dias: number }[] = [];
    for (const e of porProd.values()) {
      if (e.datas.length < 2) continue;
      const ord = [...e.datas].sort((a, b) => a - b);
      const intervalos: number[] = [];
      for (let i = 1; i < ord.length; i++) intervalos.push((ord[i]! - ord[i - 1]!) / 86400000);
      const medio = intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
      const desdeUltima = Math.min(...e.dias);
      if (medio >= 7 && desdeUltima >= medio * 0.8) {
        const qtdMedia = Math.round(e.qtds.reduce((s, v) => s + v, 0) / e.qtds.length);
        out.push({ id: e.id, nome: e.nome, qtd: qtdMedia, dias: desdeUltima });
      }
    }
    return out.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicoItens]);

  /**
   * ├── por que o canal entra AQUI ──────────────────────────────────────────
   *
   * O "Enviar por e-mail" e o "Enviar por WhatsApp" do Mercos ficam na mesma
   * barra do "Gerar pedido", e isso só é possível lá porque o Mercos cria o
   * rascunho no instante em que a tela abre. Aqui o pedido nasce no clique —
   * e mandar sem gravar mandaria um pedido que não existe.
   *
   * Então o botão grava (rascunho) e só depois abre o canal. O pedido fica
   * com número, aparece na lista, e o vendedor cai na ficha dele: nada de
   * "enviei e não sei o que foi enviado".
   */
  async function enviar(status: "rascunho" | "aprovado", canal?: "email" | "whatsapp") {
    if (!clienteNome.trim()) {
      nexusToast.error(t("Escolha ou digite o nome do cliente."));
      irPara("cliente");
      return;
    }
    if (linhas.length === 0) {
      nexusToast.error(t("Adicione ao menos 1 produto."));
      irPara("produtos");
      return;
    }
    const itens = [];
    for (const l of linhas) {
      const unit = precoParaCentavos(l.precoTexto);
      if (unit === null) {
        nexusToast.error(`${t("Preço inválido em")} "${l.nome}". ${t("Escreva assim: 5.499,00")}`);
        irPara("produtos");
        return;
      }
      itens.push({
        product_id: l.product_id,
        quantidade: l.quantidade,
        preco_unit_cents: unit,
        desconto_pct: l.descontoPct,
      });
    }
    try {
      const { data: pedido } = await apiClient.post<{
        data: { id: string; numero: number; aprovacao_necessaria?: boolean };
      }>(`/api/v1/commercial-orders`, {
        contact_id: contatoId,
        cliente_nome: clienteNome.trim(),
        chave_sincronizacao: chavePedido,
        status,
        origem: "vendedor",
        desconto_cents: descontoCents,
        ...(descontoPct > 0 ? { desconto_pct: descontoPct } : {}),
        ...(tabelaId ? { price_table_id: tabelaId } : {}),
        frete_cents: freteCents,
        ...(condicao.trim() ? { condicao_pagamento: condicao.trim() } : {}),
        // 0261: sempre enviados, mesmo falsos/nulos. Sem isto, um pedido sem NF
        // e um pedido onde ninguém marcou seriam a mesma linha no banco, e a
        // rotina do Meu Dia não teria como distinguir.
        exige_nf: exigeNf,
        forma_pagamento: formaPagamento === "" ? null : formaPagamento,
        ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
        ...(obsInterna.trim() ? { obs_interna: obsInterna.trim() } : {}),
        ...(endereco.trim() ? { endereco_entrega: endereco.trim() } : {}),
        ...(transportadora.trim() ? { transportadora_nome: transportadora.trim() } : {}),
        ...(rastreamento.trim() ? { rastreamento: rastreamento.trim() } : {}),
        ...(contatoNoCliente.trim() ? { contato_no_cliente: contatoNoCliente.trim() } : {}),
        itens,
      });
      if (pedido.aprovacao_necessaria) setAprovacao(true);
      const numero = `PED-${String(pedido.numero).padStart(4, "0")}`;
      nexusToast.success(`${textos.pedidoCriado}: ${numero}`);
      if (canal) {
        // Grava primeiro (acima), abre o canal e só então navega: o app de
        // e-mail/WhatsApp precisa assumir antes de a página trocar.
        const resumo = `${numero} — ${clienteNome.trim()} — ${comoMoeda(total, "BRL")}`;
        const email = listaDeContatos.find((c) => c.id === contatoId)?.email;
        const alvo =
          canal === "email"
            ? `mailto:${email ?? ""}?subject=${encodeURIComponent(resumo)}&body=${encodeURIComponent(resumo)}`
            : `https://wa.me/?text=${encodeURIComponent(resumo)}`;
        // Âncora clicada em vez de `window.location.href = …`: o app de e-mail
        // e o WhatsApp assumem a navegação, e a aba do pedido continua viva
        // para receber o `router.push` do detalhe logo abaixo.
        const link = document.createElement("a");
        link.href = alvo;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => router.push(`/app/pedidos/${pedido.id}`), 900);
        limpar();
        return;
      }
      limpar();
      // `refresh()` junto do `push` de propósito: o Router Cache do Next serve
      // o RSC de `/app/pedidos` por 30s (`next.config.ts`, `staleTimes.dynamic`)
      // e o pedido recém-criado não estaria nele — a lista abria sem o pedido.
      router.push("/app/pedidos");
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  useOrderShortcuts({
    focarBusca: () => buscaRef.current?.focus(),
    // Passa pela MESMA porta do botão: o atalho também respeita a guarda de
    // envio em voo (antes ele chamava `enviar` direto e furava o `enviando`).
    finalizar: () => void comEnvio("aprovado"),
    desfocar: () => (document.activeElement as HTMLElement | null)?.blur(),
  });

  async function comEnvio(status: "rascunho" | "aprovado", canal?: "email" | "whatsapp") {
    if (envioEmVoo.current) return;
    envioEmVoo.current = true;
    setEnviando(true);
    try {
      await enviar(status, canal);
    } finally {
      envioEmVoo.current = false;
      setEnviando(false);
    }
  }

  /** Rola até a seção: validação que reclama longe do campo não ensina nada. */
  function irPara(secao: "cliente" | "produtos") {
    // `rolarPara` respeita `prefers-reduced-motion` (o CSS não alcança
    // rolagem programática — ver lib/ui/movimento.ts).
    rolarPara(document.getElementById(`secao-${secao}`), { block: "center" });
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 pb-28 sm:p-6 lg:pb-6">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-8">
          <NexusPageHeader
            title={textos.titulo}
            subtitle={
              linhas.length > 0 && salvoEm
                ? `${textos.subtitulo} · ${t("salvo")} ${haQuantoTempo(salvoEm) ?? ""}`
                : textos.subtitulo
            }
            actions={
              // QUATRO ações, não cinco. "Enviar por e-mail" e "Enviar por
              // WhatsApp" viraram um menu: são a mesma decisão (gravar e abrir o
              // canal) e, lado a lado com "Gerar pedido", davam cinco botões do
              // mesmo peso — o primário deixava de ser o único roxo da dobra.
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {/* No celular quem carrega a ação é a barra fixa: dois "Gerar pedido"
                visíveis ao mesmo tempo é duplicidade, não atalho. */}
                <Button
                  className="hidden w-full sm:w-auto lg:inline-flex"
                  onClick={() => void comEnvio("aprovado")}
                  disabled={enviando}
                  data-testid="gerar-pedido"
                >
                  {enviando ? t("Gerando…") : textos.finalizar}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPreviaAberta(true)}
                  className="flex-1 sm:flex-none"
                >
                  <Eye size={16} className="mr-1.5" /> {t("Visualizar")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={enviando} className="flex-1 sm:flex-none">
                      {t("Enviar")} <CaretDown size={14} className="ml-1.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={enviando || !listaDeContatos.find((c) => c.id === contatoId)?.email}
                      onSelect={() => void comEnvio("rascunho", "email")}
                    >
                      {t("Enviar por e-mail")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={enviando}
                      onSelect={() => void comEnvio("rascunho", "whatsapp")}
                    >
                      {t("Enviar por WhatsApp")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-none">
                      {t("Mais opções")} <CaretDown size={14} className="ml-1.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={enviando}
                      onSelect={() => void comEnvio("rascunho")}
                      data-testid="salvar-rascunho"
                    >
                      {textos.salvarRascunho}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setPreviaAberta(true)}>
                      {t("Prévia do pedido")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />

          {falhaAoSalvar ? (
            <p
              role="alert"
              data-testid="rascunho-nao-salvo"
              className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning-fg"
            >
              {t(
                "Não foi possível salvar o rascunho neste navegador (modo privado ou armazenamento cheio). Você pode continuar e gerar o pedido, mas não feche a aba antes disso.",
              )}
            </p>
          ) : null}

          {/* O cartão do topo do Mercos: número e pill do status. O número só
          existe depois do "Gerar pedido" — mostrá-lo aqui exigiria criar o
          rascunho no instante em que a tela abre, e é exatamente isso que
          enche a base de pedido fantasma de quem abriu, olhou e desistiu. */}
          <Card className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <p className="text-[13px] font-medium">
              <span className="text-muted-foreground">#</span> {t("novo")}
            </p>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {t("Rascunho")}
            </span>
          </Card>

          {/* 1 · CLIENTE — o mesmo autocomplete com cadastro inline de antes. */}
          <section id="secao-cliente" aria-label={t("Cliente")} className="space-y-2">
            <TituloDaSecao numero={1}>{t("CLIENTE")}</TituloDaSecao>
            <Card className="p-4">
              <CustomerSelector
                contatos={listaDeContatos}
                contatoId={contatoId}
                clienteNome={clienteNome}
                aoEscolher={(id, nome) => {
                  setContatoId(id);
                  setClienteNome(nome);
                }}
                aoCriarNovo={() => setNovoClienteAberto(true)}
                textos={{
                  cliente: textos.cliente,
                  buscarCliente: textos.buscarCliente,
                  clienteAvulso: textos.clienteAvulso,
                }}
              />
            </Card>
          </section>

          {/* Cadastro de cliente sem sair do pedido. Ao criar, o contato entra na
          lista local E já fica escolhido: quem digitou o nome acabou de digitar
          quer ele selecionado, não quer procurá-lo de novo. */}
          <NewContactDialog
            open={novoClienteAberto}
            onOpenChange={setNovoClienteAberto}
            onCreated={(c) => {
              const novo: ContatoOpcao = {
                id: c.id,
                // O cadastro inline pode nascer com fantasia; o seletor a usa como
                // nome principal (regra de 18/11/2026).
                fantasia: (c as { fantasia?: string | null }).fantasia ?? null,
                name: c.name,
                display_name: c.display_name,
                phone_number: c.phone_number,
                email: c.email,
              };
              setListaDeContatos((prev) =>
                prev.some((p) => p.id === novo.id) ? prev : [...prev, novo],
              );
              setContatoId(novo.id);
              setClienteNome(rotuloDoContato(novo, t));
            }}
          />

          {/* 2 · REPRESENTADA — quem emite. Só leitura: não é escolha do vendedor. */}
          <section aria-label={t("Representada")} className="space-y-2">
            <TituloDaSecao numero={2}>{t("REPRESENTADA")}</TituloDaSecao>
            <Card className="space-y-1 p-4">
              <p className="text-sm">
                <span className="font-medium text-accent-ink">{nomeOrganizacao || "—"}</span>
                {(() => {
                  const linha = [representada?.razaoSocial, representada?.cnpj]
                    .filter((v): v is string => Boolean(v && v.trim()))
                    .join(" - ");
                  return linha ? <span className="text-muted-foreground"> - {linha}</span> : null;
                })()}
              </p>
              {representada?.telefone && (
                <p className="text-sm text-muted-foreground">{representada.telefone}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("O pedido sai em nome desta empresa.")}
              </p>
            </Card>
          </section>

          {/* 3 · PRODUTOS */}
          <section id="secao-produtos" aria-label={t("Produtos")} className="space-y-3">
            <TituloDaSecao numero={3}>{t("PRODUTOS")}</TituloDaSecao>

            {/* Tabela, busca e itens vivem no MESMO cartão. Antes a seção 3 era a
            única das quatro sem moldura: os campos flutuavam soltos entre o
            cartão da representada e o resumo, e a página trocava de gramática
            no meio. */}
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label htmlFor="tabela">{textos.tabelaPreco}</Label>
                  <Select
                    value={tabelaId || "__nenhuma"}
                    onValueChange={(v) => setTabelaId(v === "__nenhuma" ? "" : v)}
                  >
                    <SelectTrigger id="tabela" className="w-full">
                      <SelectValue placeholder={textos.semTabela} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhuma">{textos.semTabela}</SelectItem>
                      {tabelas.map((tb) => (
                        <SelectItem key={tb.id} value={tb.id}>
                          {tb.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setIaAberta(true)}
                  data-testid="adicionar-com-ia"
                >
                  <Sparkle size={16} className="mr-1.5" />
                  {t("Adicionar com IA")}
                </Button>
              </div>

              <ProductSearch
                produtos={produtos}
                tabela={tabela}
                ultimosPrecos={ultimos}
                inputRef={buscaRef}
                aoAdicionar={(p, q) => {
                  const prod = porId.get(p.id);
                  if (prod) adicionar(prod, q);
                }}
                textos={{ produtos: textos.produtos, buscarProduto: textos.buscarProduto }}
              />

              <OrderItems
                linhas={linhas}
                aoMudar={mudarLinha}
                aoRemover={(k) => setLinhas((ls) => ls.filter((l) => l.key !== k))}
              />
              {linhas.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("O saldo é conferido ao gerar o pedido; não há reserva de estoque.")}
                </p>
              ) : null}
            </Card>

            <AfinsNoPedido
              carrinho={linhas.map((l) => l.product_id)}
              contatoId={contatoId}
              porId={porId}
              aoAdicionar={adicionar}
            />

            {relacionados.length > 0 && (
              <div className="rounded-2xl border p-3">
                <p className="mb-2 text-sm font-medium">{textos.relacionados}</p>
                <div className="flex flex-wrap gap-2">
                  {relacionados.map((p) => (
                    <Button key={p.id} size="sm" variant="outline" onClick={() => adicionar(p, 1)}>
                      + {p.nome}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {reposicoes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-2xl border p-3 text-sm"
              >
                <p>
                  💡 {r.nome} · {r.qtd} un · {t("a cada")} ~{r.dias} {t("dias")}? ({t("há")}{" "}
                  {r.dias} {t("dias")})
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const p = porId.get(r.id);
                    if (p) adicionar(p, r.qtd);
                  }}
                >
                  {textos.adicionar}
                </Button>
              </div>
            ))}

            {historicoItens.length > 0 && (
              <details className="rounded-2xl border p-3 text-sm">
                <summary className="cursor-pointer font-medium">{textos.historico}</summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {historicoItens.slice(0, 8).map((h, i) => (
                    <li key={i}>
                      {h.produto_nome} · {h.quantidade} un
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Os totais ficam DENTRO de Produtos, como a faixa do Mercos
            (Itens no pedido · Quantidade total · Valor total). Os botões de
            ação saíram daqui: com a página inteira visível, eles pertencem ao
            cabeçalho e à barra do rodapé, não ao meio da tela. */}
          </section>

          {/* 4 · DETALHES DO PEDIDO — os campos que o Mercos deixa aqui. */}
          <section aria-label={t("Detalhes do pedido")} className="space-y-2">
            <TituloDaSecao numero={4}>{t("DETALHES DO PEDIDO")}</TituloDaSecao>
            <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {/* Os campos que o Mercos mostra como leitura: número (que ainda
              não existe), data da emissão (hoje) e vendedor (quem está
              logado). São leitura porque não são decisão de quem vende. */}
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">{t("Nº do pedido")}</span>
                <p className="text-sm font-medium">{t("novo")}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">{t("Data da emissão")}</span>
                <p className="text-sm font-medium">{hoje ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">{t("Vendedor")}</span>
                <p className="text-sm font-medium">{nomeVendedor || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">{t("Valor do frete")}</span>
                <p className="text-sm font-medium tabular-nums">
                  {freteCents > 0 ? comoMoeda(freteCents, "BRL") : "—"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="condicao">{textos.condicao}</Label>
                <Input
                  id="condicao"
                  value={condicao}
                  onChange={(e) => setCondicao(e.target.value)}
                  placeholder="30/60/90 dias"
                />
              </div>
              {/* ─── FORMA DE PAGAMENTO + NF ──────────────────────────────────────
               *
               * A caixa de NF fica ao lado do prazo, e não numa tela separada, por
               * um motivo concreto: quem marca "é com nota" está decidindo quando o
               * dinheiro entra. São a mesma decisão.
               *
               * E o aviso de prazo dependente da nota é o que impede o erro que o
               * campo sozinho permitiria: marcar 30 dias e ver uma data de
               * vencimento que ainda não existe. A tela diz que a data nasce com a
               * emissão — que é verdade, e é o que `vencimentoDoRecebimento`
               * devolve para `aguardando_nf`.
               */}
              <div className="space-y-1.5">
                <Label htmlFor="forma-pagamento">{textos.formaPagamento}</Label>
                <select
                  id="forma-pagamento"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as FormaDePagamento | "")}
                >
                  <option value="">{textos.prazoLivre}</option>
                  {(Object.keys(FORMA_DE_PAGAMENTO_LABEL) as FormaDePagamento[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMA_DE_PAGAMENTO_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">{textos.exigeNf}</span>
                <label
                  htmlFor="exige-nf"
                  className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <input
                    id="exige-nf"
                    type="checkbox"
                    checked={exigeNf}
                    onChange={(e) => setExigeNf(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-border accent-primary"
                  />
                  <span>{textos.exigeNfOpcao}</span>
                </label>
                {formaPagamento !== "" && formaPagamento !== "a_vista" && !exigeNf && (
                  <p className="text-xs text-muted-foreground">{textos.prazoPrecisaNf}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transportadora">{textos.transportadora}</Label>
                <Input
                  id="transportadora"
                  value={transportadora}
                  onChange={(e) => setTransportadora(e.target.value)}
                />
              </div>
              {/* 0276 — os dois campos do Mercos que não existiam: o código que a
              transportadora devolve e a pessoa que pediu do lado do cliente. */}
              <div className="space-y-1.5">
                <Label htmlFor="rastreamento">{t("Rastreamento")}</Label>
                <Input
                  id="rastreamento"
                  value={rastreamento}
                  onChange={(e) => setRastreamento(e.target.value)}
                  placeholder={t("Código de rastreio da transportadora")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contato-no-cliente">{t("Contato no cliente")}</Label>
                <Input
                  id="contato-no-cliente"
                  value={contatoNoCliente}
                  onChange={(e) => setContatoNoCliente(e.target.value)}
                  placeholder={t("Quem fez o pedido")}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="endereco">{textos.endereco}</Label>
                <Input
                  id="endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder={textos.enderecoExemplo}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="obs">{textos.observacoes}</Label>
                <Input
                  id="obs"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="obs-interna">{textos.obsInterna}</Label>
                <Input
                  id="obs-interna"
                  value={obsInterna}
                  onChange={(e) => setObsInterna(e.target.value)}
                />
              </div>
            </Card>
          </section>
        </div>

        {/* O RESUMO PERSISTENTE — estudo C: no desktop ele fica a 1.200–1.400 px
            da dobra e o vendedor rola para ver o total. Aqui vira coluna que
            acompanha a rolagem; no celular é bloco ao fim do fluxo (os campos de
            desconto e frete moram nele) e a barra fixa garante total + ação. */}
        <aside className="lg:col-span-4" aria-label={t("Resumo do pedido")}>
          <div className="lg:sticky lg:top-4">
            <OrderSummary
              totais={{
                subtotal,
                descontoCents: descontoCents + descontoPctCents,
                freteCents,
                total,
                qtdItens: linhas.length,
                qtdUnidades,
                margemPct,
                comissaoCents,
                parcelas: calcularParcelas(total, condicao),
                aprovacaoNecessaria,
              }}
              descontoMaxPct={descontoMaxVendedorPct}
              descontoTexto={descontoTexto}
              aoDesconto={setDescontoTexto}
              descontoPctTexto={descontoPctTexto}
              aoDescontoPct={setDescontoPctTexto}
              freteTexto={freteTexto}
              aoFrete={setFreteTexto}
              enviando={enviando}
              aoSalvar={() => void comEnvio("rascunho")}
              aoFinalizar={() => void comEnvio("aprovado")}
              mostrarAcoes={false}
              textos={{
                subtotal: textos.subtotal,
                desconto: textos.desconto,
                frete: textos.frete,
                total: textos.total,
                salvarRascunho: textos.salvarRascunho,
                finalizar: textos.finalizar,
                margem: textos.margem,
                comissao: textos.comissao,
                aguardandoAprovacao: textos.aguardandoAprovacao,
                descontoTotal: t("Desconto total"),
                descontosSomam: t("R$ e % somam"),
                tetoDesconto: t("Teto de desconto do vendedor"),
                revisar: textos.revisar,
                itensUnidades: (itens, un) => `${itens} itens · ${un} un`,
              }}
            />
          </div>
        </aside>
      </div>

      {/* A barra de ação do Mercos, no rodapé: no celular ela fica fixa, porque
          "Gerar pedido" não pode exigir rolar quatro seções de volta. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-background px-4 pt-2.5 pb-2.5 lg:hidden"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-muted-foreground">
          {linhas.length} {t("itens")} · {qtdUnidades} un
        </p>
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold tabular-nums">{comoMoeda(total, "BRL")}</p>
          <Button
            onClick={() => void comEnvio("aprovado")}
            disabled={enviando}
            data-testid="gerar-pedido-barra"
          >
            {enviando ? t("Gerando…") : textos.finalizar}
          </Button>
        </div>
      </div>

      {/* A prévia não grava nada: é o "Visualizar" do Mercos. */}
      <Dialog open={previaAberta} onOpenChange={setPreviaAberta}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Prévia do pedido")}</DialogTitle>
            <DialogDescription>
              {t("Como o pedido vai sair. Nada foi gravado ainda.")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{t("Cliente")}</dt>
              <dd className="font-medium">{clienteNome || "—"}</dd>
              <dt className="text-muted-foreground">{textos.condicao}</dt>
              <dd className="font-medium">{condicao.trim() || "—"}</dd>
              <dt className="text-muted-foreground">{textos.formaPagamento}</dt>
              <dd className="font-medium">
                {formaPagamento ? FORMA_DE_PAGAMENTO_LABEL[formaPagamento] : textos.prazoLivre}
              </dd>
              <dt className="text-muted-foreground">{textos.exigeNf}</dt>
              <dd className="font-medium">{exigeNf ? t("Sim") : t("Não")}</dd>
              {endereco.trim() ? (
                <>
                  <dt className="text-muted-foreground">{textos.endereco}</dt>
                  <dd className="font-medium">{endereco}</dd>
                </>
              ) : null}
            </dl>

            <ul className="divide-y rounded-lg border">
              {linhas.length === 0 ? (
                <li className="px-3 py-2 text-muted-foreground">{t("Nenhum item.")}</li>
              ) : (
                linhas.map((l) => {
                  const unit = precoParaCentavos(l.precoTexto) ?? 0;
                  const linha = subtotalDoItem(l.quantidade, unit, l.descontoPct);
                  return (
                    <li key={l.key} className="space-y-0.5 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{l.nome}</span>
                        <span className="shrink-0 tabular-nums">{comoMoeda(linha, "BRL")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {l.quantidade}
                        {l.unidade ? ` ${l.unidade}` : ""} × {comoMoeda(unit, "BRL")}
                        {l.descontoPct > 0 ? ` · ${t("desconto")} ${l.descontoPct}%` : ""}
                        {l.origemPreco === "tabela"
                          ? ` · ${t("preço da tabela")}`
                          : l.origemPreco === "manual"
                            ? ` · ${t("preço manual")}`
                            : ""}
                      </p>
                    </li>
                  );
                })
              )}
            </ul>

            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{textos.subtotal}</dt>
                <dd className="tabular-nums">{comoMoeda(subtotal, "BRL")}</dd>
              </div>
              {descontoCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{textos.desconto} (R$)</dt>
                  <dd className="tabular-nums">− {comoMoeda(descontoCents, "BRL")}</dd>
                </div>
              ) : null}
              {descontoPct > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{textos.desconto} (%)</dt>
                  <dd className="tabular-nums">
                    − {comoMoeda(descontoPctCents, "BRL")} ({descontoPct.toLocaleString("pt-BR")}%)
                  </dd>
                </div>
              ) : null}
              {freteCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{textos.frete}</dt>
                  <dd className="tabular-nums">{comoMoeda(freteCents, "BRL")}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>{textos.total}</dt>
                <dd className="tabular-nums">{comoMoeda(total, "BRL")}</dd>
              </div>
            </dl>

            {calcularParcelas(total, condicao).length > 0 ? (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {calcularParcelas(total, condicao).map((p) => (
                  <li key={p.n} className="flex justify-between">
                    <span>
                      {p.n}ª · {p.vencimento}
                    </span>
                    <span className="tabular-nums">{comoMoeda(p.valor_cents, "BRL")}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {observacoes.trim() ? (
              <p>
                <span className="text-muted-foreground">{textos.observacoes}: </span>
                {observacoes}
              </p>
            ) : null}
            {obsInterna.trim() ? (
              <p>
                <span className="text-muted-foreground">{textos.obsInterna}: </span>
                {obsInterna}
              </p>
            ) : null}
            {aprovacaoNecessaria ? (
              <p
                role="alert"
                className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-warning-fg"
              >
                ⚠ {textos.aguardandoAprovacao}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviaAberta(false)}>
              {t("Fechar")}
            </Button>
            <Button
              onClick={() => {
                setPreviaAberta(false);
                void comEnvio("aprovado");
              }}
              disabled={enviando}
            >
              {textos.finalizar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O rascunho é de outro cliente e o link trouxe este. A tela abre com o
          cliente do link; a decisão sobre o rascunho é explícita e vem antes
          de qualquer gravação (o autosave fica desligado enquanto isso). */}
      <Dialog open={conflitoDeRascunho !== null}>
        <DialogContent data-testid="conflito-rascunho">
          <DialogHeader>
            <DialogTitle>{textos.rascunhoDeOutroCliente}</DialogTitle>
            <DialogDescription>{textos.rascunhoDeOutroClienteDesc}</DialogDescription>
          </DialogHeader>
          {conflitoDeRascunho ? (
            <dl className="space-y-1 text-sm">
              <div className="flex gap-1">
                <dt className="text-muted-foreground">{textos.cliente}:</dt>
                <dd className="font-medium">{clienteNome || t("Sem nome")}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">{t("Rascunho")}:</dt>
                <dd className="font-medium">
                  {conflitoDeRascunho.clienteNome || t("Sem nome")} ·{" "}
                  {conflitoDeRascunho.linhas.length} {t("item(ns)")}
                </dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (conflitoDeRascunho) aplicarRascunho(conflitoDeRascunho);
                setConflitoDeRascunho(null);
                esquecerClienteDoLink();
              }}
            >
              {textos.continuarRascunho}
            </Button>
            <Button
              onClick={() => {
                limpar();
                setConflitoDeRascunho(null);
                esquecerClienteDoLink();
              }}
            >
              {textos.usarClienteDoLink}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdicionarComIa
        aberto={iaAberta}
        aoFechar={() => setIaAberta(false)}
        produtos={produtos}
        tabela={tabela}
        aoAdicionar={(itens) => {
          for (const item of itens) adicionar(item.produto, item.quantidade);
        }}
      />
    </div>
  );
}

/**
 * O número da seção, como no Mercos (1 CLIENTE · 2 REPRESENTADA · 3 PRODUTOS ·
 * 4 DETALHES DO PEDIDO). Âncora de leitura, não passo de formulário.
 */
function TituloDaSecao({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-foreground">
        {numero}
      </span>
      {children}
    </p>
  );
}
