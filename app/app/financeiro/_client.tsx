"use client";

import Link from "next/link";
import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { EmptyFilterResults } from "@/components/empty";
import { NexusDataTable } from "@/components/nexus-ui/data/NexusDataTable";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { CrmKpi, CrmKpiGrid } from "@/components/nexus-ui/crm/crm-kpi";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import { randomId } from "@/lib/random-id";
import { AbaTitulos } from "./_titulos";

type Situacao = "aberto" | "parcial" | "pago" | "vencido" | "cancelado";

interface Recebivel {
  id: string;
  order_id: string | null;
  invoice_id: string | null;
  contact_id: string | null;
  parcela_n: number;
  total_parcelas: number;
  valor_original_cents: number;
  vencimento: string;
  status: string;
  forma_pagamento: string | null;
  situacao: Situacao;
  pago_cents: number;
  saldo_cents: number;
  dias_atraso: number;
  contato_nome: string | null;
  contato_cidade: string | null;
  pedido_numero: number | null;
}

interface Pagamento {
  id: string;
  valor_cents: number;
  pago_em: string;
  forma_pagamento: string | null;
  conta: string | null;
  observacao: string | null;
}

const VARIANTE_SITUACAO: Record<Situacao, "success" | "warning" | "error" | "info"> = {
  pago: "success",
  parcial: "info",
  aberto: "warning",
  vencido: "error",
  cancelado: "warning",
};

function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function hojeIso(): string {
  return dataIso(new Date());
}
function maisDias(n: number): string {
  return dataIso(new Date(Date.now() + n * 86400000));
}

