import { requireAuth, isMfaEnrolled, resolveActiveOrg, requiresMfa } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaExigeMfa } from "@/lib/auth/politica-mfa";
import { SecurityClient } from "./_client";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * SEGURANÇA — e, desde esta rodada, o lugar ONDE a verificação em duas etapas
 * se liga e se desliga.
 *
 * A tela existia e não fazia nem uma coisa nem outra: dizia "Ativado/Não
 * ativado" e, quando não ativado, mandava "Faça login novamente para iniciar o
 * enrolamento" — porque o ÚNICO ponto de cadastro do produto era o bloqueador de
 * tela cheia que aparecia sozinho para todo admin. Com o cadastro virando
 * opcional, essa tela passaria a ser um beco: sem um botão aqui, a verificação
 * ficaria inalcançável para quem quisesse usá-la.
 */
export default async function SecurityPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);

  // As TRÊS leituras saem juntas. As duas primeiras já vêm em CACHE da mesma
  // request: `app/app/layout.tsx` chama `isMfaEnrolled()` e `requiresMfa()`
  // antes de montar a página, e o `React.cache` de `lib/auth/server.ts` faz
  // aqui reusar a MESMA promessa — sem isso, esta tela pagava 2 idas a mais ao
  // GoTrue/Supabase (~251ms + 182–225ms, medido 2026-09-30) para repetir
  // perguntas que o layout acabou de fazer.
  //
  // A da direita é a query de settings da org — o `empresaExige` exibido ao
  // lado do `obrigatorio`; ela é a única ida real quando o cache acerta.
  const [enrolled, respOrg, obrigatorio] = await Promise.all([
    isMfaEnrolled(),
    org
      ? createAdminClient()
          .from("organizations")
          .select("settings")
          .eq("id", org.orgId)
          .maybeSingle()
      : null,
    // A mesma função que o layout usa para decidir o bloqueio — a tela não pode
    // ter uma segunda noção de "é obrigatório", ou ofereceria desligar o que o
    // layout volta a exigir no próximo carregamento.
    requiresMfa(org?.role, user.is_platform_admin, user.id, org?.orgId),
  ]);

  let empresaExige = false;
  if (respOrg) {
    empresaExige = empresaExigeMfa(respOrg.data?.settings);
  }
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-text">{traduzir("Segurança", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "A verificação em duas etapas da sua conta, os códigos de recuperação e as sessões abertas.",
            idioma,
          )}
        </p>
      </header>

      <SecurityClient
        mfaEnrolled={enrolled}
        obrigatorio={obrigatorio}
        podeExigirDaEquipe={org?.role === "admin"}
        empresaExige={empresaExige}
      />
    </div>
  );
}
