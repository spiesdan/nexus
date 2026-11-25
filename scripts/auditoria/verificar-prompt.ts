/**
 * INTEGRIDADE DO PROMPT MESTRE — detecta qualquer edição no texto da lei.
 *
 * O prompt do usuário é a lei da frente de trabalho e tem autoridade sobre
 * qualquer `.md` do repo. Lei que pode ser editada em silêncio não é lei: este
 * script normaliza o conteúdo de `docs/auditoria/PROMPT-MESTRE-AAA.md` e
 * compara com o hash gravado em `docs/auditoria/prompt-mestre.sha256`.
 *
 * A normalização remove apenas o que é ESTRUTURA, não conteúdo:
 *   - marcadores de heading (`#`, `##`, ...) que existem só para navegar o doc;
 *   - `**` de negrito;
 *   - linhas vazias, `---` e espaços repetidos.
 * Ou seja: mudar uma palavra, um número, uma vírgula ou a ORDEM das seções
 * quebra o hash. Reformatar heading não quebra — e é o único caso permitido.
 *
 * O prompt de 18/11/2026 não tem mais as divisões "Parte 1/Parte 2": o arquivo
 * inteiro é o texto do usuário. A cópia `PROMPT-MESTRE-NEXUS-AAA.md` existe
 * para leitura/backup? Não: a fonte única é este arquivo; a cópia é espelho
 * byte a byte e não entra no hash. Se as duas divergirem, vale esta.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/verificar-prompt.ts            # confere
 *   pnpm exec tsx scripts/auditoria/verificar-prompt.ts --gravar   # regrava (só após revisão)
 *
 * Regravar o hash só é legítimo quando o USUÁRIO mudou o prompt. Fazer isso
 * para "consertar" uma divergência é falsificar a lei.
 *
 * ## O hash do arquivo NÃO é o hash da lei
 *
 * Medido em 25/11/2026: `sha256sum docs/auditoria/PROMPT-MESTRE-AAA.md` devolve
 * `c37217c4…`, enquanto o registro guarda `ee40a0a2…` — e o prompt estava
 * íntegro. A diferença é a normalização (headings, negrito, linhas vazias). Foi
 * assim que o backlog passou a acusar "hash inválido": medindo com a régua
 * errada. Quem quiser conferir de fora chama este script, não `sha256sum`.
 *
 * A normalização vive aqui e é EXPORTADA porque `tests/unit/prompt-mestre-integro.test.ts`
 * a usa: gate que só roda quando alguém lembra não é gate.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Documento cujo conteúdo é a lei. */
export const DOC_DO_PROMPT = join("docs", "auditoria", "PROMPT-MESTRE-AAA.md");
/** Arquivo com o hash da versão aprovada da lei. */
export const ARQUIVO_DO_HASH = join("docs", "auditoria", "prompt-mestre.sha256");

/**
 * O corpo que entra no hash: conteúdo, sem a estrutura de formatação.
 *
 * `espacos` existe para o teste provar que UMA palavra muda o hash; trocar o
 * texto por outro é a única forma honesta de simular "o usuário mudou a lei".
 */
export function normalizarPrompt(md: string): string {
  const linhas = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("---"))
    .map((l) => l.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/\s+/g, " "));
  return linhas.join("\n") + "\n";
}

/** SHA-256 do corpo normalizado do prompt lido de `raiz`. */
export function hashDoPrompt(raiz: string): string {
  const md = readFileSync(join(raiz, DOC_DO_PROMPT), "utf8");
  return createHash("sha256").update(normalizarPrompt(md), "utf8").digest("hex");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const RAIZ = process.cwd();
  const HASH = join(RAIZ, ARQUIVO_DO_HASH);
  const GRAVAR = process.argv.includes("--gravar");

  const hash = hashDoPrompt(RAIZ);

  if (GRAVAR) {
    writeFileSync(HASH, hash + "\n");
    console.log(`gravado: ${hash}`);
    process.exit(0);
  }

  const esperado = readFileSync(HASH, "utf8").trim();
  if (hash !== esperado) {
    console.error(`PROMPT ALTERADO.\n  esperado: ${esperado}\n  atual:    ${hash}`);
    console.error("Se a mudança não veio do usuário, reverta. Se veio, revise e regrave com --gravar.");
    process.exit(1);
  }
  console.log(
    `ok: prompt íntegro (${hash.slice(0, 16)}…) — ${normalizarPrompt(readFileSync(join(RAIZ, DOC_DO_PROMPT), "utf8")).split("\n").length - 1} linhas`,
  );
}
