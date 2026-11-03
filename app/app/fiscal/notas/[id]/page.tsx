import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { comoMoeda } from "@/lib/format/moeda";
import { contextoFiscal } from "@/lib/fiscal/pagina";
import { tagDeIdioma } from "@/lib/i18n/datas";
import {
  COLUNAS_DA_ENTRADA,
  ROTULO_DA_CONFERENCIA,
  ROTULO_DA_ENTRADA,
  ROTULO_DA_SITUACAO,
  identificacaoDaEntrada,
  type EntradaFiscal,
  type StatusDaConferencia,
  type StatusDaEntrada,
} from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

import { AcoesDaEntrada } from "../../_components/AcoesDaEntrada";
import { AssociarProduto } from "../../_components/AssociarProduto";

export const dynamic = "force-dynamic";

const VARIANTE_STATUS: Record<
  StatusDaEntrada,
  NonNullable<React.ComponentProps<typeof Badge>["variant"]>
> = {
  nova: "info",
  manifestada: "neutral",
  importada: "success",
  ignorada: "warning",
};

const VARIANTE_CONFERENCIA: Record<
  StatusDaConferencia,
  NonNullable<React.ComponentProps<typeof Badge>["variant"]>
> = {
  pendente: "warning",
  em_conferencia: "info",
  aprovada: "success",
  rejeitada: "error",
};

const ROTULO_PAGAVEL: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  pago: "Pago",
  cancelado: "Cancelado",
};

interface ItemDaLinha {
  id: string;
  numero_item: number;
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario_cents: number;
  valor_total_cents: number;
  icms_cents: number;
  ipi_cents: number;
  pis_cents: number;
  cofins_cents: number;
  cst: string | null;
  produto_id: string | null;
}

interface EventoDaLinha {
  id: string;
  tipo: string;
  tp_evento: string;
  descricao: string | null;
  protocolo: string | null;
  dh_evento: string | null;
  sequencia: number | null;
  created_at: string;
}

interface ManifestacaoDaLinha {
  id: string;
  evento: string;
  justificativa: string | null;
  protocolo: string | null;
  cstat: string | null;
  resultado: string;
  mensagem: string | null;
  created_at: string;
}

interface PagavelDaLinha {
  id: string;
  parcela_n: number;
  total_parcelas: number;
  valor_original_cents: number;
  vencimento: string;
  status: string;
}

/**
 * O DETALHE DA NOTA — onde a decisão tem contexto.
 *
 * Itens, totais, eventos, manifestações e contas a pagar na mesma tela, porque
 * aprovar sem ver o que chegou é carimbo. A importação fica ao lado do total
 * que ela vai lançar — e desabilitada enquanto a conferência não estiver
 * aprovada.
 */
