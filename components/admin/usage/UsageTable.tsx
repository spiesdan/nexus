"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartBar } from "@/lib/ui/icons";
import type { UsageTenantRow } from "@/app/api/v1/admin/usage/route";
import type { UsageRange } from "@/hooks/useAdminUsage";
import { formatCentsUSD } from "@/lib/money";
import { useT } from "@/hooks/i18n/useT";
import { AdminDataTable, type ColunaAdmin } from "@/components/admin/AdminDataTable";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

// DÓLAR: o número é `llm_calls.cost_cents`, e `pricing.ts` cota o provedor em USD.
const fmtUSD = formatCentsUSD;

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCSV(tenants: UsageTenantRow[], range: UsageRange): void {
  const headers = [
    "organization_id",
    "tenant",
    "slug",
    "mensagens",
    "conversas",
    "invocacoes_ai",
    "tokens",
    "custo_reais",
  ];

  const rows = tenants.map((t) => [
    t.organization_id,
    `"${t.tenant_name.replace(/"/g, '""')}"`,
    t.tenant_slug,
    t.messages_count,
    t.conversations_count,
    t.ai_invocations_count,
    t.ai_tokens_total,
    (t.ai_cost_cents / 100).toFixed(2),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `usage-${range}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(t: (texto: string) => string): ColunaAdmin<UsageTenantRow>[] {
  return [
    {
      id: "tenant",
      cabecalho: "Tenant",
      celula: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm">{row.tenant_name}</span>
          <Badge variant="secondary" className="w-fit text-[10px] px-1.5 py-0">
            {row.tenant_slug}
          </Badge>
        </div>
      ),
    },
    {
      id: "mensagens",
      cabecalho: t("Mensagens"),
      classeCabecalho: "text-right",
      classeCelula: "text-right tabular-nums text-sm",
      celula: (row) => fmtNum(row.messages_count),
    },
    {
      id: "conversas",
      cabecalho: t("Conversas"),
      classeCabecalho: "text-right",
      classeCelula: "text-right tabular-nums text-sm",
      celula: (row) => fmtNum(row.conversations_count),
    },
    {
      id: "invocacoes",
      cabecalho: t("Invoc. AI"),
      classeCabecalho: "text-right",
      classeCelula: "text-right tabular-nums text-sm",
      celula: (row) => fmtNum(row.ai_invocations_count),
    },
    {
      id: "tokens",
      cabecalho: "Tokens",
      classeCabecalho: "text-right",
      classeCelula: "text-right tabular-nums text-sm",
      celula: (row) => fmtNum(row.ai_tokens_total),
    },
    {
      id: "custo",
      cabecalho: t("Custo AI"),
      classeCabecalho: "text-right",
      classeCelula: "text-right tabular-nums text-sm font-medium",
      celula: (row) => fmtUSD(row.ai_cost_cents),
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface UsageTableProps {
  tenants: UsageTenantRow[];
  range: UsageRange;
}

export function UsageTable({ tenants, range }: UsageTableProps) {
  const t = useT();
  const colunas = colunasAdmin(t);
  const vazio = {
    icon: ChartBar,
    headline: "Nenhum tenant encontrado",
    subcopy: "Não há dados de uso no período selecionado.",
  };

  // Vazio SEM a barra de cima — o original devolvia só o EmptyState, e a
  // toolbar (título + Exportar CSV) não existia para quem não tinha dado.
  if (tenants.length === 0) {
    return <AdminDataTable colunas={colunas} linhas={[]} chave={(r) => r.organization_id} vazio={vazio} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("Uso por tenant")}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCSV(tenants, range)}
          className="gap-1.5 text-xs"
        >
          {t("Exportar CSV")}
        </Button>
      </div>

      <AdminDataTable
        colunas={colunas}
        linhas={tenants}
        chave={(row) => row.organization_id}
        vazio={vazio}
      />
    </div>
  );
}
