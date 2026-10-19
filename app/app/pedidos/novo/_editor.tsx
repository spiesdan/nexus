"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
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
import { CaretDown, Eye } from "@/lib/ui/icons";
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
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
import { precoParaCentavos, type Produto } from "@/lib/schemas/produtos";
import { calcularParcelas, subtotalDoItem } from "@/lib/schemas/pedidos";
import { CustomerSelector, type ContatoOpcao } from "./_cliente";
import { ProductSearch, type PrecoDeTabela, type UltimoPreco } from "./_produtos";
import { OrderItems, type LinhaDoPedido } from "./_itens";
import { AfinsNoPedido } from "./_afins";
import { FORMA_DE_PAGAMENTO_LABEL, type FormaDePagamento } from "@/lib/comercial/pedido-fiscal";
import { OrderSummary } from "./_resumo";
import { haQuantoTempo, useAutosaveDraft } from "./_autosave";
import { useOrderShortcuts } from "./_atalhos";

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
  tabelas,
  verMargem,
  comissaoPct,
  nomeOrganizacao,
  textos,
}: {
  produtos: Produto[];
  contatos: ContatoOpcao[];
  tabelas: { id: string; nome: string; desconto_pct: number }[];
  verMargem: boolean;
  comissaoPct: number | null;
  /** A "representada" do Mercos: a empresa que emite este pedido. */
  nomeOrganizacao: string;
  textos: TextosBase;
}) {
  const t = useT();
  const router = useRouter();
  const buscaRef = React.useRef<HTMLInputElement | null>(null);

  const [contatoId, setContatoId] = React.useState<string | null>(null);
  const [clienteNome, setClienteNome] = React.useState("");
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
  const [tabelaId, setTabelaId] = React.useState("");
  const [tabela, setTabela] = React.useState<PrecoDeTabela | null>(null);
  const [descontoTexto, setDescontoTexto] = React.useState("");
  const [descontoPctTexto, setDescontoPctTexto] = React.useState("");
  const [freteTexto, setFreteTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [aprovacao, setAprovacao] = React.useState(false);
  // Uma página só, como o Mercos: as quatro seções (cliente, representada,
  // produtos, detalhes) ficam todas visíveis e o estado é único. Nada de passo
  // escondendo campo — o vendedor confere o pedido inteiro antes de gerar.
  const [previaAberta, setPreviaAberta] = React.useState(false);
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

  // Autosave (§31).
  const { salvoEm, carregar, limpar } = useAutosaveDraft(
    "pedido-rascunho",
    {
      contatoId,
      clienteNome,
      linhas,
      condicao,
      formaPagamento,
      exigeNf,
      observacoes,
      obsInterna,
      endereco,
      transportadora,
      tabelaId,
      descontoTexto,
      descontoPctTexto,
      freteTexto,
    },
    true,
  );
  // Restauração única do autosave (montagem): sem ela, fechar o navegador
  // no meio da venda perde tudo (§31).
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    const salvo = carregar();
    if (
      salvo &&
      Array.isArray(salvo.linhas) &&
      (salvo.linhas as unknown[]).length > 0 &&
      linhas.length === 0
    ) {
      const s = salvo as unknown as {
        contatoId: string | null;
        clienteNome: string;
        linhas: LinhaDoPedido[];
        condicao: string;
        formaPagamento?: FormaDePagamento | "";
        exigeNf?: boolean;
        observacoes: string;
      };
      setContatoId(s.contatoId);
      setClienteNome(s.clienteNome);
      setLinhas(s.linhas);
      setCondicao(s.condicao ?? "");
      // Rascunho salvo antes da 0261 não tem os dois campos. `|| ""` e `?? false`
      // em vez de acesso direto: um rascunho de ontem não pode fazer a tela
      // quebrar em `undefined`.
      setFormaPagamento(s.formaPagamento ?? "");
      setExigeNf(s.exigeNf ?? false);
      setObservacoes(s.observacoes ?? "");
      nexusToast.info(textos.rascunhoRestaurado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  async function enviar(status: "rascunho" | "aprovado") {
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
        itens,
      });
      if (pedido.aprovacao_necessaria) setAprovacao(true);
      nexusToast.success(`${textos.pedidoCriado}: PED-${String(pedido.numero).padStart(4, "0")}`);
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
    finalizar: () => void enviar("aprovado"),
    desfocar: () => (document.activeElement as HTMLElement | null)?.blur(),
  });

  async function comEnvio(status: "rascunho" | "aprovado") {
    setEnviando(true);
    try {
      await enviar(status);
    } finally {
      setEnviando(false);
    }
  }

  /** Rola até a seção: validação que reclama longe do campo não ensina nada. */
  function irPara(secao: "cliente" | "produtos") {
    document
      .getElementById(`secao-${secao}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-28 sm:p-6 lg:pb-6">
      <NexusPageHeader
        title={textos.titulo}
        subtitle={
          linhas.length > 0 && salvoEm
            ? `${textos.subtitulo} · ${t("salvo")} ${haQuantoTempo(salvoEm) ?? ""}`
            : textos.subtitulo
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void comEnvio("aprovado")}
              disabled={enviando}
              data-testid="gerar-pedido"
            >
              {enviando ? t("Gerando…") : textos.finalizar}
            </Button>
            <Button variant="outline" onClick={() => setPreviaAberta(true)}>
              <Eye size={16} className="mr-1.5" /> {t("Visualizar")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
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
          <p className="font-medium">{nomeOrganizacao || "—"}</p>
          <p className="text-sm text-muted-foreground">
            {t("O pedido sai em nome desta empresa.")}
          </p>
        </Card>
      </section>

      {/* 3 · PRODUTOS */}
      <section id="secao-produtos" aria-label={t("Produtos")} className="space-y-3">
        <TituloDaSecao numero={3}>{t("PRODUTOS")}</TituloDaSecao>

        <div className="space-y-1.5">
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
              💡 {r.nome} · {r.qtd} un · {t("a cada")} ~{r.dias} {t("dias")}? ({t("há")} {r.dias}{" "}
              {t("dias")})
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
            aprovacaoNecessaria: aprovacao,
          }}
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
            revisar: textos.revisar,
            itensUnidades: (itens, un) => `${itens} itens · ${un} un`,
          }}
        />
      </section>

      {/* 4 · DETALHES DO PEDIDO — os campos que o Mercos deixa aqui. */}
      <section aria-label={t("Detalhes do pedido")} className="space-y-2">
        <TituloDaSecao numero={4}>{t("DETALHES DO PEDIDO")}</TituloDaSecao>
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
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
            <Input id="obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
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

      {/* A barra de ação do Mercos, no rodapé: no celular ela fica fixa, porque
          "Gerar pedido" não pode exigir rolar quatro seções de volta. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-background p-3 lg:static lg:rounded-xl lg:border lg:bg-card">
        <p className="text-sm text-muted-foreground">
          {linhas.length} {t("itens")} · {qtdUnidades} un
        </p>
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold tabular-nums">{comoMoeda(total, "BRL")}</p>
          <Button onClick={() => void comEnvio("aprovado")} disabled={enviando}>
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
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">{t("Cliente")}: </span>
              <strong>{clienteNome || "—"}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">{textos.condicao}: </span>
              <strong>{condicao.trim() || "—"}</strong>
            </p>
            <ul className="divide-y rounded-lg border">
              {linhas.length === 0 ? (
                <li className="px-3 py-2 text-muted-foreground">{t("Nenhum item.")}</li>
              ) : (
                linhas.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{l.nome}</span>
                    <span className="shrink-0 tabular-nums">
                      {l.quantidade} × {comoMoeda(precoParaCentavos(l.precoTexto) ?? 0, "BRL")}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>{textos.total}</span>
              <span className="tabular-nums">{comoMoeda(total, "BRL")}</span>
            </div>
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
