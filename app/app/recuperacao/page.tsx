import { redirect } from "next/navigation";

/**
 * Rota antiga, mantida como REDIRECIONAMENTO — a recuperação virou seção do
 * Radar (fusão §100): o conteúdo vive em `#radar-recuperacao`, com o mesmo
 * filtro e as mesmas ações de antes.
 *
 * Não é gordura: é o que impede que o alerta antigo do Dashboard, o ⌘K e o
 * briefing de indicadores (links já versionados) virem um 404 depois da
 * mudança. Apagar a rota economizaria um arquivo e cobraria isso do usuário.
 */
export default function Page(): never {
  redirect("/app/radar#radar-recuperacao");
}
