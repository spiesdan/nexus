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
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const DOC = join(RAIZ, "docs", "auditoria", "PROMPT-MESTRE-AAA.md");
const HASH = join(RAIZ, "docs", "auditoria", "prompt-mestre.sha256");
const GRAVAR = process.argv.includes("--gravar");

function corpoDoPrompt(): string {
  const md = readFileSync(DOC, "utf8");
  const linhas = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("---"))
    .map((l) => l.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/\s+/g, " "));
  return linhas.join("\n") + "\n";
}

const hash = createHash("sha256").update(corpoDoPrompt(), "utf8").digest("hex");

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
console.log(`ok: prompt íntegro (${hash.slice(0, 16)}…) — ${corpoDoPrompt().split("\n").length - 1} linhas`);
