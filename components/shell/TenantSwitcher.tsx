"use client";
import { useTransition } from "react";
import { CaretDown, Check } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useUser, useActiveOrg } from "@/hooks/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="gap-2"
          data-testid="tenant-switcher"
          aria-label={t("Trocar de empresa")}
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent"
          >
            {[...(active?.name ?? "?")][0]?.toUpperCase()}
          </span>
          {/* O nome só a partir de `sm`: no mobile ele empurrava a busca e o
              bloco de ações para fora da largura de 390px. A inicial continua
              dizendo qual empresa está ativa, e o menu aberto mostra o nome
              inteiro. */}
          <span className="hidden max-w-[160px] truncate sm:inline">{active?.name ?? "Selecionar org"}</span>
          <CaretDown size={12} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px] p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t("Trocar de empresa")}
        </p>
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent"
              >
                {inicial}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{org.organization_name}</span>
              {ativa && <Check size={14} aria-hidden className="shrink-0 text-accent" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
