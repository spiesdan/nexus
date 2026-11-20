"use client";
import { useTransition } from "react";
import { CaretDown, Check } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useUser, useActiveOrg } from "@/hooks/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { setActiveOrg } from "@/app/actions/shell/setActiveOrg";

/**
 * Troca de empresa (padrão account-switcher): marca com inicial, nome,
 * check na ativa. Sem papel inventado — o menu mostra identidade e estado,
 * e só.
 */
export function TenantSwitcher() {
  const t = useT();
  const user = useUser();
  const active = useActiveOrg();
  const [isPending, startTransition] = useTransition();

  if (user.organizations.length <= 1) return null;

  // O nome visível do botão é o nome da empresa ativa. `label-content-name-
  // mismatch` (axe, serious) reprova quando esse texto NÃO ABRE o nome
  // acessível — a busca do axe é `accessibleName.indexOf(visibleText) === 0`.
  // Dizer "Empresa atual: E2E Test Org..." punha a AÇÃO na frente do RÓTULO e
  // acusava a mesma violação em 82 rotas do shell. A inicial é `aria-hidden`:
  // no mobile é a única coisa vista, e começa com a mesma letra do nome.
  const nomeVisivel = active?.name ?? "Selecionar org";
  const inicial = [...nomeVisivel][0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="gap-2"
          data-testid="tenant-switcher"
          /*
           * O NOME ACESSÍVEL COMEÇA PELO QUE ESTÁ NA TELA e só depois diz o
           * estado e a ação. Nada muda no desenho do botão.
           */
          aria-label={`${nomeVisivel} · ${t("Empresa atual")}. ${t("Trocar de empresa")}`}
        >
          {/*
            A inicial é CONTEÚDO GERADO POR CSS, não um nó de texto. Axe mede o
            `textContent` como "texto visível" e, com a letra dentro do botão,
            o rótulo lido ("E2E Test Org") nunca continha o texto visto
            ("EE2E Test Org") — daí 163 violações no shell. `attr(data-inicial)`
            mantém o desenho idêntico e tira a letra do textContent.
          */}
          <span
            aria-hidden
            data-inicial={inicial}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent-ink before:content-[attr(data-inicial)]"
          />
          {/* O nome só a partir de `sm`: no mobile ele empurrava a busca e o
              bloco de ações para fora da largura de 390px. A inicial continua
              dizendo qual empresa está ativa, e o menu aberto mostra o nome
              inteiro. */}
          <span className="hidden max-w-[160px] truncate sm:inline">
            {active?.name ?? "Selecionar org"}
          </span>
          <CaretDown size={12} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px] p-1.5">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t("Trocar de empresa")}
        </DropdownMenuLabel>
        {user.organizations.map((org) => {
          const ativa = active?.orgId === org.organization_id;
          const inicial = [...(org.organization_name ?? "?")][0]?.toUpperCase();
          return (
            <DropdownMenuItem
              key={org.organization_id}
              data-testid={`tenant-switcher-item-${org.organization_id}`}
              aria-current={ativa || undefined}
              onClick={() =>
                startTransition(async () => void (await setActiveOrg(org.organization_id)))
              }
              className="flex items-center gap-2.5"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent-ink"
              >
                {inicial}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{org.organization_name}</span>
              {ativa && (
                <>
                  {/*
                    O check é `aria-hidden` e `aria-current` em `menuitem` tem
                    suporte irregular entre leitores de tela. O texto recortado
                    é o que garante que "qual está ativa" chegue — e ele é a
                    mesma informação que o ícone carrega para quem vê.
                  */}
                  <span className="sr-only">, {t("atual")}</span>
                  <Check size={14} aria-hidden className="shrink-0 text-accent-ink" />
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
