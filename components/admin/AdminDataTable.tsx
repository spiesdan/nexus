"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";

/**
 * O casco único das tabelas de admin (inventário §3: "7 tabelas admin = o
 * mesmo padrão (skeleton+empty+badge+load-more) → AdminDataTable único").
 *
 * O que ERA idêntico nas 7 e mora aqui: moldura `rounded-3xl border`, header,
 * estado vazio (early-return SEM wrapper, como as origens), botão "Carregar
 * mais" e o skeleton — cujos rótulos de coluna agora saem da MESMA lista da
 * tabela (antes eram copiados à mão e podiam divergir).
 *
 * O que NÃO muda de lugar: colunas/células do domínio (ficam em cada arquivo,
 * numa `colunasAdmin(t, locale)` local), helpers de máscara/data e a barra de
 * ferramentas de cima (Usage) — o casco não é dono da toolbar.
 */

export type ColunaAdmin<Row> = {
  id: string;
  /** Rótulo literal; o `t()` é de quem monta a lista (hook fora de módulo). */
  cabecalho: ReactNode;
  classeCabecalho?: string;
  classeCelula?: string;
  celula: (row: Row) => ReactNode;
};

/** Só o que o skeleton lê — `ColunaAdmin<Row>[]` é atribuível a isto. */
type CabecalhoAdmin = Pick<ColunaAdmin<unknown>, "id" | "cabecalho" | "classeCabecalho">;

export type EstadoVazioAdmin = {
  icon: PhosphorIcon;
  headline: string;
  subcopy?: string;
};

export type PaginacaoAdmin = {
  temProxima: boolean;
  buscando: boolean;
  carregarMais: () => void;
};

export function AdminDataTableSkeleton({
  colunas,
  linhas = 5,
}: {
  colunas: CabecalhoAdmin[];
  linhas?: number;
}) {
  return (
    <div className="rounded-3xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {colunas.map((coluna) => (
              <TableHead key={coluna.id} className={coluna.classeCabecalho}>
                {coluna.cabecalho}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: linhas }).map((_, i) => (
            <TableRow key={i}>
              {colunas.map((coluna) => (
                <TableCell key={coluna.id}>
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdminDataTable<Row>({
  colunas,
  linhas,
  chave,
  vazio,
  paginacao,
  classeLinha,
}: {
  colunas: ColunaAdmin<Row>[];
  linhas: Row[];
  chave: (row: Row) => string;
  vazio: EstadoVazioAdmin;
  paginacao?: PaginacaoAdmin;
  classeLinha?: (row: Row) => string | undefined;
}) {
  const t = useT();

  if (linhas.length === 0) {
    return (
      <EmptyState icon={vazio.icon} headline={vazio.headline} subcopy={vazio.subcopy} />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna) => (
                <TableHead key={coluna.id} className={coluna.classeCabecalho}>
                  {coluna.cabecalho}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((row) => (
              <TableRow key={chave(row)} className={classeLinha?.(row)}>
                {colunas.map((coluna) => (
                  <TableCell key={coluna.id} className={coluna.classeCelula}>
                    {coluna.celula(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {paginacao?.temProxima && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={paginacao.carregarMais}
            disabled={paginacao.buscando}
          >
            {paginacao.buscando ? t("Carregando...") : t("Carregar mais")}
          </Button>
        </div>
      )}
    </div>
  );
}
