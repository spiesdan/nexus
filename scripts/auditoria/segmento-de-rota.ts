/**
 * O QUE É "A TELA" PARA EFEITO DE INVENTÁRIO.
 *
 * Um `page.tsx` quase nunca é a tela: ele resolve sessão/organização, busca
 * dados no servidor e delega o desenho para `_client.tsx`, `_components/` ou
 * `_pills.tsx` na MESMA pasta. Ler só o `page.tsx` mede o andaime, não o
 * produto.
 *
 * O erro foi medido em 16/11/2026 no `docs/auditoria/09-telas-estados.md`: a
 * matriz saiu com **156 linhas e 1.872 células "—"** e `error.tsx = ✓` em todas
 * as 156. Duas causas mecânicas, nenhuma delas "o produto não tem estado":
 *
 *   1. o texto vinha só do `page.tsx`; 89 das 156 telas delegam a UI para um
 *      arquivo local, então filtros, tabela, modal e formulário existiam e não
 *      apareciam — `/app/pedidos` tem `filtros` e `tabela` no `_client.tsx` e
 *      saiu "—" nas duas colunas;
 *   2. `loading.tsx`/`error.tsx` eram procurados no segmento **ou em `app/`**:
 *      como existe um `app/error.tsx` global, todas as 156 linhas ganharam ✓
 *      pelo mesmo arquivo, e a coluna dizia "esta tela trata erro" quando dizia
 *      "o app tem um fallback".
 *
 * ─── A REGRA ─────────────────────────────────────────────────────────────────
 * O segmento de uma tela é: todos os `.ts/.tsx` da pasta da `page.tsx`, mais os
 * de subpastas que NÃO tenham `page.tsx` próprio. Subpasta com `page.tsx` é
 * OUTRA tela (`pedidos/[id]`, `pedidos/novo`), e misturá-la atribuiria à lista
 * o formulário da tela de criação.
 *
 * Um teste vigia esta regra com o caso real: `tests/unit/matriz-telas-le-segmento.test.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const IGNORAR = new Set([
  "node_modules",
  ".next",
  ".git",
  "graphify-out",
  "evidence",
  "loop",
  "out",
]);

const ehFonte = (nome: string): boolean =>
  /\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && !/\.d\.ts$/.test(nome);

/**
 * Arquivos que compõem a tela: `page.tsx` + irmãos + subpastas que não são
 * outra rota. Nunca entra em `[id]`, `novo`, `imprimir` — essas têm `page.tsx`.
 */
export function arquivosDoSegmento(raiz: string, pasta: string): string[] {
  const achados: string[] = [];
  const visitar = (dirAbs: string, ehRaiz: boolean): void => {
    let itens: string[];
    try {
      itens = readdirSync(dirAbs);
    } catch {
      return;
    }
    // Subpasta com page.tsx é outra tela; a raiz sempre entra, mesmo sendo
    // ela própria uma tela.
    if (!ehRaiz && existsSync(join(dirAbs, "page.tsx"))) return;
    for (const item of itens) {
      if (IGNORAR.has(item)) continue;
      const completo = join(dirAbs, item);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(completo);
      } catch {
        continue;
      }
      if (st.isDirectory()) visitar(completo, false);
      else if (ehFonte(item)) achados.push(completo);
    }
  };
  visitar(join(raiz, pasta), true);
  return achados.sort();
}

/**
 * De onde vem o `loading.tsx`/`error.tsx` que a tela realmente usa:
 *   próprio  — está nesta pasta de rota;
 *   herdado  — está num segmento ancestral (inclusive o `app/` global);
 *   —        — não existe em lugar nenhum acima.
 * "herdado" não é defeito: é o fallback do Next. O que era defeito era chamar
 * de "✓ desta tela" o arquivo global único.
 */
export function origemDoEstado(
  raiz: string,
  pasta: string,
  nome: "loading.tsx" | "error.tsx",
): "próprio" | "herdado" | "—" {
  if (existsSync(join(raiz, pasta, nome))) return "próprio";
  let atual = pasta;
  while (atual.includes("/")) {
    atual = dirname(atual);
    if (existsSync(join(raiz, atual, nome))) return "herdado";
    if (atual === "app") break;
  }
  return "—";
}

