"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ApiError } from "@/lib/api/types";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import {
  extrasFiscaisSchema,
  FORMAS_DE_PAGAMENTO,
  MODALIDADES_DE_FRETE,
  ROTULO_DA_FORMA_DE_PAGAMENTO,
  ROTULO_DA_MODALIDADE_DE_FRETE,
  type ConfigFiscalSalva,
  type ExtrasFiscais,
  type FormaDePagamento,
  type ModalidadeDeFrete,
} from "@/lib/schemas/fiscal";
import { type PedidoComercial } from "@/lib/schemas/pedidos";
import type { ContatoFiscal, DestinatarioDaNota } from "@/lib/fiscal/destinatario-da-nota";
import { camposDaAvulsa, precedenciaDigitado } from "@/lib/fiscal/avulsa-preenchimento";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { Receipt } from "@/lib/ui/icons";

import type { Produto } from "@/lib/schemas/produtos";
import { ProductSearch, type PrecoDeTabela, type UltimoPreco } from "../../pedidos/novo/_produtos";
import { CustomerSelector } from "../../pedidos/novo/_cliente";
import type { Textos } from "./textos";

/**
 * Faturado + o destinatário já resolvido do cadastro (nome, CPF/CNPJ e o
 * TLocal com cMun do IBGE). Vem pronto do servidor: a tela não recalcula a
 * regra, só preenche e deixa corrigir.
 */
export type PedidoFaturavel = PedidoComercial & { destinatario?: DestinatarioDaNota };

type Transporte = NonNullable<ExtrasFiscais["transporte"]>;
type Cobranca = NonNullable<ExtrasFiscais["cobranca"]>;
type Adicionais = NonNullable<ExtrasFiscais["adicionais"]>;
type Entrega = NonNullable<ExtrasFiscais["entrega"]>;

/**
 * Item da venda avulsa no formulário — tudo em string; a conversão acontece na
 * montagem dos extras (`emitirAvulsa`). `codigo`/`product_id`/`unidade` acompanham
 * o item quando ele foi preenchido pelo seletor de catálogo (`ProdutoParaItem`).
 */
export type ItemDaVendaAvulsa = {
  descricao: string;
  quantidade: string;
  preco_cents: string;
  desconto_pct: string;
  ncm: string;
  codigo?: string;
  unidade?: string;
  product_id?: string | null;
};

/** O item como a prévia da nota lê (GET /commercial-orders/[id]). */
type ItemDaNota = {
  id: string;
  produto_codigo: string;
  produto_nome: string;
  quantidade: number;
  preco_unit_cents: number;
  subtotal_cents: number;
};

/** Tudo vira string no formulário; a conversão acontece na montagem dos extras. */
export type ExtrasDoFormulario = {
  modalidade: string;
  transportadorNome: string;
  transportadorDocumento: string;
  volumesQuantidade: string;
  volumesEspecie: string;
  pesoLiquido: string;
  pesoBruto: string;
  formaPagamento: string;
  descricaoPagamento: string;
  parcelas: string;
  primeiroVencimento: string;
  diasEntre: string;
  informacoesComplementares: string;
  informacoesFisco: string;
  destinatarioNome: string;
  destinatarioDocumento: string;
  destinatarioIe: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string;
  entregaBairro: string;
  entregaMunicipio: string;
  entregaCodigoMunicipio: string;
  entregaUf: string;
  entregaCep: string;
};

/**
 * Estado inicial — `modalidade` já em `9` (sem operação de frete, o padrão da
 * NF-e) e `parcelas` em `1` (à vista): o formulário começa sem diferença em
 * relação a não enviar extras, e o grupo só é gravado quando alguém mexe.
 */
export const EXTRAS_VAZIOS: ExtrasDoFormulario = {
  modalidade: "9",
  transportadorNome: "",
  transportadorDocumento: "",
  volumesQuantidade: "",
  volumesEspecie: "",
  pesoLiquido: "",
  pesoBruto: "",
  formaPagamento: "",
  descricaoPagamento: "",
  parcelas: "1",
  primeiroVencimento: "",
  diasEntre: "30",
  informacoesComplementares: "",
  informacoesFisco: "",
  destinatarioNome: "",
  destinatarioDocumento: "",
  destinatarioIe: "",
  entregaLogradouro: "",
  entregaNumero: "",
  entregaComplemento: "",
  entregaBairro: "",
  entregaMunicipio: "",
  entregaCodigoMunicipio: "",
  entregaUf: "",
  entregaCep: "",
};

/** O que veio do pedido e deve ser gravado no cadastro, campo a campo. */
const CAMPO_DO_PEDIDO_PARA_FORM: Record<string, keyof ExtrasDoFormulario> = {
  logradouro: "entregaLogradouro",
  numero: "entregaNumero",
  complemento: "entregaComplemento",
  bairro: "entregaBairro",
  cidade: "entregaMunicipio",
  uf: "entregaUf",
  cep: "entregaCep",
};
const CAMPO_DO_PEDIDO_PARA_API: Record<string, string> = {
  logradouro: "logradouro",
  numero: "numero_end",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  uf: "uf",
  cep: "cep",
};

function ehModalidade(v: string): v is ModalidadeDeFrete {
  return (MODALIDADES_DE_FRETE as readonly string[]).includes(v);
}

function ehForma(v: string): v is FormaDePagamento {
  return (FORMAS_DE_PAGAMENTO as readonly string[]).includes(v);
}

