/**
 * DESTRAVAR CAMPANHA — tira da audiência quem JÁ foi enviado.
 *
 * ─── O CASO REAL (17/11/2026) ─────────────────────────────────────────────
 *
 * `prospecting_sends` tinha 1.002 linhas. O motor lia o ledger sem paginação, o
 * PostgREST cortava em 1.000 e as duas linhas de fora eram justamente as dos
 * prospects que o tick reescolhia. A reserva batia na unique, voltava vazia, e
 * o tick tratava como "intervalo" e repetia para sempre — campanha ativa,
 * sem erro, sem pausa, parada.
 *
 * O conserto definitivo é a paginação no motor (`lib/prospeccao/agendado.ts`).
 * Este script é a saída IMEDIATA, antes do deploy: remove da `prospect_ids` os
 * prospects que já têm comprovante (`message_id`) na campanha. Eles já
 * receberam; deixá-los na audiência só serve para travar o primeiro colocado.
 *
 * ─── SEGURANÇA ────────────────────────────────────────────────────────────
 *
 * Só remove quem tem `message_id` — reserva sem comprovante NÃO é envio, e
 * tirá-la da audiência perderia a empresa. `--seco` mostra o que faria.
 *
 * Uso (na VPS, com o .env de produção carregado):
 *   pnpm exec tsx scripts/prospeccao/destravar-campanha.ts --campanha 5304764a
 *   pnpm exec tsx scripts/prospeccao/destravar-campanha.ts --campanha 5304764a --seco
 */
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const prefixo = argumento("--campanha");
  const seco = process.argv.includes("--seco");

  if (!prefixo || prefixo.trim().length < 6) {
    console.error("Uso: --campanha <id ou prefixo com 6+ caracteres> [--seco]");
    process.exit(2);
  }

  const admin = createAdminClient();

  // `ilike` não existe para coluna uuid (o Postgres compara uuid com texto e
  // recusa). Lê as campanhas e casa o prefixo em JS — a lista é pequena.
  const { data: todasCampanhas, error } = await admin
    .from("prospecting_campaigns")
    .select("id, nome, organization_id, publico, prospect_ids, contato_ids, status")
    .limit(1000);
  const campanhas = (todasCampanhas ?? []).filter((c) =>
    String((c as { id: string }).id).startsWith(prefixo.trim()),
  );

  if (error) {
    console.error("Falha ao ler a campanha:", error.message);
    process.exit(1);
  }
  if (!campanhas || campanhas.length !== 1) {
    console.error(
      campanhas && campanhas.length > 1
        ? `O prefixo casa ${campanhas.length} campanhas — use mais caracteres do id.`
        : `Campanha não encontrada para o prefixo "${prefixo}".`,
    );
    process.exit(1);
  }

  const c = campanhas[0] as {
    id: string;
    nome: string;
    organization_id: string;
    publico: string;
    prospect_ids: string[] | null;
    contato_ids: string[] | null;
    status: string;
  };
  const publico = c.publico === "contatos" ? "contatos" : "prospects";
  const audiencia = (publico === "contatos" ? c.contato_ids : c.prospect_ids) ?? [];

  if (audiencia.length === 0) {
    console.log(`Campanha "${c.nome}" (${c.id}) está sem audiência — nada a destravar.`);
    process.exit(0);
  }

  // Só o público de prospecção tem ledger `prospecting_sends`. Recuperação
  // (`contatos`) usa outra trava; este script não mexe nela.
  if (publico !== "prospects") {
    console.error(
      `Campanha "${c.nome}" é de recuperação (contatos) — este script só destrava prospecção.`,
    );
    process.exit(1);
  }

  const { data: enviados } = await admin
    .from("prospecting_sends")
    .select("prospect_id, message_id, enviado_em")
    .eq("organization_id", c.organization_id)
    .eq("campaign_id", c.id)
    .in("prospect_id", audiencia);

  const comProva = new Set(
    ((enviados ?? []) as { prospect_id: string; message_id: string | null }[])
      .filter((e) => !!e.message_id)
      .map((e) => e.prospect_id),
  );

  const remover = audiencia.filter((id) => comProva.has(id));
  if (remover.length === 0) {
    console.log(
      `Campanha "${c.nome}": nenhum prospect da audiência tem comprovante na própria campanha. Nada a remover.`,
    );
    process.exit(0);
  }

  const restantes = audiencia.filter((id) => !remover.includes(id));
  console.log(
    `${seco ? "[SECO] " : ""}Campanha "${c.nome}" (${c.id}, ${c.status}): audiência ${audiencia.length} → ${restantes.length}; removendo ${remover.length} já enviados:`,
  );
  for (const id of remover) console.log(`  - ${id}`);

  if (seco) {
    console.log("\nNada foi gravado (--seco).");
    process.exit(0);
  }

  const { error: erroUpdate } = await admin
    .from("prospecting_campaigns")
    .update({ prospect_ids: restantes })
    .eq("id", c.id)
    .eq("organization_id", c.organization_id);

  if (erroUpdate) {
    console.error("Falha ao gravar a audiência:", erroUpdate.message);
    process.exit(1);
  }

  await audit({
    action: "prospecting_campaign.updated",
    organizationId: c.organization_id,
    resourceType: "prospecting_campaigns",
    resourceId: c.id,
    metadata: {
      destravar_campanha: true,
      removidos_ja_enviados: remover.length,
      audiencia_antes: audiencia.length,
      audiencia_depois: restantes.length,
    },
  });

  console.log(
    `\nOK: ${remover.length} prospect(s) já enviados saíram da audiência. O próximo tick segue do próximo colocado.`,
  );
}

void main();
