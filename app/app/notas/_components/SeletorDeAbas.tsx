"use client";

import { useRouter } from "next/navigation";

/**
 * O MENU SUSPENSO DAS ABAS DE NOTAS (telas estreitas).
 *
 * Sete abas numa faixa rolável é o mesmo problema das treze do módulo fiscal:
 * quem abre no celular vê três e não descobre as outras. Aqui elas viram um
 * seletor com a aba atual como rótulo.
 *
 * A troca navega pela URL (`?aba=`): a `Tabs` da página é NÃO-controlada e
 * remonta pelo `key={abaInicial}`. Manter a URL como fonte é o que faz o
 * botão voltar do navegador funcionar e o link direto continuar valendo.
 */
export function SeletorDeAbas({
  abas,
  atual,
  rotulos,
  ariaLabel,
}: {
  abas: readonly string[];
  atual: string;
  rotulos: Record<string, string>;
  ariaLabel: string;
}) {
  const router = useRouter();
  return (
    <div className="md:hidden">
      <label className="sr-only" htmlFor="abas-notas-mobile">
        {ariaLabel}
      </label>
      <select
        id="abas-notas-mobile"
        value={atual}
        onChange={(e) => router.push(`/app/notas?aba=${encodeURIComponent(e.target.value)}`)}
        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
      >
        {abas.map((a) => (
          <option key={a} value={a}>
            {rotulos[a] ?? a}
          </option>
        ))}
      </select>
    </div>
  );
}
