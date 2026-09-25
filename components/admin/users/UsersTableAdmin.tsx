"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Users } from "@/lib/ui/icons";
import type { AdminUserRow } from "@/hooks/useAdminUsers";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_VARIANTS: Record<
  string,
  "success" | "info" | "warning" | "error" | "neutral"
> = {
  admin: "error",
  manager: "warning",
  agent: "info",
  viewer: "neutral",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: string }) {
  const t = useT();
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? "neutral"}>
      {t(ROLE_LABELS[role] ?? role)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: locale,
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  locale: Locale | undefined,
): ColunaAdmin<AdminUserRow>[] {
  return [
    {
      id: "email",
      cabecalho: "Email",
      classeCelula: "font-mono text-xs",
      celula: (row) => row.email ?? "—",
    },
    {
      id: "nome",
      cabecalho: t("Nome"),
      classeCabecalho: "w-[160px]",
      classeCelula: "font-medium",
      celula: (row) => row.full_name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "tenant",
      cabecalho: "Tenant",
      classeCabecalho: "w-[160px]",
      celula: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">{row.tenant_name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.tenant_slug}
          </span>
        </div>
      ),
    },
    {
      id: "role",
      cabecalho: "Role",
      classeCabecalho: "w-[100px]",
      celula: (row) => <RoleBadge role={row.role} />,
    },
    {
      id: "ultimo-acesso",
      cabecalho: t("Último acesso"),
      classeCabecalho: "w-[160px]",
      classeCelula: "text-xs text-muted-foreground",
      celula: (row) =>
        locale ? relativeDate(row.last_sign_in_at, locale) : row.last_sign_in_at ?? "—",
    },
    {
      id: "status",
      cabecalho: t("Status"),
      classeCabecalho: "w-[100px]",
      celula: (row) =>
        row.revoked_at ? (
          <Badge variant="error">{t("Revogado")}</Badge>
        ) : (
          <Badge variant="success">{t("Ativo")}</Badge>
        ),
    },
    {
      id: "acoes",
      cabecalho: "",
      classeCabecalho: "w-[60px]",
      celula: (row) => (
        <Link
          href={`/admin/users/${row.user_id}`}
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

export function UsersTableAdminSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, undefined)} linhas={5} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UsersTableAdminProps {
  data: AdminUserRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function UsersTableAdmin({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: UsersTableAdminProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, localeDaData)}
      linhas={data}
      chave={(row) => `${row.user_id}:${row.organization_id}`}
      vazio={{
        icon: Users,
        headline: "Nenhum usuário encontrado",
        subcopy: "Ajuste os filtros para refinar a busca.",
      }}
      paginacao={{
        temProxima: hasNextPage,
        buscando: isFetchingNextPage,
        carregarMais: onLoadMore,
      }}
    />
  );
}
