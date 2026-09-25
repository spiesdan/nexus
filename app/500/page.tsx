import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

/**
 * `/500` — irmã de `/403` e `/503`, e faltava.
 *
 * `lib/auth/public-paths.ts` já isenta esta rota de auth desde sempre: o
 * sistema contava com a página. Sem ela, quem caísse aqui (proxy, link de
 * runbook, redirect de borda) via "página não encontrada" — a mensagem errada
 * sobre o que aconteceu.
 *
 * Distinta de `app/error.tsx`, que trata exceção em runtime dentro do React.
 * Esta é a página estática, alcançável por URL.
 */
export default async function InternalErrorPage() {
  return <StatusPage variante="erro-interno" idioma={await idiomaDaPagina()} />;
}
