import { redirect } from "next/navigation";

import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { MfaForm } from "@/components/auth/MfaForm";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export const metadata = { title: "Verificação em duas etapas" };

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasVerified = !!factorsData?.totp?.some((f) => f.status === "verified");
  // Sem fator verificado não há desafio a fazer — e o destino tem de respeitar
  // o `?next=` que a pessoa estava seguindo. Antes, todo mundo caía no Inbox:
  // quem clicou num link de pedido/relatório perdia o destino e não sabia por quê.
  if (!hasVerified) redirect(safeNext(next, "/app"));

  const idioma = normalizarIdioma(
    (user.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-medium tracking-tight text-text">{t("Verificação em duas etapas")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Digite o código de 6 dígitos do seu autenticador.")}
        </p>
      </div>
      <MfaForm next={next} />
    </div>
  );
}
