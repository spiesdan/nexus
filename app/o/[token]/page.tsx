import type { Metadata } from "next";

import { carregarOrcamentoPublico } from "@/lib/comercial/orcamento-publico";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { Idioma } from "@/lib/i18n/idiomas";
import { formatCentsBRL } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUSO_PADRAO } from "@/lib/tempo/fusos";

import { BotaoAprovar } from "./_aprovar";

/**
 * A PÁGINA QUE O CLIENTE ABRE NO CELULAR.
 *
 * Sem sessão, sem cookie: a única credencial é o token na URL. Por isso ela é
 * servida pelo cliente ADMIN (service role) — e por isso TODA query do loader
 * sai da carga assinada (pedido + organização), nunca de um id solto.
 *
 * `force-dynamic` de propósito: orçamento é dado vivo. Um cache de página
 * pública mostraria preço velho para o próximo cliente que abrir o link.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orçamento",
  robots: { index: false, follow: false },
};

function dataCurta(iso: string, idioma: Idioma): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(tagDeIdioma(idioma), { timeZone: FUSO_PADRAO });
}

export default async function OrcamentoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  const orcamento = await carregarOrcamentoPublico(admin, token);

  if (!orcamento) {
    return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Link inválido ou vencido</h1>
        <p className="text-sm text-muted-foreground">
          Peça um novo link para quem enviou o orçamento. Links antigos param de funcionar por
          segurança.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {orcamento.organizacao}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Orçamento #{orcamento.numero}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orcamento.clienteNome} · {dataCurta(orcamento.criadoEm, orcamento.idioma)} ·{" "}
          {orcamento.rotuloDoStatus}
        </p>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <ul className="divide-y">
          {orcamento.itens.map((item, i) => (
            <li key={`${item.nome}-${i}`} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantidade} × {formatCentsBRL(item.precoUnitCents)}
                  {item.descontoPct > 0 ? ` · ${item.descontoPct}% off` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm tabular-nums">{formatCentsBRL(item.subtotalCents)}</p>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatCentsBRL(orcamento.subtotalCents)}</dd>
          </div>
          {orcamento.descontoCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="tabular-nums">− {formatCentsBRL(orcamento.descontoCents)}</dd>
            </div>
          ) : null}
          {orcamento.freteCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Frete</dt>
              <dd className="tabular-nums">{formatCentsBRL(orcamento.freteCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCentsBRL(orcamento.totalCents)}</dd>
          </div>
        </dl>

        {orcamento.condicaoPagamento ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Condição de pagamento: {orcamento.condicaoPagamento}
          </p>
        ) : null}
        {orcamento.observacoes ? (
          <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
            {orcamento.observacoes}
          </p>
        ) : null}
      </section>

      <div className="mt-6">
        <BotaoAprovar
          token={token}
          podeAprovar={orcamento.podeAprovar}
          jaAprovado={orcamento.jaAprovado}
          espera={orcamento.espera}
        />
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        Ao aprovar, você confirma os itens, os valores e a condição de pagamento acima.
      </p>
    </main>
  );
}
