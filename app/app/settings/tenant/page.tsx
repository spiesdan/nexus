import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { TenantForm } from "./_form";

export const dynamic = "force-dynamic";

interface OrgRow {
  display_name: string;
  legal_name: string;
  cnpj: string | null;
  phone: string | null;
  logradouro: string | null;
  numero_end: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  timezone: string;
  locale: string;
  media_retention_days: number;
  dpo_email: string | null;
  privacy_policy_url: string | null;
  settings: Record<string, unknown> | null;
}

export default async function TenantSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select(
      "display_name, legal_name, cnpj, phone, logradouro, numero_end, complemento, bairro, cidade, uf, cep, timezone, locale, media_retention_days, dpo_email, privacy_policy_url, settings",
    )
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const row = (data ?? null) as OrgRow | null;
  const lostReasonsExtra = (
    row?.settings &&
    Array.isArray((row.settings as { lost_reasons_extra?: unknown }).lost_reasons_extra)
      ? ((row.settings as { lost_reasons_extra?: string[] }).lost_reasons_extra ?? [])
      : []
  ) as string[];
  const idioma = user.idioma;

  return (
    <PaginaDeConfiguracao
      titulo={traduzir("Organização", idioma)}
      // "Admin only." era inglês no meio de uma frase em português. A frase
      // agora diz a mesma coisa no idioma da tela — e "só administradores
      // editam" é fato do gate acima, não promessa.
      descricao={traduzir(
        "Dados da empresa, retenção de mídia e DPO. Só administradores editam.",
        idioma,
      )}
    >
      {row && (
        <TenantForm
          initial={{
            display_name: row.display_name,
            legal_name: row.legal_name,
            cnpj: row.cnpj,
            phone: row.phone,
            logradouro: row.logradouro,
            numero_end: row.numero_end,
            complemento: row.complemento,
            bairro: row.bairro,
            cidade: row.cidade,
            uf: row.uf,
            cep: row.cep,
            timezone: row.timezone,
            // Produto em pt-BR apenas: linha antiga com outro idioma cai no
            // padrão em vez de quebrar a tela ou reprovar a validação.
            locale: "pt-BR",
            media_retention_days: row.media_retention_days,
            dpo_email: row.dpo_email,
            privacy_policy_url: row.privacy_policy_url,
            lost_reasons_extra: lostReasonsExtra,
          }}
        />
      )}
    </PaginaDeConfiguracao>
  );
}
