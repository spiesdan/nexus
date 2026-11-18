import type { TrilhaDeCor } from "./tipos";

/**
 * As oito trilhas de cor de pessoa da Agenda.
 *
 * Os valores moram no `globals.css` (`--agenda-pessoa-1..8`), em três blocos de
 * tema, e NÃO são repetidos aqui — este módulo só sabe *apontar* para eles. Hex
 * em componente seria um segundo lugar para a mesma verdade, e o tema escuro
 * ficaria de fora.
 *
 * O nome existe porque cor não pode ser a única informação: ele vai para o
 * `title`/`aria-label` de quem só enxerga a bolinha, e para a legenda.
 */
export const TRILHAS: ReadonlyArray<{ trilha: TrilhaDeCor; nome: string }> = [
  { trilha: 1, nome: "Telha" },
  { trilha: 2, nome: "Âmbar" },
  { trilha: 3, nome: "Oliva" },
  { trilha: 4, nome: "Turquesa" },
  { trilha: 5, nome: "Azul" },
  { trilha: 6, nome: "Índigo" },
  { trilha: 7, nome: "Violeta" },
  { trilha: 8, nome: "Framboesa" },
];

/** A variável CSS da trilha — use sempre isto, nunca um hex. */
export function corDaTrilha(trilha: TrilhaDeCor): string {
  return `var(--agenda-pessoa-${trilha})`;
}

/**
 * A FRENTE da trilha — a cor do texto que se pinta EM CIMA dela (as iniciais do
 * avatar).
 *
 * Existe porque "cor de pessoa" passou a incluir trilhas escuras no tema claro
 * (telha, oliva, violeta) e uma só frente não serve: Carbon sobre a telha dava
 * 3,2:1, abaixo do piso AA. Branco ou Carbon é escolhido por trilha e por tema,
 * medido em `tests/unit/trilhas-da-agenda-se-separam.test.ts` — nenhum par fica
 * abaixo de 4,5:1.
 *
 * Como `corDaTrilha`, devolve a VARIÁVEL, nunca o hex: o valor mora no CSS e o
 * tema decide qual vale naquele ponto da árvore.
 */
export function frenteDaTrilha(trilha: TrilhaDeCor): string {
  return `var(--agenda-pessoa-${trilha}-fg)`;
}

/**
 * Fundo do bloco, derivado da própria cor da trilha em vez de declarado à parte.
 *
 * `color-mix` sobre `--color-surface` (e não sobre `transparent`) porque o bloco
 * pousa em superfícies diferentes conforme a visão, e misturar com o fundo real
 * mantém o contraste do texto previsível nos dois temas.
 */
export function fundoDaTrilha(trilha: TrilhaDeCor, porcento = 12): string {
  return `color-mix(in oklab, ${corDaTrilha(trilha)} ${porcento}%, var(--color-surface))`;
}

/**
 * A inicial que acompanha a cor.
 *
 * Duas letras quando há sobrenome ("Ana Prado" → "AP"), porque numa equipe de
 * clínica "A" sozinho repete rápido. `Intl` não entra aqui: `toUpperCase` em
 * pt-br não tem caso especial que justifique.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * A trilha de quem ainda não escolheu uma vive em `lib/agenda/tipos.ts`
 * (`corPadraoDoMembro`), e NÃO aqui.
 *
 * Esta função derivava da POSIÇÃO na lista de membros. A do Arquiteto deriva do
 * `user_id`, e a diferença é concreta: a minha fazia todo mundo trocar de cor
 * quando alguém entrava na equipe — justamente o que a estabilidade existe para
 * impedir, porque a pessoa aprende "o Jade é a Ana".
 *
 * Apagada em favor da dele. Este módulo continua dono de traduzir trilha em COR
 * (`corDaTrilha`), que é o lado da tela.
 */
