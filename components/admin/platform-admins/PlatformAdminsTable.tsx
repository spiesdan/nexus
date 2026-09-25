"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "@/lib/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlatformAdminEntry } from "@/hooks/useAdminPlatformAdmins";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string, locale: Locale): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: locale });
  } catch {
    return iso;
  }
}

function shortEmail(email: string | null): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shortDomain = domain.split(".")[0];
  return `${local}@${shortDomain}`;
}

// ---------------------------------------------------------------------------
// Reason cell with tooltip for long text
// ---------------------------------------------------------------------------

function ReasonCell({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-muted-foreground">—</span>;
  const MAX = 40;
  if (reason.length <= MAX) {
    return <span className="text-xs">{reason}</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help truncate text-xs underline decoration-dotted">
            {reason.slice(0, MAX)}…
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs break-words">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  locale: Locale | undefined,
): ColunaAdmin<PlatformAdminEntry>[] {
  return [
    {
      id: "usuario",
      cabecalho: t("Usuário"),
      classeCabecalho: "min-w-[200px]",
      celula: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {row.user_email ?? (
              <span className="font-mono text-xs text-muted-foreground">
                {row.user_id.slice(0, 8)}
              </span>
            )}
          </span>
          {row.user_name && (
            <span className="text-xs text-muted-foreground">{row.user_name}</span>
          )}
        </div>
      ),
    },
    {
      id: "concedido-em",
      cabecalho: t("Concedido em"),
      classeCabecalho: "w-[140px]",
      classeCelula: "text-xs text-muted-foreground whitespace-nowrap",
      celula: (row) => (locale ? relativeDate(row.granted_at, locale) : row.granted_at),
    },
    {
      id: "concedido-por",
      cabecalho: t("Concedido por"),
      classeCabecalho: "w-[160px]",
      classeCelula: "text-xs text-muted-foreground",
      celula: (row) => shortEmail(row.granted_by_email),
    },
    {
      id: "scope",
      cabecalho: "Scope",
      classeCabecalho: "w-[120px]",
      celula: (row) => (
        <Badge variant="outline" className="text-[10px] font-mono">
          {row.scope ?? "platform"}
        </Badge>
      ),
    },
    {
      id: "mfa",
      cabecalho: "MFA",
      classeCabecalho: "w-[60px]",
      celula: (row) =>
        row.mfa_required ? (
          <Badge variant="default" className="text-[10px]">
            {t("Sim")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            {t("Não")}
          </Badge>
        ),
    },
    {
      id: "status",
      cabecalho: t("Status"),
      classeCabecalho: "w-[90px]",
      celula: (row) =>
        row.revoked_at ? (
          <Badge variant="destructive" className="text-[10px]">
            {t("Revogado")}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-green-500 text-[10px] text-green-700"
          >
            {t("Ativo")}
          </Badge>
        ),
    },
    {
      id: "motivo",
      cabecalho: t("Motivo"),
      classeCelula: "max-w-[200px]",
      celula: (row) => <ReasonCell reason={row.reason} />,
    },
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function PlatformAdminsTableSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, undefined)} linhas={4} />;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface PlatformAdminsTableProps {
  data: PlatformAdminEntry[];
}

export function PlatformAdminsTable({ data }: PlatformAdminsTableProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, localeDaData)}
      linhas={data}
      chave={(row) => row.id}
      vazio={{
        icon: ShieldCheck,
        headline: "Nenhum platform admin encontrado",
        subcopy: "Platform admins são configurados exclusivamente via DBA.",
      }}
      classeLinha={(row) => (row.revoked_at ? "opacity-60" : undefined)}
    />
  );
}
