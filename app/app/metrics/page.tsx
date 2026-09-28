import { redirect } from "next/navigation";

/**
 * Rota antiga, mantida como REDIRECIONAMENTO — o Desempenho virou seção do
 * Indicadores (fusão §100): o conteúdo vive em `#desempenho`, com o mesmo
 * filtro por atendente, funil, performance e o painel de atrito.
 *
 * Não é gordura: é o que impede que o link do ⌘K, os favoritos e as sondas
 * de atrito (`tests/sonda-atrito-*.ts`, já apontando para a âncora) virem um
 * 404 depois da mudança. Apagar a rota economizaria um arquivo e cobraria
 * isso do usuário.
 */
export default function Page(): never {
  redirect("/app/indicadores#desempenho");
}
