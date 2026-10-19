/**
 * A CHAVE DO DIA CIVIL (`AAAA-MM-DD`) de um instante, no fuso da organização.
 *
 * ─── O defeito que este arquivo existe para tornar impossível ──────────────
 *
 * A tela de pedidos agrupa os cartões por dia ("Hoje", "Ontem", terça-feira…)
 * e a chave saía de `getFullYear()/getMonth()/getDate()`, que leem o fuso do
 * RUNTIME. No servidor (contêiner em UTC) o dia é UTC; no navegador do operador
 * (UTC−3) é o dia local. Um pedido criado às 01:00Z caía em dias diferentes nos
 * dois lados, a hidratação discordava do HTML e o React acusava o erro #418
 * ("text content does not match"). Não era borda: eram as três horas de todo
 * dia em que os dois lados discordam — qualquer pedido criado entre 21h e meia-
 * noite (horário de Brasília) aparecia no grupo errado.
 *
 * A chave é calculada em CAMPOS NUMÉRICOS (`partesNoFuso`), então não depende
 * do ICU do runtime — a mesma razão que fez `lib/tempo/agora.ts` abandonar
 * `weekday: "long"` para montar rótulo.
 */
import { partesNoFuso } from "@/lib/agenda/fuso";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/**
 * `2026-10-19` do instante no fuso pedido.
 *
 * Fuso ausente, vazio ou inválido cai em {@link FUSO_PADRAO} em vez de lançar:
 * isto roda na renderização de uma tela, e um `RangeError` de `Intl` aqui é
 * página branca.
 *
 * Instante INVÁLIDO (data ausente, `null` virando `new Date(null)`, string
 * torta vinda do banco) devolve string VAZIA — e não uma data inventada: quem
 * chama trata vazio como "sem dia", e `formatToParts` num `Invalid Date` lança
 * `RangeError: Invalid time value`, que derruba a tela inteira. Medido: era o
 * que acontecia com um pedido sem `created_at` na lista de pedidos.
 */
export function chaveDoDia(instante: Date, fuso?: string | null): string {
  if (!(instante instanceof Date) || Number.isNaN(instante.getTime())) return "";
  const emVigor = fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO;
  const p = partesNoFuso(instante, emVigor);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}
