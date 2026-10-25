/**
 * MODELO POR CATEGORIA — a leitura e o lookup do bind que a campanha guarda.
 *
 * ═══ POR QUE ESTE MÓDULO EXISTE ═════════════════════════════════════════════
 *
 * A 0284 deu à campanha UM modelo (`template_name`/`template_language`). Uma
 * campanha que cobre oficina, posto e restaurante precisa de um modelo por
 * categoria — o texto que serve para oficina não serve para restaurante.
 *
 * A coluna `templates_por_categoria` é jsonb e chega do banco como `unknown`.
 * A tela, a rota e o motor precisam da MESMA leitura: normalizar aqui evita
 * que cada um invente a sua e que um valor torto derrube o tick inteiro.
 *
 * ─── A REGRA DE OURO ────────────────────────────────────────────────────────
 *
 * `categoria` é a chave canônica da campanha (o `busca` da biblioteca), não o
 * rótulo traduzido. O motor casa essa chave com a categoria efetiva da empresa
 * (categoria-efetiva.ts) e usa `templateDaCategoria` para achar o bind.
 *
 * Array vazio significa "campanha antiga / bind único": o motor cai no campo
 * legado. Um item incompleto é DESCARTADO na leitura — não vira um bind pela
 * metade que faria a Meta recusar com 132000 depois de aceitar o POST.
 */
import { semAcento } from "@/lib/prospeccao/categoria-pt";

export interface TemplateDaCategoria {
  /** A chave canônica da categoria na campanha (`busca`). */
  categoria: string;
  /** Nome exato do modelo aprovado no canal. */
  name: string;
  /** `pt` e `pt_BR` são modelos DISTINTOS. */
  language: string;
  /** Hash do contrato visto quando os valores foram preenchidos. */
  contract_hash: string;
  /** Valor por slot (`slotKey` composto de build-components.ts). */
  values: Record<string, string>;
}

/**
 * A chave de comparação.
 *
 * `semAcento` é a mesma régua usada no recorte de categoria: "óptica" e
 * "optica" são a mesma categoria comercial. `toLowerCase` cobre instalações
 * antigas que gravaram o rótulo com maiúscula; o universo é curto e não há
 * colisão real entre categorias que só difiram por caixa.
 */
export function chaveDaCategoria(categoria: string): string {
  return semAcento(categoria).trim().toLowerCase();
}

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function valoresValidos(bruto: unknown): Record<string, string> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor === "string") saida[chave] = valor.slice(0, 4000);
  }
  return saida;
}

/**
 * Lê o jsonb como lista de binds válidos.
 *
 * Duplicata de categoria: a PRIMEIRA vence. É a ordem em que a tela mostrou e
 * a ordem em que o operador configurou; escolher a última faria um PATCH
 * acidental (append) trocar o modelo que já estava valendo.
 */
export function lerTemplatesPorCategoria(bruto: unknown): TemplateDaCategoria[] {
  if (!Array.isArray(bruto)) return [];
  const saida: TemplateDaCategoria[] = [];
  const vistas = new Set<string>();

  for (const item of bruto) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const campo = item as Record<string, unknown>;
    const categoria = texto(campo.categoria, 80);
    const name = texto(campo.name, 512);
    const language = texto(campo.language, 16);
    const contractHash = texto(campo.contract_hash, 128);
    if (!categoria || !name || !language || !contractHash) continue;

    const chave = chaveDaCategoria(categoria);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push({
      categoria,
      name,
      language,
      contract_hash: contractHash,
      values: valoresValidos(campo.values),
    });
  }

  return saida;
}

/** O bind da categoria, ou `null` quando ela não tem modelo configurado. */
export function templateDaCategoria(
  binds: readonly TemplateDaCategoria[],
  categoria: string,
): TemplateDaCategoria | null {
  const alvo = chaveDaCategoria(categoria);
  if (!alvo) return null;
  return binds.find((b) => chaveDaCategoria(b.categoria) === alvo) ?? null;
}

/**
 * As categorias do recorte que NÃO têm modelo.
 *
 * É a checagem de cobertura da borda: uma campanha com mapeamento por categoria
 * só pode ser ativada se todas as categorias escolhidas apontarem para um
 * modelo. O motor não faz fallback silencioso para o modelo de outra categoria.
 */
export function categoriasSemModelo(
  binds: readonly TemplateDaCategoria[],
  categorias: readonly string[],
): string[] {
  // O curinga histórico "empresas" (lista escolhida à mão) não é uma categoria
  // comercial e usa o bind legado de propósito — mas ele não pode ESCONDER uma
  // categoria real ao lado dele: o que sobra é conferido normalmente.
  const uteis = categorias
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => semAcento(c) !== "empresas");
  if (uteis.length === 0) return [];
  return uteis.filter((c) => templateDaCategoria(binds, c) === null);
}

/** Formato enxuto para a tela: mostra qual modelo cada categoria usa. */
export function resumoDosTemplatesPorCategoria(
  binds: readonly TemplateDaCategoria[],
): Array<{ categoria: string; name: string; language: string }> {
  return binds.map((b) => ({ categoria: b.categoria, name: b.name, language: b.language }));
}
