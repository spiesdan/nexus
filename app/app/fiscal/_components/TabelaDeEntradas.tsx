"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { comoMoeda } from "@/lib/format/moeda";
import {
  ROTULO_DA_CONFERENCIA,
  ROTULO_DA_ENTRADA,
  ROTULO_DA_SITUACAO,
  STATUS_DA_CONFERENCIA,
  STATUS_DA_ENTRADA,
  identificacaoDaEntrada,
  type EntradaFiscal,
  type StatusDaConferencia,
  type StatusDaEntrada,
} from "@/lib/schemas/fiscal-entrada";
import { ArrowRight, FileText, MagnifyingGlass, X } from "@/lib/ui/icons";

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

/**
 * A lista de notas de entrada — uma só, usada por quatro subtelas.
 *
 * "Todas as Notas", "Pendentes de Conferência", "XML Recebidos" e "Resumos" são
 * o MESMO dado com um recorte diferente; se cada tela tivesse a sua tabela, a
 * coluna que uma ganhasse não apareceria nas outras e as quatro divergiriam.
 * O recorte entra por `modo`, e o filtro fino continua na mão de quem usa.
 *
 * Nenhuma ação destrutiva mora aqui: clicar abre o detalhe, onde estão o
 * manifestar, o aprovar e o importar — com o contexto (itens, totais, eventos)
 * que a decisão exige.
 */
export function TabelaDeEntradas({
  inicial,
  modo = "todas",
}: {
  inicial: EntradaFiscal[];
  modo?: "todas" | "pendentes" | "xml" | "resumos";
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [conferencia, setConferencia] = React.useState("");

  const visiveis = React.useMemo(() => {
    const b = busca.trim().toLowerCase();
    const digitos = b.replace(/\D/g, "");
    return inicial.filter((e) => {
      if (modo === "pendentes" && e.conferencia_status === "aprovada") return false;
      if (modo === "xml" && !e.xml) return false;
      if (modo === "resumos" && e.xml) return false;
      if (status !== "" && e.status !== status) return false;
      if (conferencia !== "" && e.conferencia_status !== conferencia) return false;
      if (!b) return true;
      return (
        e.emitente_nome.toLowerCase().includes(b) ||
        (digitos !== "" &&
          (e.emitente_cnpj.includes(digitos) ||
            e.chave.includes(digitos) ||
            String(e.numero ?? "").includes(digitos)))
      );
    });
  }, [inicial, busca, status, conferencia, modo]);

  const filtrando = busca.trim() !== "" || status !== "" || conferencia !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <MagnifyingGlass size={16} className="text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("emitente, CNPJ, chave, número…")}
            className="h-9 w-64"
            aria-label={t("Buscar notas")}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("Status")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("Todos os status")}</option>
          {STATUS_DA_ENTRADA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_DA_ENTRADA[s]}
            </option>
          ))}
        </select>
        <select
          value={conferencia}
          onChange={(e) => setConferencia(e.target.value)}
          aria-label={t("Conferência")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">{t("Toda a conferência")}</option>
          {STATUS_DA_CONFERENCIA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_DA_CONFERENCIA[s]}
            </option>
          ))}
        </select>
        {filtrando && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBusca("");
              setStatus("");
              setConferencia("");
            }}
          >
            <X size={14} /> {t("Limpar")}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {visiveis.length === inicial.length
            ? `${inicial.length} ${t("nota(s)")}`
            : `${visiveis.length} ${t("de")} ${inicial.length}`}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={FileText}
          headline={
            inicial.length === 0
              ? modo === "pendentes"
                ? t("Nada pendente de conferência.")
                : t("Nenhuma nota de entrada ainda.")
              : t("Nenhuma nota com esse filtro.")
          }
          subcopy={
            inicial.length === 0
              ? t("Use Sincronizar na Visão Geral para buscar as notas emitidas contra o CNPJ.")
              : t("Ajuste a busca ou limpe os filtros.")
          }
        />
      ) : (
        <div className="hover-raise overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("Nota")}</TableHead>
                <TableHead>{t("Fornecedor")}</TableHead>
                <TableHead>{t("Emissão")}</TableHead>
                <TableHead className="text-right">{t("Valor")}</TableHead>
                <TableHead>{t("Situação")}</TableHead>
                <TableHead>{t("Conferência")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {identificacaoDaEntrada(e.numero, e.serie)}
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-64 truncate" title={e.emitente_nome}>
                      {e.emitente_nome}
                    </span>
                    <span className="block text-xs text-muted-foreground">{e.emitente_cnpj}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.dh_emi ? new Date(e.dh_emi).toLocaleDateString(tagIdioma) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {comoMoeda(e.valor_total_cents, "BRL")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={VARIANTE_STATUS[e.status]}>
                        {ROTULO_DA_ENTRADA[e.status]}
                      </Badge>
                      {e.situacao_fiscal !== "desconhecida" && (
                        <Badge variant="outline" className="text-[10px]">
                          {ROTULO_DA_SITUACAO[e.situacao_fiscal]}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_CONFERENCIA[e.conferencia_status]}>
                      {ROTULO_DA_CONFERENCIA[e.conferencia_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/fiscal/notas/${e.id}`}
                      aria-label={t("Abrir a nota")}
                      className="inline-flex items-center text-accent hover:underline"
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
