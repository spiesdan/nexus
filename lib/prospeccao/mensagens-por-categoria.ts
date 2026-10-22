/**
 * AS MENSAGENS QUE UMA CAMPANHA HERDA DA CATEGORIA.
 *
 * A configuração guarda um padrão por categoria (até três variações). Quando a
 * campanha escolhe várias categorias, pode haver mais de um padrão disponível —
 * então a escolha precisa ser EXPLÍCITA na tela, não um "pega o primeiro que
 * vier do banco". Um padrão de restaurante mandado para oficina mecânica é
 * pior que nenhum padrão: o operador não percebe, porque o texto chega
 * preenchido.
 *
 * A função é pura de propósito: a mesma ordem que a tela mostra é a que o teste
 * verifica, sem banco.
 */

export interface PresetDeMensagens {
  categoria: string;
  mensagens: string[];
}

/**
 * Os padrões que servem à seleção atual, na MESMA ordem das categorias
 * escolhidas — a primeira da tela é a primeira da lista.
 *
 * Categoria sem padrão (ou com `mensagens` vazio) não aparece: oferecer "usar
 * as mensagens de X" com três caixas em branco é pior que não oferecer.
 */
export function presetsDaSelecao(
  presets: readonly PresetDeMensagens[],
  categoriasSelecionadas: readonly string[],
): PresetDeMensagens[] {
  const porCategoria = new Map(presets.map((p) => [p.categoria, p]));
  const vistos = new Set<string>();
  const resultado: PresetDeMensagens[] = [];

  for (const categoria of categoriasSelecionadas) {
    if (vistos.has(categoria)) continue;
    vistos.add(categoria);
    const preset = porCategoria.get(categoria);
    if (!preset) continue;
    const mensagens = preset.mensagens.map((m) => m.trim()).filter((m) => m !== "");
    if (mensagens.length === 0) continue;
    resultado.push({ categoria, mensagens });
  }

  return resultado;
}

/** O padrão que a tela deve sugerir primeiro: o da primeira categoria escolhida. */
export function presetSugerido(
  presets: readonly PresetDeMensagens[],
  categoriasSelecionadas: readonly string[],
): PresetDeMensagens | null {
  return presetsDaSelecao(presets, categoriasSelecionadas)[0] ?? null;
}