function numero(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Do formulário para o objeto que a nota guarda (jsonb). `undefined` quando
 * ninguém tocou em nada — aí a nota fica sem extras e a emissão segue como
 * sempre foi. Os grupos aqui existem: um grupo preenchido pela metade é erro
 * do zod, não motivo para emitir incompleto.
 */
export function montarExtras(v: ExtrasDoFormulario): ExtrasFiscais | undefined {
  const extras: ExtrasFiscais = {};

  const documento = v.transportadorDocumento.replace(/\D/g, "");
  const temTransportador = v.transportadorNome.trim() !== "" || documento !== "";
  const temVolumes = v.volumesQuantidade.trim() !== "";
  if (v.modalidade !== "9" || temTransportador || temVolumes) {
    const transporte: Transporte = {
      modalidade_frete: ehModalidade(v.modalidade) ? v.modalidade : "9",
    };
    if (temTransportador) {
      transporte.transportador = { nome: v.transportadorNome.trim(), documento };
    }
    if (temVolumes) {
      transporte.volumes = { quantidade: Math.trunc(numero(v.volumesQuantidade)) };
      const especie = v.volumesEspecie.trim();
      if (especie !== "") transporte.volumes.especie = especie;
      if (v.pesoLiquido.trim() !== "") transporte.volumes.peso_liquido_kg = numero(v.pesoLiquido);
      if (v.pesoBruto.trim() !== "") transporte.volumes.peso_bruto_kg = numero(v.pesoBruto);
    }
    extras.transporte = transporte;
  }

  if (v.formaPagamento !== "") {
    const cobranca: Cobranca = {
      forma_pagamento: ehForma(v.formaPagamento) ? v.formaPagamento : "99",
      parcelas: Math.trunc(numero(v.parcelas)),
      dias_entre: Math.trunc(numero(v.diasEntre)),
    };
    if (v.primeiroVencimento.trim() !== "")
      cobranca.primeiro_vencimento = v.primeiroVencimento.trim();
    const descricao = v.descricaoPagamento.trim();
    if (descricao !== "") cobranca.descricao = descricao;
    extras.cobranca = cobranca;
  }

  const complementares = v.informacoesComplementares.trim();
  const fisco = v.informacoesFisco.trim();
  if (complementares !== "" || fisco !== "") {
    const adicionais: Adicionais = {};
    if (complementares !== "") adicionais.informacoes_complementares = complementares;
    if (fisco !== "") adicionais.informacoes_fisco = fisco;
    extras.adicionais = adicionais;
  }

  // Destinatário EDITÁVEL: o cadastro pode estar sem CPF/CNPJ (ou com nome
  // antigo). O que for digitado aqui vale para esta nota e fica gravado nela;
  // o que ficar vazio cai no cadastro.
  const nomeDest = v.destinatarioNome.trim();
  const documentoDest = v.destinatarioDocumento.replace(/\D/g, "");
  const ieDest = v.destinatarioIe.trim();
  if (nomeDest !== "" || documentoDest !== "" || ieDest !== "") {
    extras.destinatario = {
      ...(nomeDest !== "" && { nome: nomeDest }),
      ...(documentoDest !== "" && { documento: documentoDest }),
      ...(ieDest !== "" && { ie: ieDest }),
    } as ExtrasFiscais["destinatario"];
  }

  const endereco = {
    logradouro: v.entregaLogradouro.trim(),
    numero: v.entregaNumero.trim(),
    complemento: v.entregaComplemento.trim(),
    bairro: v.entregaBairro.trim(),
    municipio: v.entregaMunicipio.trim(),
    codigo_municipio: v.entregaCodigoMunicipio.trim(),
    uf: v.entregaUf.trim().toUpperCase(),
    cep: v.entregaCep.replace(/\D/g, ""),
  };
  const temEntrega = Object.values(endereco).some((c) => c !== "");
  if (temEntrega) {
    extras.entrega = {
      logradouro: endereco.logradouro,
      numero: endereco.numero,
      bairro: endereco.bairro,
      municipio: endereco.municipio,
      codigo_municipio: endereco.codigo_municipio,
      uf: endereco.uf,
      ...(endereco.complemento !== "" && { complemento: endereco.complemento }),
      ...(endereco.cep !== "" && { cep: endereco.cep }),
    } as Entrega;
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * Aba "Emitir" — uma tarefa por tela, como nos emissores dedicados: escolhe
 * o pedido faturável (aprovado, concluído, faturado, expedido ou entregue), vê o resumo (cliente +
 * valor), valida e emite. O resultado cai na grade (aba Notas) via refresh.
 */
export function EmitirNota({
  faturados,
  configInicial,
  textos,
}: {
  faturados: PedidoFaturavel[];
  configInicial: ConfigFiscalSalva | null;
  textos: Textos;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [pedidoId, setPedidoId] = React.useState("");
  /**
   * AGRUPAMENTO (0294): outros pedidos do MESMO cliente que entram nesta nota.
   *
   * O cliente que tirou três pedidos no mês quer uma NF-e, não três. A lista
   * só oferece pedidos do mesmo contato — a nota tem um destinatário só, e
   * misturar clientes produziria um documento que a SEFAZ aceita e o fisco
   * contesta. O servidor recusa de novo, com mensagem própria.
   */
  const [agrupados, setAgrupados] = React.useState<string[]>([]);
  const [emitindo, setEmitindo] = React.useState(false);
  const [pendencias, setPendencias] = React.useState<
    { campo: string; mensagem: string; onde: string }[] | null
  >(null);
  const [extras, setExtras] = React.useState<ExtrasDoFormulario>(EXTRAS_VAZIOS);
  /** Itens do pedido para a prévia "campo por campo" (buscados ao escolher). */
  const [itensDaNota, setItensDaNota] = React.useState<ItemDaNota[] | null>(null);
  /**
   * Modo de emissão: NF-e de PEDIDO (aprovado/concluído/faturado/expedido/entregue) ou NF-e de
   * VENDA AVULSA — venda sem pedido (balcão). Na avulsa o fato entra em
   * `extras.avulsa`; o operador conta a venda, a nota não nasce de pedido.
   */
  const [modo, setModo] = React.useState<"pedido" | "avulsa">("pedido");
  /** Campos do formulário da venda avulsa (NF-e sem pedido). */
  const [avulsa, setAvulsa] = React.useState<{
    cliente_nome: string;
    cliente_documento: string;
    frete_cents: string;
    itens: ItemDaVendaAvulsa[];
    /** Contato cadastrado que puxou o nome (a NF-e completa pelo cadastro). */
    contato_id: string;
  }>({
    cliente_nome: "",
    cliente_documento: "",
    frete_cents: "0",
    // V1: só item de catálogo — a lista nasce vazia e o produto entra pelo
    // ProductSearch (NCM vem do cadastro; texto livre fica para janeiro).
    itens: [],
    contato_id: "",
  });

  /** Catálogo para o ProductSearch — carregado uma vez, como no seletor antigo. */
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = React.useState(false);
  const buscaProdutoRef = React.useRef<HTMLInputElement | null>(null);
  const [erroEmissao, setErroEmissao] = React.useState<string | null>(null);
/** Um clique = uma nota: o ref barra o segundo clique antes do re-render. */
  const emitindoRef = React.useRef(false);
  /**
   * CHAVE ESTÁVEL DA EMISSÃO — criada quando o formulário fica pronto e
   * reutilizada em retry/reenvio até a nota sair; nova só depois do sucesso.
   * O `randomId()` automático do client muda a cada chamada e não fecha o
   * duplo envio (a rota faz reserva forte por chave, route.ts:74-110).
   */
  const chaveIdempotenciaRef = React.useRef<string | null>(null);
  const precosVazios = React.useMemo(() => new Map<string, UltimoPreco>(), []);

  React.useEffect(() => {
    let vivo = true;
    setCarregandoProdutos(true);
    apiClient
      .get<{ data: Produto[] }>("/api/v1/products?limite=2000")
      .then((r) => {
        if (vivo) setProdutos(Array.isArray(r.data) ? r.data : []);
      })
      .catch((e: unknown) => {
        if (vivo) showApiError(e);
      })
      .finally(() => {
        if (vivo) setCarregandoProdutos(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const alterar =
    (campo: keyof ExtrasDoFormulario) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setExtras((a) => ({ ...a, [campo]: e.target.value }));
    };

  /**
   * NF-E AVULSA — ao escolher o cliente pelo cadastro, preenche o destinatário
   * e a entrega com a MESMA regra do pedido (`montarDestinatario`), inclusive o
   * CPF que o Mercos deixou em `source_metadata`. O que o operador digitou
   * continua valendo; o cadastro só entra onde está vazio. Cadastro sem
   * endereço vira pendência nomeada, não silêncio.
   */
  const aoEscolherClienteAvulso = React.useCallback((id: string | null, nome: string) => {
    setAvulsa((atual) => ({ ...atual, contato_id: id ?? "", cliente_nome: nome }));
    if (!id) return;
    void (async () => {
      const r = await apiClient
        .get<{ data: ContatoFiscal }>(`/api/v1/contacts/${id}`)
        .catch(() => null);
      const contato = r?.data;
      if (!contato) return;
      const { campos, faltando } = camposDaAvulsa(contato, nome);
      setAvulsa((atual) => ({
        ...atual,
        contato_id: id,
        cliente_nome: precedenciaDigitado(atual.cliente_nome, campos.cliente_nome),
        cliente_documento: precedenciaDigitado(atual.cliente_documento, campos.cliente_documento),
      }));
      setExtras((atual) => ({
        ...atual,
        destinatarioNome: precedenciaDigitado(atual.destinatarioNome, campos.destinatarioNome),
        destinatarioDocumento: precedenciaDigitado(
          atual.destinatarioDocumento,
          campos.destinatarioDocumento,
        ),
        destinatarioIe: precedenciaDigitado(atual.destinatarioIe, campos.destinatarioIe),
        entregaLogradouro: precedenciaDigitado(atual.entregaLogradouro, campos.entregaLogradouro),
        entregaNumero: precedenciaDigitado(atual.entregaNumero, campos.entregaNumero),
        entregaComplemento: precedenciaDigitado(
          atual.entregaComplemento,
          campos.entregaComplemento,
        ),
        entregaBairro: precedenciaDigitado(atual.entregaBairro, campos.entregaBairro),
        entregaMunicipio: precedenciaDigitado(atual.entregaMunicipio, campos.entregaMunicipio),
        entregaCodigoMunicipio: precedenciaDigitado(
          atual.entregaCodigoMunicipio,
          campos.entregaCodigoMunicipio,
        ),
        entregaUf: precedenciaDigitado(atual.entregaUf, campos.entregaUf),
        entregaCep: precedenciaDigitado(atual.entregaCep, campos.entregaCep),
      }));
      setPendencias(
        faltando.length > 0
          ? faltando.map((falta) => ({
              campo: "cliente",
              mensagem: `Cliente: ajuste ${falta}`,
              onde: `/app/contacts/${id}`,
            }))
          : null,
      );
    })();
  }, []);

  const escolhido = faturados.find((p) => p.id === pedidoId) ?? null;
  /** Campos preenchidos do endereço do PEDIDO porque faltavam no cadastro. */
  const camposDoPedido = Object.entries(escolhido?.destinatario?.origem ?? {})
    .filter(([, origem]) => origem === "pedido")
    .map(([campo]) => campo)
    .filter((campo) => campo in CAMPO_DO_PEDIDO_PARA_FORM);

  React.useEffect(() => {
    if (!pedidoId) {
      setItensDaNota(null);
      return;
    }
    let vivo = true;
    void apiClient
      .get<{ data: { itens: ItemDaNota[] } }>(`/api/v1/commercial-orders/${pedidoId}`)
      .then((r) => {
        if (vivo) setItensDaNota(r.data.itens ?? []);
      })
      .catch(() => {
        if (vivo) setItensDaNota([]);
      });
    return () => {
      vivo = false;
    };
  }, [pedidoId]);

  // O que a nota vai levar, com o formulário vencendo o cadastro. É a MESMA
  // regra que o servidor aplica em `montarExtras` + `montarDestinatario`.
  const entregaResolvida = escolhido?.destinatario?.entrega ?? null;
  const nomeEfetivo =
    extras.destinatarioNome.trim() ||
    escolhido?.destinatario?.nome ||
    escolhido?.cliente_nome ||
    "";
  const documentoEfetivo =
    extras.destinatarioDocumento.replace(/\D/g, "") ||
    escolhido?.destinatario?.documento ||
    escolhido?.cliente_documento ||
    "";
  const ieEfetiva = extras.destinatarioIe.trim() || escolhido?.destinatario?.ie || "";
  const enderecoEfetivo = [
    extras.entregaLogradouro.trim() || entregaResolvida?.logradouro,
    extras.entregaNumero.trim() || entregaResolvida?.numero,
    extras.entregaBairro.trim() || entregaResolvida?.bairro,
    [
      extras.entregaMunicipio.trim() || entregaResolvida?.municipio,
      extras.entregaUf.trim() || entregaResolvida?.uf,
    ]
      .filter(Boolean)
      .join("/"),
    extras.entregaCep.replace(/\D/g, "") || entregaResolvida?.cep,
  ]
    .filter(Boolean)
    .join(", ");

  const selecionados = pedidoId ? [pedidoId, ...agrupados] : [];
  const pedidosDaNota = faturados.filter((p) => selecionados.includes(p.id));
  const totalDaNota = pedidosDaNota.reduce((soma, p) => soma + p.total_cents, 0);
  // Só entram na lista os pedidos do mesmo cliente do pedido principal.
  const doMesmoCliente = escolhido
    ? faturados.filter(
        (p) =>
          p.id !== escolhido.id && p.contact_id != null && p.contact_id === escolhido.contact_id,
      )
    : [];

  /**
   * Trocar de pedido troca o endereço de entrega — manter o do cliente anterior
   * seria o pior erro possível nesta tela (NF-e com a entrega de outro
   * cliente). O que o cadastro tem preenche; o que ele não tem fica vazio, para
   * completar aqui. Corrigir na tela continua valendo: o que for digitado
   * vence o cadastro na emissão.
   */
  function escolherPedido(id: string) {
    setPedidoId(id);
    setAgrupados([]);
    setPendencias(null);
    const pedido = faturados.find((p) => p.id === id);
    const entrega = pedido?.destinatario?.entrega ?? null;
    setExtras((atual) => ({
      ...atual,
      // O que o cliente escreveu em "Informações adicionais" do pedido (a
      // ordem de compra, por exemplo) já vem preenchido aqui — e visível, para
      // ninguém descobrir depois que a nota saiu com um texto que não leu.
      // Trocar de pedido troca o texto, como troca o endereço: manter o do
      // anterior seria pôr a ordem de compra de um cliente na nota de outro.
      informacoesComplementares: (pedido?.informacoes_fiscais ?? pedido?.observacoes ?? "").trim(),
      destinatarioNome: pedido?.destinatario?.nome ?? pedido?.cliente_nome ?? "",
      destinatarioDocumento: pedido?.destinatario?.documento ?? pedido?.cliente_documento ?? "",
      destinatarioIe: pedido?.destinatario?.ie ?? "",
      entregaLogradouro: entrega?.logradouro ?? "",
      entregaNumero: entrega?.numero ?? "",
      entregaComplemento: entrega?.complemento ?? "",
      entregaBairro: entrega?.bairro ?? "",
      entregaMunicipio: entrega?.municipio ?? "",
      entregaCodigoMunicipio: entrega?.codigo_municipio ?? "",
      entregaUf: entrega?.uf ?? "",
      entregaCep: entrega?.cep ?? "",
    }));
  }

  /** Confirma o que veio do pedido no cadastro: a próxima nota não repete o trabalho. */
  async function salvarEnderecoNoCadastro() {
    const contatoId = escolhido?.contact_id;
    if (!contatoId || camposDoPedido.length === 0) return;
    const corpo: Record<string, string> = {};
    for (const campo of camposDoPedido) {
      const valor = extras[CAMPO_DO_PEDIDO_PARA_FORM[campo]!].trim();
      if (valor) corpo[CAMPO_DO_PEDIDO_PARA_API[campo]!] = valor;
    }
    if (Object.keys(corpo).length === 0) return;
    try {
      await apiClient.patch(`/api/v1/contacts/${contatoId}`, corpo);
      toast.success(t("Endereço salvo no cadastro do cliente."));
    } catch (e) {
      if (e instanceof Error) showApiError(e);
      else toast.error(t("Não foi possível salvar no cadastro."));
    }
  }

  /**
   * V1 CATÁLOGO-ONLY: o produto escolhido no ProductSearch vira item com
   * descrição, NCM e unidade do cadastro — NCM não se digita e não há palpite.
   * Preço continua com o operador (fato do balcão, não do catálogo). Repetir o
   * mesmo produto soma a quantidade na mesma linha.
   */
  function adicionarProdutoDoCatalogo(produto: Produto, quantidade: number) {
    setAvulsa((a) => {
      const idx = a.itens.findIndex((i) => i.product_id === produto.id);
      if (idx >= 0) {
        return {
          ...a,
          itens: a.itens.map((x, j) =>
            j === idx
              ? { ...x, quantidade: String(Math.max(1, (Number(x.quantidade) || 0) + quantidade)) }
              : x,
          ),
        };
      }
      return {
        ...a,
        itens: [
          ...a.itens,
          {
            descricao: produto.nome,
            quantidade: String(Math.max(1, quantidade)),
            preco_cents: "",
            desconto_pct: "0",
            ncm: produto.ncm ?? "",
            codigo: produto.codigo ?? "",
            unidade: produto.unidade ?? "",
            product_id: produto.id,
          },
        ],
      };
    });
  }

  /**
   * NF-E AVULSA — venda sem pedido: o fato entra em `extras.avulsa`. Não há
   * pedido por trás, então a pré-validação é do fato informado (destinatário +
   * itens) e a nota nasce sem `order_id`.
   */
  async function emitirAvulsa() {
    const itensPayload = avulsa.itens
      .map((i) => ({
        product_id: i.product_id ?? null,
        codigo: i.codigo || undefined,
        descricao: i.descricao.trim(),
        ncm: i.ncm.trim() || undefined,
        cfop: undefined,
        unidade: i.unidade || undefined,
        quantidade: Math.max(0, Math.trunc(Number(i.quantidade)) || 0),
        preco_cents: Math.round((Number(i.preco_cents) || 0) * 100),
        desconto_pct: Number(i.desconto_pct) || 0,
      }))
      .filter((i) => i.descricao !== "" && i.quantidade > 0 && i.preco_cents > 0);
    const extrasMontados = montarExtras(extras);
    const extrasCandidatos: ExtrasFiscais = {
      // Tudo que o operador preencheu em "Dados adicionais" — complementares,
      // fisco, cobrança, transporte, destinatário e entrega — entra na nota.
      // Antes só `avulsa` ia, e o resto era descartado sem aviso.
      ...(extrasMontados ?? {}),
      avulsa: {
        // O vínculo com o cadastro que puxou o nome: é ele que faz a NF-e
        // completar destinatário (nome + CPF/CNPJ) e endereço a partir do
        // cadastro — não redigitar nada na venda do balcão.
        contato_id: avulsa.contato_id.trim() || null,
        cliente_nome: avulsa.cliente_nome.trim(),
        cliente_documento: avulsa.cliente_documento.replace(/\D/g, "") || undefined,
        frete_cents: Math.max(0, Math.trunc(Number(avulsa.frete_cents)) || 0),
        itens: itensPayload,
      },
    };
    const checagem = extrasFiscaisSchema.safeParse(extrasCandidatos);
    if (!checagem.success) {
      toast.error(checagem.error.issues[0]?.message ?? t("Dados adicionais inválidos."));
      return;
    }
    if (emitindoRef.current) return;
    emitindoRef.current = true;
    setEmitindo(true);
    setPendencias(null);
    setErroEmissao(null);
    try {
      // A avulsa passa pela MESMA pré-validação do pedido, com o payload cheio:
      // a rota devolve pendências nomeadas antes de a SEFAZ consumir número.
      const prev = await apiClient.post<{
        data: { ok: boolean; pendencias: { campo: string; mensagem: string; onde: string }[] };
      }>("/api/v1/invoices/validar", { extras: checagem.data });
      if (!prev.data.ok) {
        setPendencias(prev.data.pendencias);
        return;
      }
      // Chave estável da emissão: nasce no formulário pronto e é reusada em
      // retry/reenvio até a nota sair; o client não gera outra por chamada.
      const chaveIdempotencia = chaveIdempotenciaRef.current ?? crypto.randomUUID();
      chaveIdempotenciaRef.current = chaveIdempotencia;
      await apiClient.post(
        "/api/v1/invoices",
        { extras: checagem.data },
        { idempotencyKey: chaveIdempotencia },
      );
      chaveIdempotenciaRef.current = null;
      toast.success(t("Venda avulsa enfileirada para emissão"));
      setAvulsa({
        cliente_nome: "",
        cliente_documento: "",
        frete_cents: "0",
        itens: [],
        contato_id: "",
      });
      router.push("/app/notas?aba=notas");
      router.refresh();
    } catch (e) {
      setErroEmissao(
        e instanceof ApiError ? e.message : t("Não foi possível emitir a nota. Tente de novo."),
      );
      showApiError(e);
    } finally {
      emitindoRef.current = false;
      setEmitindo(false);
    }
  }

  async function emitir() {
    if (modo === "avulsa") {
      await emitirAvulsa();
      return;
    }
    if (!pedidoId) {
      toast.error(t("Escolha o pedido aprovado, concluído, faturado ou expedido."));
      return;
    }
    // Os extras são conferidos aqui e não na rota: quem aciona o botão precisa
    // ver "Informe o primeiro vencimento" na tela que está aberta, e não um
    // 422 genérico de volta de uma requisição que ele nem vê o corpo.
    const candidato = montarExtras(extras);
    let extrasValidados: ExtrasFiscais | null = null;
    if (candidato) {
      const checagem = extrasFiscaisSchema.safeParse(candidato);
      if (!checagem.success) {
        toast.error(checagem.error.issues[0]?.message ?? t("Dados adicionais inválidos."));
        return;
      }
      extrasValidados = checagem.data;
    }
    // Emitir é irreversível e consome número da SEFAZ. A confirmação mostra o
    // destinatário e o total — o que a tela já resolveu, não um "tem certeza?".
    const ok = await confirmar({
      title: `${t("Emitir a NF-e de")} ${nomeEfetivo || t("cliente")} (${documentoEfetivo || t("sem documento")}) — ${comoMoeda(escolhido?.total_cents ?? 0, escolhido?.moeda ?? "BRL")}?`,
      confirmLabel: t("Emitir NF-e"),
      cancelLabel: t("Revisar"),
    });
    if (!ok) return;
    setEmitindo(true);
    setPendencias(null);
    try {
      // Pré-validação: a SEFAZ nunca é a primeira a dizer que falta NCM.
      // O envelope `ok()` chega como `{data}` — ler `prev.ok` em cima dele era
      // `undefined`, caía no ramo de pendências com `pendencias === undefined`
      // e o render derrubava o boundary (`undefined.length`).
      // A pré-validação roda para CADA pedido agrupado: um item sem NCM no
      // segundo pedido derrubaria a nota inteira depois de a SEFAZ já ter
      // consumido número. O gate é aqui, onde ainda dá para corrigir.
      for (const id of selecionados) {
        const prev = await apiClient.post<{
          data: { ok: boolean; pendencias: { campo: string; mensagem: string; onde: string }[] };
        }>("/api/v1/invoices/validar", { order_id: id });
        if (!prev.data.ok) {
          const ped = faturados.find((p) => p.id === id);
          setPendencias(
            ped && selecionados.length > 1
              ? prev.data.pendencias.map((x) => ({
                  ...x,
                  onde: `${numeroDoPedido(ped.numero)} · ${x.onde}`,
                }))
              : prev.data.pendencias,
          );
          return;
        }
      }
      await apiClient.post("/api/v1/invoices", {
        // `order_id` continua indo (compatibilidade); `order_ids` é o que
        // agrupa. Com um pedido só os dois são iguais.
        order_id: selecionados[0],
        ...(selecionados.length > 1 ? { order_ids: selecionados } : {}),
        ...(extrasValidados ? { extras: extrasValidados } : {}),
      });
      toast.success(
        selecionados.length > 1
          ? t("Nota agrupada enfileirada para emissão")
          : t("Nota enfileirada para emissão"),
      );
      setPedidoId("");
      setAgrupados([]);
      router.push("/app/notas?aba=notas");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setEmitindo(false);
    }
  }

  const itensSemNcm = avulsa.itens.filter((i) => i.descricao.trim() !== "" && !i.ncm.trim());
  const podeEmitirAvulsa =
    modo === "avulsa" && avulsa.itens.length > 0 && itensSemNcm.length === 0 && Boolean(configInicial);

  /**
   * A CHAVE NASCE AQUI, não no clique nem no render: quando o formulário fica
   * pronto. O efeito só cria se ainda não existe; retry e reenvio da mesma tela
   * reusam a mesma chave, e o sucesso a zera para a próxima emissão.
   */
  React.useEffect(() => {
    if (!podeEmitirAvulsa) return;
    if (!chaveIdempotenciaRef.current) chaveIdempotenciaRef.current = crypto.randomUUID();
  }, [podeEmitirAvulsa]);

  return (
    <Card className="hover-raise space-y-4 p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-muted-foreground" />
          <h2 className="text-base font-medium text-text">{textos.emitir}</h2>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{textos.subtituloEmitir}</p>
      </div>

      {!configInicial && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
          {textos.semConfig}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant={modo === "pedido" ? "default" : "outline"}
          size="sm"
          onClick={() => setModo("pedido")}
        >
          {t("NF-e de pedido")}
        </Button>
        <Button
          variant={modo === "avulsa" ? "default" : "outline"}
          size="sm"
          onClick={() => setModo("avulsa")}
        >
          {t("NF-e de venda avulsa")}
        </Button>
      </div>

      {modo === "pedido" ? (
        faturados.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {textos.semFaturados}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xl space-y-1.5">
              <Label htmlFor="pedido-nota">{textos.escolherPedido}</Label>
              <select
                id="pedido-nota"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={pedidoId}
                onChange={(e) => escolherPedido(e.target.value)}
              >
                <option value="">{textos.selecione}</option>
                {faturados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {numeroDoPedido(p.numero)} · {p.cliente_nome} ·{" "}
                    {comoMoeda(p.total_cents, p.moeda)}
                  </option>
                ))}
              </select>
            </div>

            {doMesmoCliente.length > 0 && (
              <div className="max-w-xl space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-sm font-medium text-text">
                  {t("Juntar outros pedidos deste cliente")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("Os pedidos marcados saem numa nota só, com todos os itens.")}
                </p>
                <ul className="mt-1 space-y-1">
                  {doMesmoCliente.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-md border-border"
                          checked={agrupados.includes(p.id)}
                          onChange={(e) =>
                            setAgrupados((atual) =>
                              e.target.checked
                                ? [...atual, p.id]
                                : atual.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span className="tabular-nums">{numeroDoPedido(p.numero)}</span>
                        <span className="text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString(tagIdioma)}
                        </span>
                        <span className="ml-auto tabular-nums">
                          {comoMoeda(p.total_cents, p.moeda)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {agrupados.length > 0 && (
                  <p className="pt-1 text-sm font-medium text-text">
                    {t("Nota com")} {selecionados.length} {t("pedidos")} ·{" "}
                    <span className="tabular-nums">
                      {comoMoeda(totalDaNota, escolhido?.moeda ?? "BRL")}
                    </span>
                  </p>
                )}
              </div>
            )}

            {escolhido && (
              <div className="grid max-w-xl grid-cols-3 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{textos.escolherPedido}</p>
                  <p className="font-medium tabular-nums">{numeroDoPedido(escolhido.numero)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{textos.cliente}</p>
                  <p
                    className="truncate font-medium"
                    title={escolhido.destinatario?.nome || escolhido.cliente_nome}
                  >
                    {escolhido.destinatario?.nome || escolhido.cliente_nome}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{textos.valor}</p>
                  <p className="font-medium tabular-nums">
                    {comoMoeda(escolhido.total_cents, escolhido.moeda)}
                  </p>
                </div>
              </div>
            )}

            {escolhido && (
              <details className="max-w-xl rounded-lg border border-border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium text-text">
                  {t("Conferir a nota campo por campo")}
                </summary>
                <div className="mt-3 space-y-4 text-sm">
                  <section>
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("Destinatário")}
                    </h3>
                    <dl className="mt-1 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1">
                      <dt className="text-muted-foreground">{t("Nome")}</dt>
                      <dd>{nomeEfetivo || t("falta")}</dd>
                      <dt className="text-muted-foreground">{t("CPF/CNPJ")}</dt>
                      <dd className="tabular-nums">{documentoEfetivo || t("falta")}</dd>
                      <dt className="text-muted-foreground">{t("IE")}</dt>
                      <dd>{ieEfetiva || t("não contribuinte")}</dd>
                      <dt className="text-muted-foreground">{t("Endereço")}</dt>
                      <dd>{enderecoEfetivo || t("falta")}</dd>
                    </dl>
                  </section>
                  <section>
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("Itens")}
                    </h3>
                    {itensDaNota === null ? (
                      <p className="mt-1 text-muted-foreground">{t("Carregando…")}</p>
                    ) : itensDaNota.length === 0 ? (
                      <p className="mt-1 text-muted-foreground">{t("Sem itens.")}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {itensDaNota.map((i) => (
                          <li
                            key={i.id}
                            className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-1 last:border-0"
                          >
                            <span>
                              {i.produto_codigo} · {i.produto_nome}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {i.quantidade} × {comoMoeda(i.preco_unit_cents, escolhido.moeda)} ={" "}
                              {comoMoeda(i.subtotal_cents, escolhido.moeda)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("Totais")}
                    </h3>
                    <dl className="mt-1 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 tabular-nums">
                      <dt className="text-muted-foreground">{t("Subtotal")}</dt>
                      <dd>{comoMoeda(escolhido.subtotal_cents, escolhido.moeda)}</dd>
                      <dt className="text-muted-foreground">{t("Desconto")}</dt>
                      <dd>{comoMoeda(escolhido.desconto_cents, escolhido.moeda)}</dd>
                      <dt className="text-muted-foreground">{t("Frete")}</dt>
                      <dd>{comoMoeda(escolhido.frete_cents, escolhido.moeda)}</dd>
                      <dt className="font-medium">{t("Total")}</dt>
                      <dd className="font-medium">{comoMoeda(escolhido.total_cents, escolhido.moeda)}</dd>
                    </dl>
                  </section>
                </div>
              </details>
            )}

            <details className="max-w-xl rounded-lg border border-border bg-muted/30 p-3">
              <summary className="cursor-pointer text-sm font-medium text-text">
                {t("Dados adicionais da emissão (opcional)")}
              </summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-muted-foreground">
                  {t("Ficam gravados nesta nota: reemitir não pede de novo.")}
                </p>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("Destinatário")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "É o que sai na nota. O cadastro preenche; o que você digitar aqui vence para esta emissão.",
                    )}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="dest-nome">{t("Nome / razão social")}</Label>
                      <Input
                        id="dest-nome"
                        maxLength={60}
                        value={extras.destinatarioNome}
                        onChange={alterar("destinatarioNome")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dest-doc">{t("CPF ou CNPJ")}</Label>
                      <Input
                        id="dest-doc"
                        inputMode="numeric"
                        maxLength={14}
                        value={extras.destinatarioDocumento}
                        onChange={alterar("destinatarioDocumento")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dest-ie">{t("Inscrição estadual")}</Label>
                      <Input
                        id="dest-ie"
                        maxLength={20}
                        placeholder={t("ISENTO ou vazio")}
                        value={extras.destinatarioIe}
                        onChange={alterar("destinatarioIe")}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("Transporte")}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label htmlFor="ex-modalidade">{t("Modalidade do frete")}</Label>
                      <select
                        id="ex-modalidade"
                        aria-label={t("Modalidade do frete")}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        value={extras.modalidade}
                        onChange={alterar("modalidade")}
                      >
                        {MODALIDADES_DE_FRETE.map((m) => (
                          <option key={m} value={m}>
                            {ROTULO_DA_MODALIDADE_DE_FRETE[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label htmlFor="ex-transp-nome">
                        {t("Transportador — nome ou razão social")}
                      </Label>
                      <Input
                        id="ex-transp-nome"
                        value={extras.transportadorNome}
                        onChange={alterar("transportadorNome")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-transp-doc">{t("CPF ou CNPJ")}</Label>
                      <Input
                        id="ex-transp-doc"
                        inputMode="numeric"
                        maxLength={14}
                        value={extras.transportadorDocumento}
                        onChange={alterar("transportadorDocumento")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-vol-qtd">{t("Volumes")}</Label>
                      <Input
                        id="ex-vol-qtd"
                        type="number"
                        min={1}
                        placeholder={t("Qtd.")}
                        value={extras.volumesQuantidade}
                        onChange={alterar("volumesQuantidade")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-vol-especie">{t("Espécie")}</Label>
                      <Input
                        id="ex-vol-especie"
                        maxLength={60}
                        placeholder={t("Ex.: CAIXAS")}
                        value={extras.volumesEspecie}
                        onChange={alterar("volumesEspecie")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-vol-peso-l">{t("Peso líquido (kg)")}</Label>
                      <Input
                        id="ex-vol-peso-l"
                        type="number"
                        min={0}
                        step="0.01"
                        value={extras.pesoLiquido}
                        onChange={alterar("pesoLiquido")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-vol-peso-b">{t("Peso bruto (kg)")}</Label>
                      <Input
                        id="ex-vol-peso-b"
                        type="number"
                        min={0}
                        step="0.01"
                        value={extras.pesoBruto}
                        onChange={alterar("pesoBruto")}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("Cobrança")}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-forma">{t("Forma de pagamento")}</Label>
                      <select
                        id="ex-forma"
                        aria-label={t("Forma de pagamento")}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        value={extras.formaPagamento}
                        onChange={alterar("formaPagamento")}
                      >
                        <option value="">{t("Não informar")}</option>
                        {FORMAS_DE_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>
                            {ROTULO_DA_FORMA_DE_PAGAMENTO[f]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {extras.formaPagamento !== "" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="ex-parcelas">{t("Parcelas")}</Label>
                          <Input
                            id="ex-parcelas"
                            type="number"
                            min={1}
                            max={120}
                            value={extras.parcelas}
                            onChange={alterar("parcelas")}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ex-dias">{t("Dias entre vencimentos")}</Label>
                          <Input
                            id="ex-dias"
                            type="number"
                            min={0}
                            max={365}
                            value={extras.diasEntre}
                            onChange={alterar("diasEntre")}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ex-vencimento">{t("Primeiro vencimento")}</Label>
                          <Input
                            id="ex-vencimento"
                            type="date"
                            value={extras.primeiroVencimento}
                            onChange={alterar("primeiroVencimento")}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-3">
                          <Label htmlFor="ex-descricao">
                            {t("Descrição da forma de pagamento (obrigatória em Outros)")}
                          </Label>
                          <Input
                            id="ex-descricao"
                            maxLength={60}
                            value={extras.descricaoPagamento}
                            onChange={alterar("descricaoPagamento")}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("Adicionais")}
                  </h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-inf-cpl">{t("Informações complementares")}</Label>
                    <Textarea
                      id="ex-inf-cpl"
                      rows={3}
                      maxLength={5000}
                      value={extras.informacoesComplementares}
                      onChange={alterar("informacoesComplementares")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Vem das Informações adicionais do pedido. O que você editar aqui vence — é este texto que sai no campo de informações complementares da nota.",
                      )}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-inf-fisco">{t("Informações de interesse do Fisco")}</Label>
                    <Textarea
                      id="ex-inf-fisco"
                      rows={2}
                      maxLength={2000}
                      value={extras.informacoesFisco}
                      onChange={alterar("informacoesFisco")}
                    />
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("Endereço do destinatário")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "A SEFAZ exige este endereço na NF-e; ele também é usado como local de entrega.",
                    )}
                  </p>
                  {escolhido?.destinatario &&
                    (camposDoPedido.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info/40 bg-info-bg p-2 text-xs text-info-fg">
                        <p className="min-w-0 flex-1 font-medium">
                          {t("veio do pedido — confira")} ·{" "}
                          {camposDoPedido.join(", ")}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => void salvarEnderecoNoCadastro()}
                        >
                          {t("Salvar no cadastro do cliente")}
                        </Button>
                      </div>
                    ) : escolhido.destinatario.entrega ? (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Preenchido com o cadastro do cliente. Pode corrigir aqui — vale o que estiver nesta tela.",
                        )}
                      </p>
                    ) : (
                      <p className="rounded-lg border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
                        {t("Falta no cadastro do cliente:")}{" "}
                        {escolhido.destinatario.faltando.join(", ") || t("endereço completo")}.{" "}
                        {t("Dá para completar aqui ou no cadastro do cliente.")}
                      </p>
                    ))}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="ex-ent-logradouro">{t("Logradouro")}</Label>
                      <Input
                        id="ex-ent-logradouro"
                        maxLength={60}
                        value={extras.entregaLogradouro}
                        onChange={alterar("entregaLogradouro")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-numero">{t("Número")}</Label>
                      <Input
                        id="ex-ent-numero"
                        maxLength={60}
                        value={extras.entregaNumero}
                        onChange={alterar("entregaNumero")}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="ex-ent-complemento">{t("Complemento")}</Label>
                      <Input
                        id="ex-ent-complemento"
                        maxLength={60}
                        value={extras.entregaComplemento}
                        onChange={alterar("entregaComplemento")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-bairro">{t("Bairro")}</Label>
                      <Input
                        id="ex-ent-bairro"
                        maxLength={60}
                        value={extras.entregaBairro}
                        onChange={alterar("entregaBairro")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-municipio">{t("Município")}</Label>
                      <Input
                        id="ex-ent-municipio"
                        maxLength={60}
                        value={extras.entregaMunicipio}
                        onChange={alterar("entregaMunicipio")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-cod-mun">{t("Código IBGE")}</Label>
                      <Input
                        id="ex-ent-cod-mun"
                        inputMode="numeric"
                        maxLength={7}
                        placeholder="0000000"
                        value={extras.entregaCodigoMunicipio}
                        onChange={alterar("entregaCodigoMunicipio")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-uf">{t("UF")}</Label>
                      <Input
                        id="ex-ent-uf"
                        maxLength={2}
                        placeholder="SP"
                        value={extras.entregaUf}
                        onChange={alterar("entregaUf")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-ent-cep">{t("CEP")}</Label>
                      <Input
                        id="ex-ent-cep"
                        inputMode="numeric"
                        maxLength={9}
                        placeholder="00000-000"
                        value={extras.entregaCep}
                        onChange={alterar("entregaCep")}
                      />
                    </div>
                  </div>
                </section>
              </div>
            </details>

            <div>
              <Button
                onClick={() => void emitir()}
                disabled={emitindo || !configInicial || !pedidoId}
              >
                {emitindo ? t("Enviando…") : textos.emitir}
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="max-w-xl space-y-4">
          <p className="text-xs text-muted-foreground">
            {t(
              "Venda sem pedido (balcão): a nota nasce da venda informada, sem precisar gerar pedido.",
            )}
          </p>
          <div data-testid="nfe-cliente">
            <CustomerSelector
              contatos={[]}
              contatoId={avulsa.contato_id || null}
              clienteNome={avulsa.cliente_nome}
              aoEscolher={aoEscolherClienteAvulso}
              mostrarResumo={false}
              textos={{
                cliente: textos.cliente,
                buscarCliente: textos.buscarCliente,
                clienteAvulso: textos.clienteAvulso,
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="av-doc">{t("CPF ou CNPJ")}</Label>
              <Input
                id="av-doc"
                inputMode="numeric"
                maxLength={14}
                value={avulsa.cliente_documento}
                onChange={(e) => {
                  const valor = e.target.value;
                  setAvulsa((a) => ({ ...a, cliente_documento: valor }));
                  // O campo visível é a verdade: corrigir o CPF aqui corrige
                  // também o destinatário que vai no extras da nota.
                  setExtras((x) => ({ ...x, destinatarioDocumento: valor }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av-frete">{t("Frete (centavos)")}</Label>
              <Input
                id="av-frete"
                type="number"
                min={0}
                value={avulsa.frete_cents}
                onChange={(e) => setAvulsa({ ...avulsa, frete_cents: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2" data-testid="nfe-itens">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("Itens da venda")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("Só produto do catálogo — o NCM vem do cadastro.")}
              </p>
            </div>

            <div
              data-testid="nfe-busca-produto"
              className="rounded-lg border border-border bg-surface p-2"
            >
              <ProductSearch
                produtos={produtos}
                tabela={null as PrecoDeTabela | null}
                ultimosPrecos={precosVazios}
                inputRef={buscaProdutoRef}
                aoAdicionar={adicionarProdutoDoCatalogo}
                textos={{
                  produtos: t("Produtos"),
                  buscarProduto: t("Buscar produto por nome ou código…"),
                }}
              />
              {carregandoProdutos && (
                <p className="mt-1 text-xs text-muted-foreground">{t("Carregando catálogo…")}</p>
              )}
            </div>

            {avulsa.itens.length === 0 ? (
              <p
                data-testid="nfe-itens-vazio"
                className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
              >
                {t("Nenhum item. Busque um produto do catálogo acima para começar.")}
              </p>
            ) : (
              avulsa.itens.map((item, idx) => (
                <div
                  key={item.product_id ?? idx}
                  data-testid="nfe-item"
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-6"
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("Produto")}</Label>
                    <p className="truncate text-sm text-text">{item.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.codigo || t("sem código")} · {t("NCM")}{" "}
                      <span data-testid="nfe-item-ncm">{item.ncm || t("sem NCM")}</span>
                    </p>
                    {!item.ncm && (
                      <p data-testid="nfe-item-sem-ncm" className="text-xs text-error-fg">
                        {t("Sem NCM no cadastro — esta nota não emite. Corrija o produto antes.")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("Qtd.")}</Label>
                    <Input
                      aria-label={t("Qtd.")}
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) =>
                        setAvulsa({
                          ...avulsa,
                          itens: avulsa.itens.map((x, j) =>
                            j === idx ? { ...x, quantidade: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("Preço (centavos)")}</Label>
                    <Input
                      aria-label={t("Preço (centavos)")}
                      type="number"
                      min={0}
                      value={item.preco_cents}
                      onChange={(e) =>
                        setAvulsa({
                          ...avulsa,
                          itens: avulsa.itens.map((x, j) =>
                            j === idx ? { ...x, preco_cents: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("Desconto (%)")}</Label>
                    <Input
                      aria-label={t("Desconto (%)")}
                      type="number"
                      min={0}
                      max={100}
                      value={item.desconto_pct}
                      onChange={(e) =>
                        setAvulsa({
                          ...avulsa,
                          itens: avulsa.itens.map((x, j) =>
                            j === idx ? { ...x, desconto_pct: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAvulsa({ ...avulsa, itens: avulsa.itens.filter((_, j) => j !== idx) })
                      }
                    >
                      {t("Remover")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {erroEmissao && (
            <p
              role="alert"
              data-testid="nfe-erro"
              className="rounded-lg border border-error/30 bg-error-bg/50 px-3 py-2 text-sm text-error-fg"
            >
              {erroEmissao}
            </p>
          )}
          {itensSemNcm.length > 0 && (
            <p className="text-xs text-error-fg">
              {t("Há item sem NCM no cadastro — a nota não emite até corrigir o produto.")}
            </p>
          )}
          {podeEmitirAvulsa && (
            <span data-testid="nfe-formulario-pronto" className="sr-only">
              {t("Formulário pronto para emitir")}
            </span>
          )}
          <Button
            data-testid="nfe-emitir"
            aria-busy={emitindo}
            onClick={() => void emitir()}
            disabled={
              emitindo ||
              !configInicial ||
              avulsa.itens.length === 0 ||
              itensSemNcm.length > 0
            }
          >
            {emitindo ? t("Enviando…") : textos.emitir}
          </Button>
        </div>
      )}

      {pendencias !== null && pendencias.length > 0 && (
        <div
          data-testid="nfe-pendencias"
          className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm"
          role="alert"
        >
          <p className="font-medium">
            {pendencias.length} {textos.pendencias}
          </p>
          <ul className="mt-1 space-y-1">
            {pendencias.map((p, i) => (
              <li key={i}>
                <Link href={p.onde} className="underline underline-offset-4">
                  {p.mensagem}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
