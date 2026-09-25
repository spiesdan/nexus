"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";

/**
 * O status do tenant — as MESMAS paleta e rótulos duplicados antes em
 * `TenantsTable` e `tenants/[id]/layout.tsx` (inventário §3: "cópias de
 * STATUS_VARIANTS → variantes de ui/badge"). As variantes continuam sendo as
 * semânticas do `ui/badge` (success/info/warning/error/neutral); o que se
 * consolidou é o MAPA domínio→variante, num arquivo só.
 *
 * `onboardedAt` é opcional de propósito: `active` sem onboarding concluído vira
 * `onboarding`, mas só quem TEM o campo deriva — quem chama sem a prop mostra o
 * status crú (é o caso do cabeçalho do detalhe, que não pergunta onboarding).
 */
export const ORG_STATUS_VARIANTS: Record<
  string,
  "success" | "info" | "warning" | "error" | "neutral"
> = {
  active: "success",
  onboarding: "info",
  suspended: "warning",
  redacted: "error",
};

export const ORG_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  onboarding: "Onboarding",
  suspended: "Suspenso",
  redacted: "Redigido",
};

export function TenantStatusBadge({
  status,
  onboardedAt,
}: {
  status: string;
  /** `undefined` = não derive (mostra o status crú). `null` = sem onboarding. */
  onboardedAt?: string | null;
}) {
  const t = useT();
  // 'onboarding' não existe no banco — é derivado: ativo sem onboarding concluído.
  const efetivo =
    onboardedAt !== undefined && status === "active" && !onboardedAt ? "onboarding" : status;
  return (
    <Badge variant={ORG_STATUS_VARIANTS[efetivo] ?? "neutral"}>
      {t(ORG_STATUS_LABELS[efetivo] ?? efetivo)}
    </Badge>
  );
}
