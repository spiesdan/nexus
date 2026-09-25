"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusDataTable } from "@/components/nexus-ui/data/NexusDataTable";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { FilterSearch } from "@/components/filters/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { apiClient } from "@/lib/api/client";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { paraCSV } from "@/lib/comercial/relatorios";
import { Receipt } from "@/lib/ui/icons";
import type { Titulo } from "@/app/api/v1/titulos/route";

/** Pílula de situação única (tabela e cards bebem daqui, sem duplicar cor). */
function SituacaoTitulo({ l, t }: { l: Titulo; t: (texto: string) => string }) {
  if (l.baixado_em) return <Badge variant="info">{t("Recebido")}</Badge>;
  if (l.situacao === "vencido") return <Badge variant="error">{t("Vencido")}</Badge>;
  return <Badge variant="success">{t("A vencer")}</Badge>;
}

export function TitulosClient({
  podeDarBaixa,
  buscaInicial,
}: {
  podeDarBaixa: boolean;
  buscaInicial?: string;
}) {
  const tagIdioma = useTagDeIdioma();
  const t = useT();
  const [situacao, setSituacao] = React.useState("");
  const [busca, setBusca] = React.useState(buscaInicial ?? "");
  const [linhas, setLinhas] = React.useState<Titulo[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  async function carregar(s: string, b: string) {
    setCarregando(true);
    try {
      const qs = new URLSearchParams();
      if (s) qs.set("situacao", s);
      if (b.trim()) qs.set("busca", b.trim());
      const query = qs.toString();
      const corpo = await apiClient.get<{ data: Titulo[] }>(
        `/api/v1/titulos${query ? `?${query}` : ""}`,
      );
      setLinhas(corpo.data ?? []);
    } catch (e) {
      showApiError(e);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar("", buscaInicial ?? "");
    // O primeiro load é este: `buscaInicial` é o termo que veio na URL pela
    // busca global (§17). Depois disso quem manda é o debounced abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Digitou: recarrega sem tecla. O servidor é quem filtra (mesmo `busca` da
  // Global Search), então a página e a paleta nunca divergem sobre o que o
  // termo achou — e não são 2000 linhas refiltradas no cliente a cada tecla.
  const recarregarPorBusca = useDebouncedCallback((b: string) => {
    void carregar(situacao, b);
  }, 300);
  const primeiraExecucao = React.useRef(true);
  React.useEffect(() => {
    // Na montagem o load imediato de cima já respondeu; o debounced só entra
    // quando o usuário digita de fato, senão a lista carregaria DUAS vezes.
    if (primeiraExecucao.current) {
      primeiraExecucao.current = false;
      return;
    }
    recarregarPorBusca(busca);
  }, [busca, recarregarPorBusca]);

  const totalVencido = linhas
    .filter((l) => l.situacao === "vencido" && !l.baixado_em)
    .reduce((a, l) => a + l.valor_cents, 0);
  const totalAVencer = linhas
    .filter((l) => l.situacao === "a_vencer" && !l.baixado_em)
    .reduce((a, l) => a + l.valor_cents, 0);
  const totalRecebido = linhas.filter((l) => l.baixado_em).reduce((a, l) => a + l.valor_cents, 0);

  function exportar() {
    const blob = new Blob(
      [
        "﻿" +
          paraCSV(
            ["Vencimento", "Cliente", "Pedido", "Parcela", "Valor (R$)", "Situação"],
            linhas.map((l) => [
              new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString(tagIdioma),
              l.cliente_nome,
              numeroDoPedido(l.numero),
              `${l.parcela}/${l.de}`,
              (l.valor_cents / 100).toLocaleString(tagIdioma, { minimumFractionDigits: 2 }),
              l.baixado_em ? "Recebido" : l.situacao === "vencido" ? "Vencido" : "A vencer",
            ]),
          ),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "titulos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function darBaixa(l: Titulo) {
    try {
      await apiClient.post("/api/v1/titulos/baixas", {
        order_id: l.order_id,
        parcela_n: l.parcela,
        valor_cents: l.valor_cents,
      });
      nexusToast.success(t("Recebimento registrado"));
      await carregar(situacao, busca);
    } catch (e) {
      showApiError(e);
    }
  }

  async function estornar(l: Titulo) {
    try {
      await apiClient.delete(
        `/api/v1/titulos/baixas?order_id=${l.order_id}&parcela_n=${l.parcela}`,
      );
      nexusToast.success(t("Baixa estornada"));
      await carregar(situacao, busca);
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <NexusPageHeader
        title={t("Títulos")}
        subtitle={t("Contas a receber derivadas dos pedidos faturados, por vencimento.")}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/app/financeiro">{t("Abrir financeiro")}</Link>
            </Button>
            {linhas.length > 0 ? (
              <Button size="sm" variant="outline" onClick={exportar}>
                Excel
              </Button>
            ) : undefined}
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <FilterSearch
          id="busca-titulo"
          label={t("Buscar")}
          value={busca}
          onChange={setBusca}
          placeholder={t("Cliente ou número do pedido")}
          dataTestId="busca-titulo"
        />
        <div className="block text-sm">
          <span className="mb-1 block text-muted-foreground">{t("Situação")}</span>
          <Select
            value={situacao || "__todas"}
            onValueChange={(v) => {
              const prox = v === "__todas" ? "" : v;
              setSituacao(prox);
              void carregar(prox, busca);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t("Todas")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas">{t("Todas")}</SelectItem>
              <SelectItem value="vencido">{t("Vencidos")}</SelectItem>
              <SelectItem value="a_vencer">{t("A vencer")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="hover-raise p-4">
          <p className="text-sm text-muted-foreground">{t("Vencido")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {comoMoeda(totalVencido, "BRL")}
          </p>
        </Card>
        <Card className="hover-raise p-4">
          <p className="text-sm text-muted-foreground">{t("A vencer")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {comoMoeda(totalAVencer, "BRL")}
          </p>
        </Card>
        <Card className="hover-raise p-4">
          <p className="text-sm text-muted-foreground">{t("Recebido")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {comoMoeda(totalRecebido, "BRL")}
          </p>
        </Card>
      </div>

      <NexusDataTable<Titulo>
        state={carregando ? "loading" : linhas.length === 0 ? "empty" : "ready"}
        empty={
          <NexusEmptyState
            icon={Receipt}
            headline={t("Nenhum título no filtro.")}
            subcopy={
              situacao || busca ? undefined : t("Os títulos nascem das parcelas dos pedidos faturados.")
            }
            primary={
              situacao || busca
                ? {
                    label: t("Limpar filtro"),
                    onClick: () => {
                      setSituacao("");
                      setBusca("");
                      void carregar("", "");
                    },
                  }
                : { label: t("Ver pedidos"), href: "/app/pedidos" }
            }
          />
        }
        items={linhas}
        keyOf={(l) => `${l.order_id}-${l.parcela}`}
        renderCard={(l) => (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/app/pedidos/${l.order_id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {numeroDoPedido(l.numero)} · {l.parcela}/{l.de}
              </Link>
              <SituacaoTitulo l={l} t={t} />
            </div>
            <p className="truncate text-muted-foreground">{l.cliente_nome}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground tabular-nums">
                {new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString(tagIdioma)}
              </span>
              <span className="font-medium tabular-nums">{comoMoeda(l.valor_cents, "BRL")}</span>
            </div>
            {podeDarBaixa && (
              <div className="pt-1">
                {l.baixado_em ? (
                  <Button size="sm" variant="outline" onClick={() => void estornar(l)}>
                    {t("Estornar")}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void darBaixa(l)}>
                    {t("Dar baixa")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        table={
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("Vencimento")}</TableHead>
                <TableHead>{t("Cliente")}</TableHead>
                <TableHead>{t("Pedido")}</TableHead>
                <TableHead>{t("Parcela")}</TableHead>
                <TableHead className="text-right">{t("Valor")}</TableHead>
                <TableHead>{t("Situação")}</TableHead>
                {podeDarBaixa && <TableHead>{t("Ação")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={`${l.order_id}-${l.parcela}-${i}`}>
                  <TableCell className="text-muted-foreground">
                    {new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString(tagIdioma)}
                    {l.avista && <span className="ml-1 text-xs">{t("(à vista)")}</span>}
                  </TableCell>
                  <TableCell>{l.cliente_nome}</TableCell>
                  <TableCell>
                    <Link
                      href={`/app/pedidos/${l.order_id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {numeroDoPedido(l.numero)}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {l.parcela}/{l.de}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {comoMoeda(l.valor_cents, "BRL")}
                  </TableCell>
                  <TableCell>
                    <SituacaoTitulo l={l} t={t} />
                  </TableCell>
                  {podeDarBaixa && (
                    <TableCell>
                      {l.baixado_em ? (
                        <Button size="sm" variant="outline" onClick={() => void estornar(l)}>
                          {t("Estornar")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void darBaixa(l)}>
                          {t("Dar baixa")}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
      <p className="text-xs text-muted-foreground">
        {t(
          "Títulos derivados das parcelas do pedido; sem condição parcelada, o vencimento é a emissão.",
        )}
      </p>
    </div>
  );
}
