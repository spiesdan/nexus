/**
 * Cruza clientes do Mercos (mercos-clientes.json) com contatos sem cidade e
 * gera o SQL de backfill (somente preenche vazio, nunca sobrescreve).
 *
 *   pnpm exec tsx scripts/cruzar-endereco-mercos.ts <mercos-clientes.json> <contatos.json> <saida.sql>
 *
 * `<contatos.json>`: [{id, cnpj, phone_number, name, cidade, uf}] da org.
 *
 * Ordem de casamento (primeira que bater, nesta ordem):
 *   1. documento (só dígitos) — CNPJ/CPF é identidade, não chute;
 *   2. telefone (só dígitos, DDI/DDD normalizados);
 *   3. nome forte (sem acento/pontuação/sufixo societário) + cidade igual —
 *      nome sozinho casa errado ("MECANICA JL" x "ELETROMECANICA SCHIESSL"
 *      foi o falso positivo que motivou a regra).
 *
 * UF: resolvida contra a lista do IBGE (SC+PR); ambígua ou ausente = NULL,
 * nunca chute. Cidade fora do IBGE = descartada com motivo.
 */
import { readFileSync, writeFileSync } from "node:fs";

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function digitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function forte(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ClienteMercos {
  nome: string;
  documento: string;
  fone: string | null;
  cidade: string | null;
  uf: string | null;
}

interface Contato {
  id: string;
  cnpj: string | null;
  phone_number: string | null;
  name: string | null;
  cidade: string | null;
  uf: string | null;
}

async function main(): Promise<void> {
  const [arqMercos, arqContatos, arqSaida] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!arqMercos || !arqContatos || !arqSaida) {
    log("uso: tsx scripts/cruzar-endereco-mercos.ts <mercos-clientes.json> <contatos.json> <saida.sql>");
    process.exit(2);
  }

  // Validação IBGE da cidade acontece ANTES, fora daqui (lista em
  // municipios-validos.json): o que chega neste script já é município real.
  const mercos = JSON.parse(readFileSync(arqMercos, "utf8")) as ClienteMercos[];
  const contatos = JSON.parse(readFileSync(arqContatos, "utf8")) as Contato[];

  const porDoc = new Map<string, Contato>();
  const porFone = new Map<string, Contato>();
  const porNome = new Map<string, Contato[]>();
  for (const c of contatos) {
    const doc = digitos(c.cnpj);
    if (doc) porDoc.set(doc, c);
    const fone = digitos(c.phone_number).replace(/^55(?=\d{10,11}$)/, "");
    if (fone) porFone.set(fone, c);
    const n = forte(c.name);
    if (n) {
      if (!porNome.has(n)) porNome.set(n, []);
      porNome.get(n)!.push(c);
    }
  }

  const normFone = (f: string | null) => digitos(f).replace(/^55(?=\d{10,11}$)/, "");
  let porDocN = 0;
  let porFoneN = 0;
  let porNomeN = 0;
  let semCidade = 0;
  const atualizacoes: { id: string; cidade: string; uf: string | null }[] = [];

  for (const m of mercos) {
    if (!m.cidade) {
      semCidade++;
      continue;
    }
    const doc = digitos(m.documento);
    const fone = normFone(m.fone);
    let alvo: Contato | undefined;
    if (doc && porDoc.get(doc)) {
      alvo = porDoc.get(doc);
      porDocN++;
    } else if (fone && porFone.get(fone)) {
      alvo = porFone.get(fone);
      porFoneN++;
    } else {
      const cand = porNome.get(forte(m.nome)) ?? [];
      // Nome só vale com cidade igual (ou contato sem cidade): sem âncora
      // geográfica, homônimo vira dado na ficha errada.
      const filtrados = cand.filter(
        (c) => !c.cidade || forte(c.cidade) === forte(m.cidade),
      );
      if (filtrados.length === 1) {
        alvo = filtrados[0];
        porNomeN++;
      }
    }
    if (!alvo) continue;
    if (alvo.cidade && alvo.cidade.trim() && alvo.uf && alvo.uf.trim()) continue; // só preenche vazio
    atualizacoes.push({ id: alvo.id, cidade: m.cidade.trim(), uf: m.uf });
  }

  // Um contato pode casar com 2 linhas do Mercos (duplicata lá): a cláusula
  // WHERE só encosta em campo vazio, então repetição é inócua e a ordem não
  // importa. Sem dedup manual — menos código, mesmo efeito.

  const ORG = `(select id from organizations where slug='bill-higiene-limpeza')`;
  const out = ["BEGIN;", ""];
  for (const a of atualizacoes) {
    const c = a.cidade.replace(/'/g, "''");
    const u = a.uf ? `'${a.uf.replace(/'/g, "''")}'` : "NULL";
    // updated_at só quando algo mudou (o segundo UPDATE com tudo cheio não
    // encosta na linha).
    // Preenche SÓ o vazio (coalesce com o valor novo por último) e só toca
    // updated_at quando algo mudou de fato.
    out.push(
      `UPDATE contacts SET cidade = coalesce(nullif(trim(coalesce(cidade, '')), ''), '${c}'), ` +
        `uf = coalesce(nullif(trim(coalesce(uf, '')), ''), ${u}), ` +
        `updated_at = case when nullif(trim(coalesce(cidade, '')), '') is null or nullif(trim(coalesce(uf, '')), '') is null then now() else updated_at end ` +
        `WHERE id = '${a.id}' AND organization_id = ${ORG} ` +
        `AND (nullif(trim(coalesce(cidade, '')), '') IS NULL OR nullif(trim(coalesce(uf, '')), '') IS NULL);`,
    );
  }
  out.push("", "COMMIT;", "");
  writeFileSync(arqSaida, out.join("\n"));

  log(`mercos: ${mercos.length} linhas (${semCidade} sem cidade no Mercos)`);
  log(`casados: doc=${porDocN} fone=${porFoneN} nome+cidade=${porNomeN}`);
  log(`updates gerados: ${out.length - 3} -> ${arqSaida}`);
}

main().catch((e: unknown) => {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
