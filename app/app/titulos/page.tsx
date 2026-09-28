import { redirect } from "next/navigation";

// Títulos virou aba do Financeiro (S100 4e). Mantemos este redirect para não
// quebrar links antigos (busca global, Indicadores, favoritos) — o termo da
// busca segue na query para a aba nascer filtrada.
export default async function TitulosRedirect({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  const { busca } = await searchParams;
  redirect(`/app/financeiro?aba=titulos${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`);
}