/** `page.tsx` que só redireciona não desenha nada; não é tela com estados. */
export function ehResolver(textoDaPagina: string): boolean {
  return /redirect\(/.test(textoDaPagina) && !/return\s*\(?\s*</.test(textoDaPagina);
}

/**
 * Remove comentários antes de procurar sinal.
 *
 * Medido em 16/11: com os comentários dentro, `vazio` marcava 137/156 e `erro`
 * 140/156 — não porque toda tela trata os dois, mas porque este repositório
 * escreve parágrafos de justificativa citando "erro", "vazio", "nenhum". O
 * comentário explicando por que a tela NÃO tem estado virava prova de que ela
 * tem. Preserva strings e JSX: "Nenhum pedido encontrado" é sinal real.
 */
export function semComentarios(texto: string): string {
  let saida = "";
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    const d = texto[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && texto[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(texto[i] === "*" && texto[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const aspa = c;
      saida += c;
      i++;
      while (i < n) {
        if (texto[i] === "\\") {
          saida += texto[i]!;
          if (i + 1 < n) saida += texto[i + 1]!;
          i += 2;
          continue;
        }
        saida += texto[i];
        if (texto[i] === aspa) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    saida += c;
    i++;
  }
  return saida;
}

const ESPECIFICADOR = /(?:from\s+|import\(\s*)["']([.@][^"']+)["']/g;

function resolverImport(raiz: string, deArquivo: string, spec: string): string | null {
  // `@/x` é o alias do tsconfig para a raiz do projeto — nunca `../..`, que
  // acerta só quando o arquivo está na profundidade em que o autor pensava.
  const base = spec.startsWith("@/") ? join(raiz, spec.slice(2)) : join(dirname(deArquivo), spec);
  for (const cand of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    try {
      if (existsSync(cand) && statSync(cand).isFile()) return cand;
    } catch {
      /* caminho inválido: ignora */
    }
  }
  return null;
}

const MAX_ARQUIVOS = 80;
const MAX_PROFUNDIDADE = 5;

/**
 * A tela INTEIRA: segmento + os componentes locais que ele importa.
 *
 * `/app/radar/risco` é `return <RiscoDoRadar/>`, e `RiscoDoRadar` mora em
 * `../_components/secoes/Risco`. Sem seguir o import, a tela aparecia sem
 * NENHUM estado — quando o estado está a um `import` de distância. Seguir só
 * especificadores RELATIVOS que resolvem dentro de `app/` mantém a medida
 * atribuível: `@/components/...` é compartilhado entre telas e, se seguisse,
 * marcaria "tabela" em toda tela que usa o mesmo componente base.
 *
 * Devolve `truncado` quando bate no teto — teto silencioso vira número errado.
 */
export function arquivosDaTela(
  raiz: string,
  pasta: string,
): { arquivos: string[]; truncado: boolean } {
  const raizApp = join(raiz, "app");
  const vistos = new Set<string>(arquivosDoSegmento(raiz, pasta));
  const fila: Array<{ arquivo: string; profundidade: number }> = [...vistos].map((a) => ({
    arquivo: a,
    profundidade: 0,
  }));
  let truncado = false;

  while (fila.length > 0) {
    const { arquivo, profundidade } = fila.shift()!;
    if (profundidade >= MAX_PROFUNDIDADE) continue;
    const texto = readFileSync(arquivo, "utf8");
    ESPECIFICADOR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ESPECIFICADOR.exec(texto)) !== null) {
      const spec = m[1]!;
      const alvo = resolverImport(raiz, arquivo, spec);
      if (!alvo || vistos.has(alvo)) continue;
      if (vistos.size >= MAX_ARQUIVOS) {
        truncado = true;
        break;
      }
      const ehAlias = spec.startsWith("@/");
      // Import relativo só vale dentro de `app/` (é a tela). Alias `@/` pode
      // apontar para `components/`, `lib/` — e aí entra UM salto, sem recursão:
      // o formulário aparece, mas o botão base que ele usa não contamina as
      // outras telas com sinais que não são delas.
      if (!ehAlias && !alvo.startsWith(raizApp)) continue;
      vistos.add(alvo);
      fila.push({
        arquivo: alvo,
        profundidade: ehAlias ? MAX_PROFUNDIDADE : profundidade + 1,
      });
    }
  }

  return { arquivos: [...vistos].sort(), truncado };
}