export function FinanceiroClient({
  podeRegistrar,
  abaInicial,
  buscaInicial,
}: {
  podeRegistrar: boolean;
  abaInicial?: string;
  buscaInicial?: string;
}) {
  const t = useT();
  const [aba, setAba] = React.useState(abaInicial ?? "recebiveis");
  const [linhas, setLinhas] = React.useState<Recebivel[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [pagina, setPagina] = React.useState(1);
  const [busca, setBusca] = React.useState("");
  const [buscaAplicada, setBuscaAplicada] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [kpis, setKpis] = React.useState<Record<string, number> | null>(null);
  const [erroRecebiveis, setErroRecebiveis] = React.useState(false);
  const [erroConciliacao, setErroConciliacao] = React.useState(false);
  const [divergencias, setDivergencias] = React.useState<
    { tipo: string; [k: string]: unknown }[] | null
  >(null);
  const [expandido, setExpandido] = React.useState<string | null>(null);

  const carregar = React.useCallback(
    async (pag: number, filtros: { busca: string; status: string; de: string; ate: string }) => {
      try {
        const qs = new URLSearchParams({ page: String(pag), limit: "50" });
        if (filtros.busca.trim()) qs.set("busca", filtros.busca.trim());
        if (filtros.status) qs.set("status", filtros.status);
        if (filtros.de) qs.set("de", filtros.de);
        if (filtros.ate) qs.set("ate", filtros.ate);
        const corpo = await apiClient.get<{
          data: Recebivel[];
          meta?: { page?: number; limit?: number; total?: number };
        }>(`/api/v1/financeiro/recebiveis?${qs}`);
        setLinhas(corpo.data ?? []);
        setTotal(corpo.meta?.total ?? 0);
        setErroRecebiveis(false);
      } catch (e) {
        showApiError(e);
        setLinhas([]);
        setErroRecebiveis(true);
      }
    },
    [],
  );

  const carregarKpis = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: Record<string, number> }>(
        "/api/v1/financeiro/dashboard",
      );
      setKpis(corpo.data ?? null);
    } catch {
      setKpis(null);
    }
  }, []);

  const carregarConciliacao = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: { tipo: string; [k: string]: unknown }[] }>(
        "/api/v1/financeiro/conciliacao",
      );
      setDivergencias(corpo.data ?? []);
      setErroConciliacao(false);
    } catch (e) {
      showApiError(e);
      setDivergencias([]);
      setErroConciliacao(true);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar(1, { busca: "", status: "", de: "", ate: "" });
    void carregarKpis();
  }, [carregar, carregarKpis]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (aba === "conciliacao" && divergencias === null) void carregarConciliacao();
  }, [aba, divergencias, carregarConciliacao]);

  function aplicarFiltros() {
    setPagina(1);
    void carregar(1, { busca, status, de, ate });
  }

  function filtroRapido(qual: "hoje" | "vencidos" | "7d" | "30d") {
    const h = hojeIso();
    if (qual === "hoje") {
      setDe(h);
      setAte(h);
      setStatus("");
    } else if (qual === "vencidos") {
      setDe("");
      setAte("");
      setStatus("vencido");
    } else {
      setDe(h);
      setAte(maisDias(qual === "7d" ? 7 : 30));
      setStatus("");
    }
    setPagina(1);
    const f = {
      busca,
      status: qual === "vencidos" ? "vencido" : "",
      de: qual === "vencidos" ? "" : h,
      ate: qual === "vencidos" ? "" : qual === "hoje" ? h : maisDias(qual === "7d" ? 7 : 30),
    };
    void carregar(1, f);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / 50));

  function mudarPagina(p: number) {
    setPagina(p);
    void carregar(p, { busca: buscaAplicada, status, de, ate });
  }

  return (
    <div className="space-y-6 p-6">
      <NexusPageHeader
        title={t("Financeiro")}
        subtitle={t("Centro financeiro integrado às vendas: receber, pagar, cobranças, fluxo e conciliação.")}
      />

      {kpis === null ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <CrmKpiGrid>
          <CrmKpi
            label={t("A receber")}
            value={comoMoeda(kpis.a_receber_cents ?? 0, "BRL")}
          />
          <CrmKpi
            label={t("Vencido")}
            value={comoMoeda(kpis.vencido_cents ?? 0, "BRL")}
            trend={(kpis.vencido_cents ?? 0) > 0 ? "down" : "flat"}
          />
          <CrmKpi
            label={t("Vence hoje / 7 dias")}
            value={comoMoeda(kpis.vence_hoje_cents ?? 0, "BRL")}
            comparison={`7d: ${comoMoeda(kpis.vence_7d_cents ?? 0, "BRL")}`}
          />
          <CrmKpi
            label={t("Recebido (período)")}
            value={comoMoeda(kpis.recebido_periodo_cents ?? 0, "BRL")}
            comparison={`${t("Vendas")}: ${comoMoeda(kpis.vendas_periodo_cents ?? 0, "BRL")}`}
          />
        </CrmKpiGrid>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="recebiveis">{t("Contas a receber")}</TabsTrigger>
          <TabsTrigger value="pagar">{t("Contas a pagar")}</TabsTrigger>
          <TabsTrigger value="cobrancas">{t("Cobranças")}</TabsTrigger>
          <TabsTrigger value="conciliacao">{t("Conciliação")}</TabsTrigger>
          <TabsTrigger value="fluxo">{t("Fluxo de caixa")}</TabsTrigger>
          <TabsTrigger value="titulos">{t("Títulos")}</TabsTrigger>
        </TabsList>

        <TabsContent value="recebiveis" className="mt-4 space-y-3">
          <Card className="hover-raise space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="fin-busca">{t("Buscar")}</Label>
                <Input
                  id="fin-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={t("cliente…")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-status">{t("Status")}</Label>
                <Select
                  value={status || "__todos"}
                  onValueChange={(v) => setStatus(v === "__todos" ? "" : v)}
                >
                  <SelectTrigger id="fin-status" className="h-10 w-full">
                    <SelectValue placeholder={t("Todos")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos">{t("Todos")}</SelectItem>
                    <SelectItem value="aberto">{t("Em aberto")}</SelectItem>
                    <SelectItem value="parcial">{t("Parcial")}</SelectItem>
                    <SelectItem value="pago">{t("Pago")}</SelectItem>
                    <SelectItem value="vencido">{t("Vencido")}</SelectItem>
                    <SelectItem value="cancelado">{t("Cancelado")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-de">{t("Vence de")}</Label>
                <Input id="fin-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-ate">{t("Vence até")}</Label>
                <Input
                  id="fin-ate"
                  type="date"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={() => {
                    setBuscaAplicada(busca);
                    aplicarFiltros();
                  }}
                >
                  {t("Filtrar")}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["hoje", t("Hoje")],
                  ["vencidos", t("Vencidos")],
                  ["7d", t("Próximos 7 dias")],
                  ["30d", t("Próximos 30 dias")],
                ] as const
              ).map(([k, rotulo]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => filtroRapido(k)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium hover:border-accent"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </Card>

          <NexusDataTable<Recebivel>
            state={
              linhas === null
                ? "loading"
                : erroRecebiveis
                  ? "error"
                  : linhas.length === 0
                    ? "empty"
                    : "ready"
            }
            onRetry={() => void carregar(pagina, { busca: buscaAplicada, status, de, ate })}
            empty={
              <EmptyFilterResults
                primary={{
                  label: t("Limpar filtros"),
                  onClick: () => {
                    setBusca("");
                    setBuscaAplicada("");
                    setStatus("");
                    setDe("");
                    setAte("");
                    setPagina(1);
                    void carregar(1, { busca: "", status: "", de: "", ate: "" });
                  },
                }}
              />
            }
            pagination={
              totalPaginas > 1 ? (
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina <= 1}
                    onClick={() => mudarPagina(pagina - 1)}
                  >
                    {t("Anterior")}
                  </Button>
                  <span className="tabular-nums">
                    {t("Página")} {pagina} {t("de")} {totalPaginas} · {total}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina >= totalPaginas}
                    onClick={() => mudarPagina(pagina + 1)}
                  >
                    {t("Próxima")}
                  </Button>
                </div>
              ) : undefined
            }
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Vencimento")}</TableHead>
                    <TableHead>{t("Cliente")}</TableHead>
                    <TableHead>{t("Parcela")}</TableHead>
                    <TableHead className="text-right">{t("Valor")}</TableHead>
                    <TableHead className="text-right">{t("Saldo")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("Ações")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linhas ?? []).map((l) => (
                    <React.Fragment key={l.id}>
                      <TableRow className="align-top">
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString()}
                          {l.dias_atraso > 0 && (
                            <span className="block text-xs text-error-fg">+{l.dias_atraso}d</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{l.contato_nome ?? "—"}</span>
                          {l.contato_cidade && (
                            <span className="block text-xs text-muted-foreground">
                              {l.contato_cidade}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {l.parcela_n}/{l.total_parcelas}
                          {l.pedido_numero != null && (
                            <span className="block text-xs text-muted-foreground">
                              #{l.pedido_numero}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {comoMoeda(l.valor_original_cents, "BRL")}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {comoMoeda(l.saldo_cents, "BRL")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={VARIANTE_SITUACAO[l.situacao]}>{l.situacao}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                          >
                            {expandido === l.id ? t("Fechar") : t("Detalhe")}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandido === l.id && (
                        <TableRow className="bg-muted/30 align-top">
                          <TableCell colSpan={7}>
                            <DetalheRecebivel
                              id={l.id}
                              podeRegistrar={podeRegistrar}
                              aoMudar={() => {
                                void carregar(pagina, { busca: buscaAplicada, status, de, ate });
                                void carregarKpis();
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            }
          />
        </TabsContent>

        <TabsContent value="conciliacao" className="mt-4">
          {divergencias === null ? (
            <Skeleton className="h-24 w-full" />
          ) : erroConciliacao ? (
            <NexusErrorState onRetry={() => void carregarConciliacao()} />
          ) : divergencias.length === 0 ? (
            <Card className="hover-raise p-8 text-center">
              <p className="font-medium">{t("Tudo conciliado")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Nenhuma divergência entre pedido, NF e financeiro.")}
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {divergencias.map((d, i) => (
                <li key={i}>
                  <Card className="hover-raise flex flex-wrap items-center gap-2 p-3 text-sm">
                    <Badge variant="warning">{String(d.tipo).replaceAll("_", " ")}</Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {typeof d.total_cents === "number" ? comoMoeda(d.total_cents, "BRL") : ""}
                      {typeof d.valor_cents === "number" ? comoMoeda(d.valor_cents, "BRL") : ""}
                    </span>
                    {(typeof d.order_id === "string" || typeof d.receivable_id === "string") && (
                      <span className="ml-auto flex gap-2">
                        {typeof d.order_id === "string" && (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/app/pedidos/${d.order_id}`}>{t("Ver pedido")}</Link>
                          </Button>
                        )}
                      </span>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="pagar" className="mt-4">
          <AbaPagar />
        </TabsContent>

        <TabsContent value="cobrancas" className="mt-4">
          <AbaCobrancas aoAbrirTitulos={() => setAba("titulos")} />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <AbaFluxo />
        </TabsContent>

        <TabsContent value="titulos" className="mt-4">
          <AbaTitulos podeDarBaixa={podeRegistrar} buscaInicial={buscaInicial} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface Pagavel {
  id: string;
  entrada_id: string | null;
  contact_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  parcela_n: number;
  total_parcelas: number;
  valor_original_cents: number;
  vencimento: string;
  status: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

interface DiaFluxo {
  dia: string;
  receber_cents: number;
  pagar_cents: number;
  liquido_cents: number;
  acumulado_cents: number;
}

interface Fluxo {
  vencido_receber_cents: number;
  vencido_pagar_cents: number;
  dias: DiaFluxo[];
  amostra_parcial?: boolean;
}

/** Pagável não tem baixa rastreada ainda; vencido aqui é data < hoje em aberto. */
function situacaoDoPagavel(p: Pagavel, hoje: string): Situacao {
  if (p.status === "aberto" || p.status === "parcial") {
    return p.vencimento < hoje ? "vencido" : (p.status as Situacao);
  }
  return p.status as Situacao;
}

function AbaPagar() {
  const t = useT();
  const [pagaveis, setPagaveis] = React.useState<Pagavel[] | null>(null);
  const [erro, setErro] = React.useState(false);
  const [statusFiltro, setStatusFiltro] = React.useState("");
  const [busca, setBusca] = React.useState("");

  const carregar = React.useCallback(async () => {
    try {
      const c = await apiClient.get<{ data: Pagavel[] }>("/api/v1/financial-pagaveis");
      setPagaveis(c.data ?? []);
      setErro(false);
    } catch (e) {
      showApiError(e);
      setPagaveis([]);
      setErro(true);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const hoje = hojeIso();
  const linhas = (pagaveis ?? []).filter((p) => {
    const sit = situacaoDoPagavel(p, hoje);
    if (statusFiltro && sit !== statusFiltro) return false;
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      const nome = (p.fornecedor_nome ?? "").toLowerCase();
      const cnpj = (p.fornecedor_cnpj ?? "").toLowerCase();
      if (!nome.includes(b) && !cnpj.includes(b)) return false;
    }
    return true;
  });

  const somaPorStatus = (fn: (p: Pagavel) => boolean) =>
    (pagaveis ?? [])
      .filter(fn)
      .reduce((acc, p) => acc + p.valor_original_cents, 0);
  const emAbertoCents = somaPorStatus((p) => {
    const s = situacaoDoPagavel(p, hoje);
    return s === "aberto" || s === "parcial" || s === "vencido";
  });
  const vencidoCents = somaPorStatus((p) => situacaoDoPagavel(p, hoje) === "vencido");
  const pagoCents = somaPorStatus((p) => p.status === "pago");

  if (pagaveis === null) {
    return (
      <div className="space-y-2" aria-live="polite">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (erro) return <NexusErrorState onRetry={() => void carregar()} />;

  return (
    <div className="space-y-4">
      <CrmKpiGrid>
        <CrmKpi label={t("Em aberto")} value={comoMoeda(emAbertoCents, "BRL")} />
        <CrmKpi
          label={t("Vencido")}
          value={comoMoeda(vencidoCents, "BRL")}
          trend={vencidoCents > 0 ? "down" : "flat"}
        />
        <CrmKpi label={t("Pago")} value={comoMoeda(pagoCents, "BRL")} />
        <CrmKpi label={t("Títulos")} value={String(pagaveis.length)} />
      </CrmKpiGrid>

      <Card className="hover-raise space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pag-busca">{t("Buscar")}</Label>
            <Input
              id="pag-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("fornecedor…")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pag-status">{t("Status")}</Label>
            <Select
              value={statusFiltro || "__todos"}
              onValueChange={(v) => setStatusFiltro(v === "__todos" ? "" : v)}
            >
              <SelectTrigger id="pag-status" className="h-10 w-full">
                <SelectValue placeholder={t("Todos")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos">{t("Todos")}</SelectItem>
                <SelectItem value="aberto">{t("Em aberto")}</SelectItem>
                <SelectItem value="vencido">{t("Vencido")}</SelectItem>
                <SelectItem value="pago">{t("Pago")}</SelectItem>
                <SelectItem value="cancelado">{t("Cancelado")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Baixa e cancelamento de pagável são fase futura: o status nasce na importação da nota fiscal.")}
        </p>
      </Card>

      <NexusDataTable<Pagavel>
        state={linhas.length === 0 ? "empty" : "ready"}
        empty={
          <Card className="hover-raise p-8 text-center">
            <p className="font-medium">{t("Nenhuma conta a pagar")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("As parcelas das notas de entrada aparecem aqui.")}
            </p>
          </Card>
        }
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Fornecedor")}</TableHead>
                <TableHead>{t("Parcela")}</TableHead>
                <TableHead>{t("Vencimento")}</TableHead>
                <TableHead className="text-right">{t("Valor")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Forma")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((p) => {
                const sit = situacaoDoPagavel(p, hoje);
                const atrasoDias =
                  sit === "vencido"
                    ? Math.floor(
                        (new Date(`${hoje}T12:00:00Z`).getTime() -
                          new Date(`${p.vencimento}T12:00:00Z`).getTime()) /
                          86400000,
                      )
                    : 0;
                return (
                  <TableRow key={p.id} className="align-top">
                    <TableCell>
                      <span className="font-medium">{p.fornecedor_nome ?? t("Sem fornecedor")}</span>
                      {p.fornecedor_cnpj && (
                        <span className="block text-xs text-muted-foreground">
                          {p.fornecedor_cnpj}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {p.parcela_n}/{p.total_parcelas}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {new Date(`${p.vencimento}T12:00:00Z`).toLocaleDateString()}
                      {atrasoDias > 0 && (
                        <span className="block text-xs text-error-fg">+{atrasoDias}d</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {comoMoeda(p.valor_original_cents, "BRL")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_SITUACAO[sit]}>{sit}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.forma_pagamento ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        }
      />
    </div>
  );
}

function AbaCobrancas({ aoAbrirTitulos }: { aoAbrirTitulos: () => void }) {
  const t = useT();
  const [linhas, setLinhas] = React.useState<Recebivel[] | null>(null);
  const [erro, setErro] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const qs = new URLSearchParams({ status: "vencido", limit: "200", ordem: "vencimento" });
      const c = await apiClient.get<{ data: Recebivel[] }>(`/api/v1/financeiro/recebiveis?${qs}`);
      setLinhas(c.data ?? []);
      setErro(false);
    } catch (e) {
      showApiError(e);
      setLinhas([]);
      setErro(true);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  if (linhas === null) {
    return <Skeleton className="h-32 w-full" aria-live="polite" />;
  }
  if (erro) return <NexusErrorState onRetry={() => void carregar()} />;

  const totalVencido = linhas.reduce((acc, l) => acc + l.saldo_cents, 0);
  const maiorAtraso = linhas.reduce((acc, l) => Math.max(acc, l.dias_atraso), 0);

  if (linhas.length === 0) {
    return (
      <Card className="hover-raise p-8 text-center">
        <p className="font-medium">{t("Nada vencido")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Nenhum título passou do vencimento. As cobranças estão em dia.")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <CrmKpiGrid>
        <CrmKpi label={t("Total vencido")} value={comoMoeda(totalVencido, "BRL")} trend="down" />
        <CrmKpi label={t("Títulos")} value={String(linhas.length)} />
        <CrmKpi label={t("Maior atraso")} value={`${maiorAtraso}d`} trend="down" />
      </CrmKpiGrid>

      <p className="text-xs text-muted-foreground">
        {t("A baixa e a negociação do título vivem em Títulos; aqui é o painel do que está atrasado.")}
      </p>

      <NexusDataTable<Recebivel>
        state={linhas.length === 0 ? "empty" : "ready"}
        empty={
          <Card className="hover-raise p-8 text-center">
            <p className="font-medium">{t("Nada vencido")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Nenhum título passou do vencimento. As cobranças estão em dia.")}
            </p>
          </Card>
        }
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Cliente")}</TableHead>
                <TableHead>{t("Vencimento")}</TableHead>
                <TableHead>{t("Parcela")}</TableHead>
                <TableHead className="text-right">{t("Saldo")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("Ações")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id} className="align-top">
                  <TableCell>
                    <span className="font-medium">{l.contato_nome ?? "—"}</span>
                    {l.contato_cidade && (
                      <span className="block text-xs text-muted-foreground">{l.contato_cidade}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString()}
                    {l.dias_atraso > 0 && (
                      <span className="block text-xs text-error-fg">+{l.dias_atraso}d</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {l.parcela_n}/{l.total_parcelas}
                    {l.pedido_numero != null && (
                      <span className="block text-xs text-muted-foreground">#{l.pedido_numero}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {comoMoeda(l.saldo_cents, "BRL")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={aoAbrirTitulos}>
                      {t("Abrir em Títulos")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </div>
  );
}

function AbaFluxo() {
  const t = useT();
  const [dias, setDias] = React.useState(60);
  const [fluxo, setFluxo] = React.useState<Fluxo | null>(null);
  const [erro, setErro] = React.useState(false);

  const carregar = React.useCallback(async () => {
    try {
      const c = await apiClient.get<{ data: Fluxo }>(`/api/v1/financeiro/fluxo?dias=${dias}`);
      setFluxo(c.data);
      setErro(false);
    } catch (e) {
      showApiError(e);
      setFluxo(null);
      setErro(true);
    }
  }, [dias]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  if (fluxo === null) {
    return erro ? (
      <NexusErrorState onRetry={() => void carregar()} />
    ) : (
      <Skeleton className="h-32 w-full" aria-live="polite" />
    );
  }

  const comMovimento = fluxo.dias.filter(
    (d) => d.receber_cents !== 0 || d.pagar_cents !== 0,
  );
  const liquidoVencido = fluxo.vencido_receber_cents - fluxo.vencido_pagar_cents;
  const posicaoFinal = fluxo.dias.at(-1)?.acumulado_cents ?? liquidoVencido;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            value={String(dias)}
            onValueChange={(v) => setDias(Number(v))}
          >
            <SelectTrigger aria-label={t("Horizonte (dias)")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t("30 dias")}</SelectItem>
              <SelectItem value="60">{t("60 dias")}</SelectItem>
              <SelectItem value="90">{t("90 dias")}</SelectItem>
              <SelectItem value="180">{t("180 dias")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {fluxo.amostra_parcial ? (
          <span className="text-xs text-muted-foreground">
            {t("Amostra parcial: há mais títulos do que a análise lê por vez.")}
          </span>
        ) : null}
      </div>

      <CrmKpiGrid>
        <CrmKpi
          label={t("Vencido a receber")}
          value={comoMoeda(fluxo.vencido_receber_cents, "BRL")}
          trend="down"
        />
        <CrmKpi
          label={t("Vencido a pagar")}
          value={comoMoeda(fluxo.vencido_pagar_cents, "BRL")}
        />
        <CrmKpi
          label={t("Líquido vencido")}
          value={comoMoeda(liquidoVencido, "BRL")}
          trend={liquidoVencido < 0 ? "down" : "flat"}
        />
        <CrmKpi
          label={t("Posição no fim do período")}
          value={comoMoeda(posicaoFinal, "BRL")}
          trend={posicaoFinal < 0 ? "down" : "flat"}
        />
      </CrmKpiGrid>

      <NexusDataTable<DiaFluxo>
        state={comMovimento.length === 0 ? "empty" : "ready"}
        empty={
          <Card className="hover-raise p-8 text-center">
            <p className="font-medium">{t("Sem movimento no período")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Nenhum vencimento de receber ou pagar nos próximos dias.")}
            </p>
          </Card>
        }
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Dia")}</TableHead>
                <TableHead className="text-right">{t("A receber")}</TableHead>
                <TableHead className="text-right">{t("A pagar")}</TableHead>
                <TableHead className="text-right">{t("Líquido")}</TableHead>
                <TableHead className="text-right">{t("Acumulado")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comMovimento.map((d) => (
                <TableRow key={d.dia} className="align-top">
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(`${d.dia}T12:00:00Z`).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {comoMoeda(d.receber_cents, "BRL")}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {comoMoeda(d.pagar_cents, "BRL")}
                  </TableCell>
                  <TableCell
                    className={`text-right whitespace-nowrap tabular-nums ${
                      d.liquido_cents < 0 ? "text-error-fg" : ""
                    }`}
                  >
                    {comoMoeda(d.liquido_cents, "BRL")}
                  </TableCell>
                  <TableCell
                    className={`text-right whitespace-nowrap tabular-nums font-medium ${
                      d.acumulado_cents < 0 ? "text-error-fg" : ""
                    }`}
                  >
                    {comoMoeda(d.acumulado_cents, "BRL")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
      <p className="text-xs text-muted-foreground">
        {t("Dias sem vencimento não aparecem. A posição acumulada já parte do líquido vencido de hoje.")}
      </p>
    </div>
  );
}

function DetalheRecebivel({
  id,
  podeRegistrar,
  aoMudar,
}: {
  id: string;
  podeRegistrar: boolean;
  aoMudar: () => void;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const [dados, setDados] = React.useState<{
    pagamentos: Pagamento[];
    pedido: { id: string; numero: number } | null;
    nota: { id: string; numero: number | null } | null;
    situacao: Situacao;
    saldo_cents: number;
  } | null>(null);
  const [valor, setValor] = React.useState("");
  const [pagando, setPagando] = React.useState(false);
  const [chave] = React.useState(() => randomId());

  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: NonNullable<typeof dados> }>(`/api/v1/financeiro/recebiveis/${id}`)
      .then((r) => vivo && setDados(r.data))
      .catch(() => vivo && setDados(null));
    return () => {
      vivo = false;
    };
  }, [id]);

  async function pagar() {
    const cents = Math.round((Number(valor.replace(/\./g, "").replace(",", ".")) || 0) * 100);
    if (!cents || cents <= 0) {
      toast.error(t("Valor inválido. Escreva assim: 5.000,00"));
      return;
    }
    setPagando(true);
    try {
      await apiClient.post(
        `/api/v1/financeiro/recebiveis/${id}/pagamentos`,
        { valor_cents: cents },
        { idempotencyKey: chave },
      );
      toast.success(t("Recebimento registrado"));
      setValor("");
      const r = await apiClient.get<{ data: NonNullable<typeof dados> }>(
        `/api/v1/financeiro/recebiveis/${id}`,
      );
      setDados(r.data);
      aoMudar();
    } catch (e) {
      showApiError(e);
    } finally {
      setPagando(false);
    }
  }

  async function estornar(pagamentoId: string) {
    const ok = await confirmar({
      title: t("Estornar este recebimento?"),
      confirmLabel: t("Estornar"),
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/api/v1/financeiro/pagamentos/${pagamentoId}`);
      toast.success(t("Estornado"));
      const r = await apiClient.get<{ data: NonNullable<typeof dados> }>(
        `/api/v1/financeiro/recebiveis/${id}`,
      );
      setDados(r.data);
      aoMudar();
    } catch (e) {
      showApiError(e);
    }
  }

  if (!dados) return <Skeleton className="h-16 w-full" />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("Recebimentos")}
        </p>
        {dados.pagamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhum recebimento ainda.")}</p>
        ) : (
          <ul className="space-y-1">
            {dados.pagamentos.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="tabular-nums">{comoMoeda(p.valor_cents, "BRL")}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.pago_em).toLocaleDateString()}
                </span>
                {podeRegistrar && (
                  <Button size="sm" variant="ghost" onClick={() => void estornar(p.id)}>
                    {t("Estornar")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {dados.pedido && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/app/pedidos/${dados.pedido.id}`}>{t("Ver pedido")}</Link>
            </Button>
          )}
        </div>
      </div>
      {podeRegistrar && dados.situacao !== "pago" && dados.situacao !== "cancelado" && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("Registrar recebimento")}
          </p>
          <div className="flex gap-2">
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              aria-label={t("Valor recebido")}
            />
            <Button size="sm" onClick={() => void pagar()} disabled={pagando}>
              {pagando ? t("Salvando…") : t("Receber")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("Saldo")}: {comoMoeda(dados.saldo_cents, "BRL")}
          </p>
        </div>
      )}
    </div>
  );
}
