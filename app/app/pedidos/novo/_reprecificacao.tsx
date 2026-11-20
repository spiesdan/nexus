"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { comoMoeda } from "@/lib/format/moeda";
import type { MudancaDePreco } from "@/lib/comercial/reprecificacao";

/**
 * A CONFIRMAÇÃO LINHA A LINHA DA TROCA DE TABELA.
 *
 * Não é um "tem certeza?" genérico: mostra cada item que muda, de → para, e
 * quantas linhas ficam intocadas por terem preço manual. O usuário vê o efeito
 * antes de ele acontecer; cancelar mantém os preços atuais.
 */
export function DialogReprecificacao({
  aberto,
  mudancas,
  manuais,
  paraNome,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  mudancas: MudancaDePreco[];
  manuais: number;
  paraNome: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={aberto}>
      <DialogContent data-testid="reprecificacao" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Trocar a tabela muda estes preços")}</DialogTitle>
          <DialogDescription>
            {t("Confira linha a linha antes de aplicar")} “{paraNome}”.{" "}
            {manuais > 0
              ? `${manuais} ${t("linha(s) com preço manual serão mantidas.")}`
              : t("Nenhum preço manual será tocado.")}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
          {mudancas.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{m.nome}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-muted-foreground line-through">
                  {comoMoeda(m.deCents, "BRL")}
                </span>{" "}
                → <strong>{comoMoeda(m.paraCents, "BRL")}</strong>
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>
            {t("Manter preços atuais")}
          </Button>
          <Button onClick={onConfirmar}>{t("Aplicar nova tabela")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
