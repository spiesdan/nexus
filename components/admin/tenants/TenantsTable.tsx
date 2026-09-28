"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import Link from "next/link";
import { Buildings } from "@/lib/ui/icons";
import type { AdminTenantRow } from "@/hooks/useAdminTenants";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";
import { TenantStatusBadge } from "@/components/admin/tenants/status-badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null, idioma: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(idioma, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

function extractCount(
  arr: Array<{ count: number }> | null | undefined,
): number {
  if (!arr || arr.length === 0) return 0;
  return arr[0]?.count ?? 0;
}

function shortCnpj(cnpj: string | null): string {
  if (!cnpj) return "—";
  // Show first 8 digits (company root) + ...
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length < 8) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/...`;
}

// ---------------------------------------------------------------------------
// Colunas (o skeleton e a tabela leem ESTA lista — sem cópia de rótulo)
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  idioma: string,
): ColunaAdmin<AdminTenantRow>[] {
  return [
    {
      id: "slug",
      cabecalho: "Slug",
      classeCabecalho: "w-[140px]",
      classeCelula: "font-mono text-xs",
      celula: (row) => row.slug,
    },
    {
      id: "nome",
      cabecalho: t("Nome"),
      classeCelula: "font-medium",
      celula: (row) => row.display_name,
    },
    {
      id: "cnpj",
      cabecalho: "CNPJ",
      classeCabecalho: "w-[130px]",
      classeCelula: "font-mono text-xs text-muted-foreground",
      celula: (row) => shortCnpj(row.cnpj),
    },
    {
      id: "status",
      cabecalho: t("Status"),
      classeCabecalho: "w-[110px]",
      celula: (row) => <TenantStatusBadge status={row.status} onboardedAt={row.onboarded_at} />,
    },
    {
      id: "users",
      cabecalho: t("Users"),
      classeCabecalho: "w-[70px] text-right",
      classeCelula: "text-right tabular-nums",
      celula: (row) => extractCount(row.user_count),
    },
    {
      id: "conversas",
      cabecalho: t("Conversas"),
      classeCabecalho: "w-[90px] text-right",
      classeCelula: "text-right tabular-nums",
      celula: (row) => extractCount(row.conversations_count),
    },
    {
      id: "criado",
      cabecalho: t("Criado em"),
      classeCabecalho: "w-[90px]",
      classeCelula: "text-xs text-muted-foreground",
      celula: (row) => formatDate(row.created_at, idioma),
    },
    {
      id: "acoes",
      cabecalho: "",
      classeCabecalho: "w-[60px]",
      celula: (row) => (
        <Link
          href={`/admin/tenants/${row.id}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          {t("Ver")}
        </Link>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function TenantsTableSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, "")} linhas={5} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TenantsTableProps {
  data: AdminTenantRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function TenantsTable({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: TenantsTableProps) {
  const idioma = useTagDeIdioma();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, idioma)}
      linhas={data}
      chave={(row) => row.id}
      vazio={{
        icon: Buildings,
        headline: "Nenhum tenant encontrado",
        subcopy: "Ajuste os filtros ou crie um novo tenant.",
      }}
      paginacao={{
        temProxima: hasNextPage,
        buscando: isFetchingNextPage,
        carregarMais: onLoadMore,
      }}
    />
  );
}
