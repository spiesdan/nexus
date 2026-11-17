/**
 * DEFINIR O DOCUMENTO DE UM CONTATO — o "arrumar o cliente" em um comando.
 *
 * ─── POR QUE EXISTE ────────────────────────────────────────────────────────
 *
 * O Mercos tem o CPF/CNPJ do cliente, mas o contato do CRM pode ter sido
 * criado antes (WhatsApp/manual) e o importador **não atualiza contato que já
 * existe** — ele só grava o documento quando cria um novo. Resultado: a NF-e
 * pede CPF/CNPJ de um cliente que tem documento no Mercos.
 *
 * Este script grava o documento no contato:
 *   - CNPJ (14) → coluna `cnpj`;
 *   - CPF (11)  → `cpf_hash` + `cpf_encrypted` (RPC `encrypt_cpf`) e
 *     `source_metadata.mercos.documento`, que é o caminho que o resolvedor
 *     fiscal lê.
 *
 * Uso (na VPS, com o .env de produção):
 *   pnpm exec tsx scripts/contatos/definir-documento.ts \
 *     --contato +5547996912927 --documento 12345678901
 *   ... --seco   # mostra o que faria
 *
 * O contato pode ser achado por id (UUID), telefone (com ou sem máscara) ou
 * e-mail. Se o filtro casar mais de um, o script recusa e pede o id.
 */
import { audit } from "@/lib/audit";
import { encryptCpfSql, hashCpf, normalizeCpf } from "@/lib/contacts/cpf";
import { createAdminClient } from "@/lib/supabase/admin";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const chave = argumento("--contato")?.trim() ?? "";
  const documentoBruto = argumento("--documento")?.trim() ?? "";
  const seco = process.argv.includes("--seco");
  const documento = normalizeCpf(documentoBruto);

  if (!chave || (documento.length !== 11 && documento.length !== 14)) {
    console.error(
      "Uso: --contato <id|telefone|e-mail> --documento <CPF 11 ou CNPJ 14 dígitos> [--seco]",
    );
    process.exit(2);
  }

  const admin = createAdminClient();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let consulta = admin
    .from("contacts")
    .select(
      "id, organization_id, name, display_name, phone_number, email, email_normalized, cnpj, cpf_hash, source_metadata",
    );

  if (UUID.test(chave)) {
    consulta = consulta.eq("id", chave);
  } else if (chave.includes("@")) {
    consulta = consulta.or(`email.eq.${chave},email_normalized.eq.${chave.toLowerCase()}`);
  } else {
    const digitos = chave.replace(/\D/g, "");
    consulta = consulta.or(`phone_number.ilike.%${digitos}%,cpf_hash.eq.${hashCpf(documento)}`);
  }

  const { data: contatos, error } = await consulta.limit(5);
  if (error) {
    console.error("Falha ao ler o contato:", error.message);
    process.exit(1);
  }
  if (!contatos || contatos.length === 0) {
    console.error(`Nenhum contato encontrado para "${chave}".`);
    process.exit(1);
  }
  if (contatos.length > 1) {
    console.error(
      `O filtro "${chave}" casou ${contatos.length} contatos. Use o id (UUID) para escolher um.`,
    );
    for (const c of contatos as Array<{ id: string; name: string | null }>) {
      console.error(`  - ${c.id}  ${c.name ?? ""}`);
    }
    process.exit(1);
  }

  const contato = contatos[0] as {
    id: string;
    organization_id: string;
    name: string | null;
    display_name: string | null;
    cnpj: string | null;
    cpf_hash: string | null;
    source_metadata: Record<string, unknown> | null;
  };

  const tipo = documento.length === 14 ? "CNPJ" : "CPF";
  const mercosAtual =
    contato.source_metadata && typeof contato.source_metadata.mercos === "object"
      ? (contato.source_metadata.mercos as Record<string, unknown>)
      : {};

  console.log(
    `${seco ? "[SECO] " : ""}Contato ${contato.display_name ?? contato.name ?? contato.id} (${contato.id})`,
  );
  console.log(`  documento atual: ${contato.cnpj ?? contato.cpf_hash ?? "—"}`);
  console.log(`  novo ${tipo}: ${documento}`);

  if (seco) {
    console.log("Nada foi gravado (--seco).");
    process.exit(0);
  }

  const patch: Record<string, unknown> = {
    source_metadata: {
      ...(contato.source_metadata ?? {}),
      mercos: { ...mercosAtual, documento },
    },
  };

  if (documento.length === 14) {
    patch.cnpj = documento;
  } else {
    patch.cpf_hash = hashCpf(documento);
    const cifrado = await encryptCpfSql(admin, documento);
    if (cifrado) patch.cpf_encrypted = cifrado;
  }

  const { error: erroUpdate } = await admin
    .from("contacts")
    .update(patch)
    .eq("id", contato.id)
    .eq("organization_id", contato.organization_id);

  if (erroUpdate) {
    console.error("Falha ao gravar o documento:", erroUpdate.message);
    process.exit(1);
  }

  await audit({
    action: "contact.document_set",
    organizationId: contato.organization_id,
    resourceType: "contacts",
    resourceId: contato.id,
    metadata: { tipo, origem: "script_definir_documento" },
  });

  console.log(`OK: ${tipo} gravado no contato. A NF-e passa a encontrar o documento.`);
}

void main();
