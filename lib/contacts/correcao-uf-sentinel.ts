/**
 * Autocorreção determinística da UF do contato.
 *
 * Só mexe quando o nome do município existe em UMA UF. Quando há homônimo em
 * mais de um estado (Irati, por exemplo), NÃO escolhe: abre ocorrência para
 * decisão humana. Correção que pode escolher o cliente errado é pior que
 * campo vazio. Escrita sempre com `organization_id` explícito + CAS na UF.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { municipioIbge, normalizarMunicipio, ufsPossiveisDoMunicipio } from "@/lib/fiscal/municipio-ibge";

export type DecisaoUf =
  | { pode: true; ufCorreta: string; ufAtual: string; cidade: string }
  | { pode: false; motivo: string };

export function decidirCorrecaoUf(cidade: string | null, uf: string | null): DecisaoUf {
  if (!cidade || !uf) return { pode: false, motivo: "Cidade ou UF vazia." };
  if (municipioIbge(cidade, uf)) return { pode: false, motivo: "Par cidade/UF já resolve no IBGE." };
  const ufs = ufsPossiveisDoMunicipio(cidade);
  if (ufs.length === 0) {
    return { pode: false, motivo: "Nome de município desconhecido na base do IBGE." };
  }
  if (ufs.length > 1) {
    return { pode: false, motivo: `Ambiguidade entre ${ufs.join(", ")} — decisão humana.` };
  }
  if (ufs[0] === uf.trim().toUpperCase()) {
    return { pode: false, motivo: "UF informada já é a única possível." };
  }
  return { pode: true, ufCorreta: ufs[0]!, ufAtual: uf.trim().toUpperCase(), cidade };
}

export interface ResultadoCorrecaoUf {
  corrigido: boolean;
  motivo: string;
  contactId: string;
}

export async function corrigirUfDeterministica(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  atorUserId: string | null = null,
): Promise<ResultadoCorrecaoUf> {
  const { data: contato } = await admin
    .from("contacts")
    .select("id, cidade, uf")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) return { corrigido: false, motivo: "Contato não encontrado nesta organização.", contactId };

  const decisao = decidirCorrecaoUf(contato.cidade, contato.uf);
  if (!decisao.pode) return { corrigido: false, motivo: decisao.motivo, contactId };

  const { data: atualizado, error } = await admin
    .from("contacts")
    .update({ uf: decisao.ufCorreta, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .eq("uf", decisao.ufAtual)
    .select("id")
    .maybeSingle();
  if (error || !atualizado) {
    return { corrigido: false, motivo: "CAS falhou: o cadastro mudou antes da escrita.", contactId };
  }

  await audit({
    action: "sentinel.correction_applied",
    actorUserId: atorUserId,
    organizationId,
    resourceType: "contacts",
    resourceId: contactId,
    metadata: {
      origem: "fiscal.uf_divergente_do_ibge",
      campo: "uf",
      antes: decisao.ufAtual,
      depois: decisao.ufCorreta,
      cidade: normalizarMunicipio(decisao.cidade.split(",")[0] ?? ""),
      automatico: true,
    },
  });
  return { corrigido: true, motivo: "UF corrigida para a única UF possível do município.", contactId };
}
