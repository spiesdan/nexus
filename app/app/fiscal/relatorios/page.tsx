import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { NexusKpi, NexusKpiGrid } from "@/components/nexus-ui/kpi/nexus-kpi";
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
  porFornecedor,
  porMes,
  produtosMaisComprados,
  resumoDoPeriodo,
  type LinhaDeEntrada,
  type LinhaDeItem,
} from "@/lib/fiscal/relatorios";
import { COLUNAS_DA_ENTRADA, identificacaoDaEntrada } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS = [
  { id: "resumo", rotulo: "Resumo do período" },
  { id: "fornecedores", rotulo: "Por fornecedor" },
  { id: "mes", rotulo: "Por mês" },
  { id: "produtos", rotulo: "Produtos mais comprados" },
  { id: "canceladas", rotulo: "Canceladas" },
  { id: "pendentes", rotulo: "Pendentes de conferência" },
] as const;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function inicioDoMes(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * RELATÓRIOS — os números do recebimento, com período.
 *
 * Toda soma vem de `lib/fiscal/relatorios.ts` — a mesma função que os testes de
 * massa fixa exercitam. A tela não soma nada por conta própria, para o número
 * exibido e a prova não poderem divergir. Cancelada conta na quantidade e
 * nunca no valor: quem comprou não comprou o que foi cancelado.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const tipo = TIPOS.some((t) => t.id === sp.tipo) ? (sp.tipo as string) : "resumo";
  const de = DATA.test(sp.de ?? "") ? (sp.de as string) : inicioDoMes();
  const ate = DATA.test(sp.ate ?? "") ? (sp.ate as string) : hoje();

  const { org, user } = await contextoFiscal();
  const tagIdioma = tagDeIdioma(user.idioma);
  const supabase = await createClient();

  const { data } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", org.orgId)
    .gte("dh_emi", `${de}T00:00:00.000Z`)
    .lte("dh_emi", `${ate}T23:59:59.999Z`)
    .order("dh_emi", { ascending: true, nullsFirst: false })
    .limit(20_000);

  const linhas = (data ?? []) as unknown as LinhaDeEntrada[];
  const resumo = resumoDoPeriodo(linhas);
  const fornecedores = porFornecedor(linhas).slice(0, 20);
  const meses = porMes(linhas);

  let produtos: ReturnType<typeof produtosMaisComprados> = [];
  if (tipo === "produtos") {
    const { data: itensRaw } = await supabase
      .from("fiscal_document_items")
      .select(
        "entrada_id, codigo, descricao, ncm, unidade, quantidade, valor_total_cents, " +
          "icms_cents, ipi_cents, pis_cents, cofins_cents, fiscal_entradas!inner(dh_emi, situacao_fiscal)",
      )
      .eq("organization_id", org.orgId)
      .gte("fiscal_entradas.dh_emi", `${de}T00:00:00.000Z`)
      .lte("fiscal_entradas.dh_emi", `${ate}T23:59:59.999Z`)
      .limit(20_000);
    produtos = produtosMaisComprados(
      ((itensRaw ?? []) as unknown as (LinhaDeItem & {
        fiscal_entradas: { situacao_fiscal: string } | { situacao_fiscal: string }[];
      })[])
        .filter((item) => {
          const e = Array.isArray(item.fiscal_entradas)
            ? item.fiscal_entradas[0]
            : item.fiscal_entradas;
          return e?.situacao_fiscal !== "cancelada" && e?.situacao_fiscal !== "denegada";
        }),
    );
  }

  const canceladas = linhas.filter(
    (l) => l.situacao_fiscal === "cancelada" || l.situacao_fiscal === "denegada",
  );
  const pendentes = linhas.filter(
    (l) => l.conferencia_status !== "aprovada" && l.situacao_fiscal !== "cancelada",
  );

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title="Relatórios de entradas"
        subtitle="Compras, impostos e pendências do período — com a mesma soma que o banco entrega."
      />

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <input type="hidden" name="tipo" value={tipo} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground"
        >
          Aplicar
        </button>
        <span className="text-xs text-muted-foreground">
          {resumo.notas} nota(s) no período · {resumo.canceladas} cancelada(s)
        </span>
      </form>

      <NexusKpiGrid>
        <NexusKpi
          label="Compras no período"
          value={comoMoeda(resumo.valor_cents, "BRL")}
          hint={`${resumo.notas_validas} nota(s) válida(s)`}
        />
        <NexusKpi
          label="Impostos"
          value={comoMoeda(resumo.impostos_cents, "BRL")}
          hint={`ICMS ${comoMoeda(resumo.icms_cents, "BRL")} · IPI ${comoMoeda(resumo.ipi_cents, "BRL")}`}
        />
        <NexusKpi
          label="Produtos"
          value={comoMoeda(resumo.produtos_cents, "BRL")}
          hint={`Frete ${comoMoeda(resumo.frete_cents, "BRL")}`}
        />
        <NexusKpi
          label="Pendentes de conferência"
          value={pendentes.length}
          tone={pendentes.length > 0 ? "warning" : "default"}
          hint="Estoque não se move sem aprovação"
        />
      </NexusKpiGrid>

      <nav className="flex flex-wrap gap-1" aria-label="Tipos de relatório">
        {TIPOS.map((t) => (
          <Link
            key={t.id}
            href={`/app/fiscal/relatorios?tipo=${t.id}&de=${de}&ate=${ate}`}
            aria-current={tipo === t.id ? "page" : undefined}
            className={
              tipo === t.id
                ? "rounded-full border border-accent-600/40 bg-accent-soft px-3 py-1.5 text-sm text-accent"
                : "rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text-muted hover:bg-surface-elevated"
            }
          >
            {t.rotulo}
          </Link>
        ))}
      </nav>

      {tipo === "resumo" && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Composição do período</h2>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Produtos", resumo.produtos_cents],
              ["Frete", resumo.frete_cents],
              ["Desconto", resumo.desconto_cents],
              ["ICMS", resumo.icms_cents],
              ["IPI", resumo.ipi_cents],
              ["PIS", resumo.pis_cents],
              ["COFINS", resumo.cofins_cents],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="tabular-nums">{comoMoeda(Number(valor), "BRL")}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(resumo.por_situacao).map(([situacao, n]) => (
              <Badge key={situacao} variant="outline">
                {situacao}: {n}
              </Badge>
            ))}
            {Object.entries(resumo.por_conferencia).map(([situacao, n]) => (
              <Badge key={situacao} variant="neutral">
                {situacao}: {n}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {tipo === "fornecedores" && (
        <section className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Notas</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Impostos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Nenhuma compra no período.
                  </TableCell>
                </TableRow>
              ) : (
                fornecedores.map((f) => (
                  <TableRow key={f.chave}>
                    <TableCell className="font-medium">{f.rotulo}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.notas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(f.valor_cents, "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(f.impostos_cents, "BRL")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {tipo === "mes" && (
        <section className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Notas</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Impostos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Nenhuma compra no período.
                  </TableCell>
                </TableRow>
              ) : (
                meses.map((m) => (
                  <TableRow key={m.chave}>
                    <TableCell className="font-medium">{m.rotulo}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.notas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(m.valor_cents, "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(m.impostos_cents, "BRL")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {tipo === "produtos" && (
        <section className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Produto</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead className="text-right">Notas</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Impostos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Nenhum item no período — o XML completo pode ainda não ter chegado.
                  </TableCell>
                </TableRow>
              ) : (
                produtos.slice(0, 100).map((p) => (
                  <TableRow key={`${p.codigo}-${p.ncm ?? ""}`}>
                    <TableCell>
                      <span className="block max-w-72 truncate font-medium">{p.descricao}</span>
                      <span className="block text-xs text-muted-foreground">{p.codigo}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.ncm ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.notas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.quantidade} {p.unidade ?? ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(p.valor_total_cents, "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(
                        p.icms_cents + p.ipi_cents + p.pis_cents + p.cofins_cents,
                        "BRL",
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {(tipo === "canceladas" || tipo === "pendentes") && (
        <section className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Nota</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tipo === "canceladas" ? canceladas : pendentes).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {tipo === "canceladas"
                      ? "Nenhuma nota cancelada no período."
                      : "Nada pendente de conferência no período."}
                  </TableCell>
                </TableRow>
              ) : (
                (tipo === "canceladas" ? canceladas : pendentes).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        href={`/app/fiscal/notas/${l.id}`}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {identificacaoDaEntrada(l.numero ?? null, l.serie ?? null)}
                      </Link>
                    </TableCell>
                    <TableCell>{l.emitente_nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.dh_emi ? new Date(l.dh_emi).toLocaleDateString(tagIdioma) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(l.valor_total_cents, "BRL")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tipo === "canceladas" ? "error" : "warning"}>
                        {tipo === "canceladas" ? l.situacao_fiscal : l.conferencia_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
