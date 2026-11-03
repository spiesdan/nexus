import { redirect } from "next/navigation";

/**
 * Rota antiga, mantida como REDIRECIONAMENTO — a recuperação é uma tela do
 * Radar (fusão §100) e ganhou endereço próprio em `/app/radar/recuperacao`
 * quando o Radar deixou de ser uma landing.
 *
 * Não é gordura: é o que impede que o alerta antigo do Dashboard, o ⌘K e o
 * briefing de indicadores (links já versionados) virem um 404 depois da
 * mudança. Apagar a rota economizaria um arquivo e cobraria isso do usuário.
 */
export default function Page(): never {
  redirect("/app/radar/recuperacao");
}
