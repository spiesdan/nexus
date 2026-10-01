/**
 * CategoryExpansionService (§5 do prompt) — a categoria comercial escolhida
 * vira os termos de descoberta. O usuário vê "Restaurantes"; o motor pode
 * varrer termos relacionados da mesma família comercial sem mostrar a
 * complexidade.
 *
 * A varredura multiplica chamadas pagas (1 termo = 1 chamada por célula) e o
 * §6 é CRÍTICO: custo pesa mais que expansão, por isso é opt-in
 * (`PROSPECCAO_EXPANSAO=true`) até a FASE 13 ligar o budget guard no caminho.
 * Default off = comportamento exatamente igual ao de antes (1:1).
 */
import { CATEGORIAS_COMERCIAIS } from "@/lib/prospeccao/categorias";

export interface TermoDescoberta {
  /** Rótulo comercial exibido ao usuário (nunca vai à API). */
  rotulo: string;
  /** O que de fato vai na chamada ao provider. */
  termo: string;
}

export function expansaoLigada(): boolean {
  return process.env.PROSPECCAO_EXPANSAO === "true";
}

function familiaDe(categoria: string): { rotulo: string; busca: string }[] {
  const alvo = categoria.trim().toLowerCase();
  for (const macro of CATEGORIAS_COMERCIAIS) {
    const achou = macro.subcategorias.find(
      (s) => s.rotulo.toLowerCase() === alvo || s.busca.toLowerCase() === alvo,
    );
    if (achou) return macro.subcategorias.map((s) => ({ rotulo: s.rotulo, busca: s.busca }));
  }
  return [];
}

/**
 * Termos a varrer para `categoria`, na ordem: a própria primeiro (é a que o
 * usuário pediu), depois os irmãos da família. Categoria fora da biblioteca
 * expande só para si mesma — nunca lança, nunca inventa termo.
 */
export function termosDeDescoberta(
  categoria: string,
  ligada = expansaoLigada(),
): TermoDescoberta[] {
  const propria = categoria.trim();
  const base: TermoDescoberta = { rotulo: propria, termo: propria };
  if (!ligada) return [base];
  const familia = familiaDe(categoria);
  if (familia.length === 0) return [base];
  const chave = propria.toLowerCase();
  const primeira = familia.filter(
    (s) => s.rotulo.toLowerCase() === chave || s.busca.toLowerCase() === chave,
  );
  const resto = familia.filter(
    (s) => s.rotulo.toLowerCase() !== chave && s.busca.toLowerCase() !== chave,
  );
  return [...primeira, ...resto].map((s) => ({ rotulo: s.rotulo, termo: s.busca }));
}
