import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A PROSPECÇÃO MUDOU DE PORTA — esta rota é o endereço antigo.
 *
 * Desde a tela Campanha, a prospecção é a SEGUNDA SUBTELA de `/app/campanhas`
 * (`?subtela=prospeccao`). O redirecionamento preserva a query inteira: o
 * `?aba=campanhas`/`?aba=empresas` que os links salvos, o wizard e os testes
 * usam continua chegando na aba certa. Sem isso, todo link antigo cairia na
 * subtela Campanha e a pessoa acharia que a prospecção sumiu.
 */
export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (Array.isArray(valor)) {
      for (const item of valor) query.append(chave, item);
    } else if (valor !== undefined) {
      query.set(chave, valor);
    }
  }
  query.set("subtela", "prospeccao");
  redirect(`/app/campanhas?${query.toString()}`);
}