export default async function NotaDeEntradaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, podeGerir, podeOperar, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();

  const { data: entradaRaw } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!entradaRaw) notFound();
  const entrada = entradaRaw as unknown as EntradaFiscal;

  const [itensQ, eventosQ, manifestacoesQ, pagaveisQ, fornecedorQ] = await Promise.all([
    supabase
      .from("fiscal_document_items")
      .select(
        "id, numero_item, codigo, ean, descricao, ncm, cfop, unidade, quantidade, " +
          "valor_unitario_cents, valor_total_cents, icms_cents, ipi_cents, pis_cents, " +
          "cofins_cents, cst, produto_id",
      )
      .eq("organization_id", org.orgId)
      .eq("entrada_id", id)
      .order("numero_item", { ascending: true }),
    supabase
      .from("fiscal_document_events")
      .select("id, tipo, tp_evento, descricao, protocolo, dh_evento, sequencia, created_at")
      .eq("organization_id", org.orgId)
      .eq("chave", entrada.chave)
      .order("dh_evento", { ascending: false, nullsFirst: false }),
    supabase
      .from("fiscal_manifestations")
      .select("id, evento, justificativa, protocolo, cstat, resultado, mensagem, created_at")
      .eq("organization_id", org.orgId)
      .eq("entrada_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_pagaveis")
      .select("id, parcela_n, total_parcelas, valor_original_cents, vencimento, status")
      .eq("organization_id", org.orgId)
      .eq("entrada_id", id)
      .order("parcela_n", { ascending: true }),
    entrada.supplier_id
      ? supabase
          .from("suppliers")
          .select("id, nome, cnpj, ie, email, telefone, total_notas, total_comprado_cents")
          .eq("organization_id", org.orgId)
          .eq("id", entrada.supplier_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const itens = (itensQ.data ?? []) as unknown as ItemDaLinha[];
  const eventos = (eventosQ.data ?? []) as unknown as EventoDaLinha[];
  const manifestacoes = (manifestacoesQ.data ?? []) as unknown as ManifestacaoDaLinha[];
  const pagaveis = (pagaveisQ.data ?? []) as unknown as PagavelDaLinha[];
  const fornecedor = fornecedorQ.data as unknown as {
    id: string;
    nome: string;
    cnpj: string;
    ie: string | null;
    email: string | null;
    telefone: string | null;
    total_notas: number;
    total_comprado_cents: number;
  } | null;

  // Nomes dos produtos já associados — uma consulta só, e só quando há item
  // associado. É o que a tabela mostra no lugar de um UUID.
  const idsAssociados = [
    ...new Set(itens.map((i) => i.produto_id).filter((id): id is string => id !== null)),
  ];
  const { data: associadosRaw } =
    idsAssociados.length > 0
      ? await supabase
          .from("catalog_products")
          .select("id, nome")
          .eq("organization_id", org.orgId)
          .in("id", idsAssociados)
      : { data: [] as { id: string; nome: string }[] };
  const nomesPorProduto = new Map(
    ((associadosRaw ?? []) as unknown as { id: string; nome: string }[]).map((p) => [p.id, p.nome]),
  );
  // Depois de importada, o estoque já andou: trocar a associação não move mais
  // nada e só criaria a impressão de que move.
  const associacaoBloqueada = entrada.status === "importada" || entrada.status === "ignorada";

  const temXml = !!entrada.xml && Array.isArray(entrada.itens_json) && entrada.itens_json.length > 0;
  const t = entrada.totais_json ?? {};
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(tagIdioma) : "—";
  const dataHora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(tagIdioma) : "—";

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title={`Nota ${identificacaoDaEntrada(entrada.numero, entrada.serie)}`}
        subtitle={entrada.emitente_nome}
        actions={
          <Link
            href="/app/fiscal/notas"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            ← Todas as notas
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANTE_STATUS[entrada.status]}>{ROTULO_DA_ENTRADA[entrada.status]}</Badge>
        <Badge variant={VARIANTE_CONFERENCIA[entrada.conferencia_status]}>
          {ROTULO_DA_CONFERENCIA[entrada.conferencia_status]}
        </Badge>
        <Badge variant="outline">{ROTULO_DA_SITUACAO[entrada.situacao_fiscal]}</Badge>
        {entrada.tipo_documento === "resumo" && (
          <Badge variant="neutral">Resumo — sem XML completo</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Dados da nota</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Chave de acesso</dt>
                <dd className="break-all font-mono text-xs">{entrada.chave}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Protocolo</dt>
                <dd>{entrada.protocolo ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Emissão</dt>
                <dd>{data(entrada.dh_emi)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entrada</dt>
                <dd>{data(entrada.dh_entrada)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Natureza da operação</dt>
                <dd>{entrada.natureza_operacao ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">NSU</dt>
                <dd className="tabular-nums">{entrada.nsu}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fornecedor</dt>
                <dd>
                  {fornecedor ? (
                    <Link
                      href="/app/fiscal/fornecedores"
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      {fornecedor.nome}
                    </Link>
                  ) : (
                    entrada.emitente_nome
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CNPJ</dt>
                <dd>{entrada.emitente_cnpj}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Manifestação</dt>
                <dd>
                  {entrada.manifestacao ?? "—"}
                  {entrada.manifestada_em ? ` · ${dataHora(entrada.manifestada_em)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Importação</dt>
                <dd>
                  {entrada.estoque_processado_em ? "Estoque ok" : "Estoque pendente"} ·{" "}
                  {entrada.financeiro_processado_em ? "Financeiro ok" : "Financeiro pendente"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Itens ({itens.length})</h2>
              {entrada.xml && (
                <a
                  href={`/api/v1/fiscal-entradas/${entrada.id}/xml`}
                  className="text-sm text-accent underline-offset-4 hover:underline"
                >
                  Baixar XML
                </a>
              )}
            </div>
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {temXml
                  ? "Itens ainda não normalizados — sincronize de novo para gravá-los."
                  : "Sem XML completo: manifeste a nota e sincronize para liberar os itens."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>#</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>NCM/CFOP</TableHead>
                      <TableHead>Catálogo</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Impostos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="tabular-nums">{item.numero_item}</TableCell>
                        <TableCell>
                          <span className="block max-w-72 truncate" title={item.descricao}>
                            {item.descricao}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.codigo}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.ncm ?? "—"} / {item.cfop ?? "—"}
                        </TableCell>
                        <TableCell>
                          <AssociarProduto
                            entradaId={entrada.id}
                            itemId={item.id}
                            produtoId={item.produto_id}
                            produtoNome={
                              item.produto_id ? (nomesPorProduto.get(item.produto_id) ?? null) : null
                            }
                            podeGerir={podeGerir}
                            bloqueado={associacaoBloqueada}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.quantidade} {item.unidade ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {comoMoeda(item.valor_unitario_cents, "BRL")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {comoMoeda(item.valor_total_cents, "BRL")}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {comoMoeda(
                            item.icms_cents + item.ipi_cents + item.pis_cents + item.cofins_cents,
                            "BRL",
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Eventos da nota</h2>
            {eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cancelamento ou carta de correção recebido para esta chave.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {eventos.map((ev) => (
                  <li key={ev.id} className="border-l-2 border-border pl-3">
                    <p className="font-medium">
                      {ev.tipo === "cancelamento"
                        ? "Cancelamento"
                        : ev.tipo === "carta_correcao"
                          ? "Carta de correção"
                          : ev.tipo === "manifestacao"
                            ? "Manifestação"
                            : "Evento"}{" "}
                      <span className="text-xs text-muted-foreground">({ev.tp_evento})</span>
                    </p>
                    {ev.descricao && <p className="text-muted-foreground">{ev.descricao}</p>}
                    <p className="text-xs text-muted-foreground">
                      {dataHora(ev.dh_evento ?? ev.created_at)}
                      {ev.protocolo ? ` · protocolo ${ev.protocolo}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Totais</h2>
            <dl className="space-y-2 text-sm">
              {[
                ["Produtos", t.produtos_cents],
                ["Frete", t.frete_cents],
                ["Seguro", t.seguro_cents],
                ["Desconto", t.desconto_cents],
                ["Outras despesas", t.outras_despesas_cents],
                ["ICMS", t.icms_cents],
                ["IPI", t.ipi_cents],
                ["PIS", t.pis_cents],
                ["COFINS", t.cofins_cents],
              ].map(([rotulo, valor]) => (
                <div key={rotulo as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd className="tabular-nums">{comoMoeda(Number(valor ?? 0), "BRL")}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-border pt-2 font-medium">
                <dt>Total da nota</dt>
                <dd className="tabular-nums">{comoMoeda(entrada.valor_total_cents, "BRL")}</dd>
              </div>
            </dl>
          </div>

          <AcoesDaEntrada
            id={entrada.id}
            status={entrada.status}
            conferencia={entrada.conferencia_status}
            temXml={temXml}
            podeGerir={podeGerir}
            podeOperar={podeOperar}
          />

          {pagaveis.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-medium">Contas a pagar</h2>
              <ul className="space-y-2 text-sm">
                {pagaveis.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      {p.parcela_n}/{p.total_parcelas} · {data(p.vencimento)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {comoMoeda(p.valor_original_cents, "BRL")}
                      </span>
                      <Badge
                        variant={p.status === "pago" ? "success" : "neutral"}
                        className="text-[10px]"
                      >
                        {ROTULO_PAGAVEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Manifestações</h2>
            {manifestacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma manifestação enviada.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {manifestacoes.map((m) => (
                  <li key={m.id}>
                    <p className="flex items-center gap-2 font-medium">
                      {m.evento}
                      <Badge
                        variant={m.resultado === "sucesso" ? "success" : "error"}
                        className="text-[10px]"
                      >
                        {m.resultado}
                      </Badge>
                    </p>
                    {m.mensagem && <p className="text-muted-foreground">{m.mensagem}</p>}
                    <p className="text-xs text-muted-foreground">
                      {dataHora(m.created_at)}
                      {m.cstat ? ` · cStat ${m.cstat}` : ""}
                      {m.protocolo ? ` · protocolo ${m.protocolo}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
