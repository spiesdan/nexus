import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { Stepper } from "./_components/Stepper";
import { OutrasOrganizacoes } from "./_components/OutrasOrganizacoes";
import { SkipToEnd } from "./_components/SkipToEnd";
import { branding } from "@/lib/branding";
import { passosVisiveis } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { tituloDaRota } from "@/lib/navigation/titulos";

/**
 * Título da aba no wizard. O rótulo de cada passo vem de `lib/onboarding/passos.ts`
 * — a MESMA definição que alimenta o indicador de progresso e o roteador. Três
 * listas de passos já divergiram neste repo; uma quarta, só para o `<title>`,
 * seria a primeira a envelhecer.
 */
export async function generateMetadata(): Promise<Metadata> {
  const caminho = (await headers()).get("x-pathname") ?? "";
  const titulo = tituloDaRota(caminho);
  return titulo ? { title: titulo } : {};
}

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const { state, onboardedAt } = await loadOnboardingState(activeOrg.orgId);
  if (onboardedAt) redirect("/app/inbox");

  // Os passos que ESTA instalação oferece, com o que já foi resolvido. O
  // indicador não decide mais nada sozinho — ele desenha o que recebe.
  const passos = passosVisiveis({ lojaLigada: env.NUVEMSHOP_ENABLED }).map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo,
    cumprido: p.cumprido(state),
  }));

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <IdiomaProvider locale={user.locale}>
      <div className="flex min-h-screen flex-col bg-muted/40">
        <header className="border-b bg-background">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{branding().name}</p>
              <h1 className="text-lg font-medium text-text tracking-tight">{activeOrg.name}</h1>
            </div>
            <div className="flex items-center gap-1">
              {/*
                A SAÍDA, para quem tem outra organização. Ver o cabeçalho de
                `OutrasOrganizacoes`: sem ela, trocar de organização pelo seletor
                do topo levava a um wizard sem porta de volta — o layout de `/app`
                sai da árvore e leva o `TenantSwitcher` junto.
              */}
              <OutrasOrganizacoes
                outras={user.organizations
                  .filter((o) => o.organization_id !== activeOrg.orgId)
                  .map((o) => ({ id: o.organization_id, nome: o.organization_name }))}
              />
              {isDev ? <SkipToEnd /> : null}
            </div>
          </div>
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <Stepper passos={passos} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </div>
    </IdiomaProvider>
  );
}
