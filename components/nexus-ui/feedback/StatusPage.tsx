import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * A página de status canônica — as SIX rotas `403`/`404`/`500`/`503`/
 * `account-suspended`/`admin/forbidden` eram o mesmo clone com strings trocadas
 * (inventário §2.2: "6 clones → 1 StatusPage"). O catálogo de cópia mora AQUI,
 * lado a lado, para mudança de palavra acontecer num arquivo só; cada rota
 * vira invólucro de filesystem (o Next exige o caminho) + idioma.
 *
 * Fora da árvore de `app/app/layout.tsx` — sem `IdiomaProvider`, por isso o
 * idioma chega resolvido (`idiomaDaPagina()`), nunca por hook.
 *
 * `suporte` existe por causa da P0 de white-label: em `conta-suspensa`, o
 * endereço de contato é o do OPERADOR (`SUPPORT_EMAIL`), e sem ele o parágrafo
 * troca por um que não nomeia endereço nenhum — o endereço do produto voltaria
 * a vazar para cliente de revendedor.
 */

export type VarianteStatus =
  | "sem-permissao"
  | "nao-encontrada"
  | "erro-interno"
  | "manutencao"
  | "conta-suspensa"
  | "acesso-negado-admin";

type BotaoDeStatus = {
  href: string;
  rotulo: string;
  variante: "outline" | "default";
};

type DefinicaoDeStatus = {
  titulo: string;
  descricao: (idioma: Idioma, suporte: string | null) => ReactNode;
  botoes: BotaoDeStatus[];
  /** Só quando a variante difere do padrão — o resto herda. */
  card?: string;
  tituloClasse?: string;
  descricaoClasse?: string;
  acoesClasse?: string;
};

const PADRAO = {
  card: "hover-raise w-full max-w-md p-8 text-center",
  tituloClasse: "text-2xl font-semibold",
  descricaoClasse: "mt-2 text-sm text-muted-foreground",
  acoesClasse: "mt-6 flex justify-center gap-2",
} as const;

const CATALOGO: Record<VarianteStatus, DefinicaoDeStatus> = {
  "sem-permissao": {
    titulo: "403 — Sem permissão",
    descricao: (i) => traduzir("Você não tem acesso a essa área.", i),
    botoes: [
      { href: "/", rotulo: "Voltar", variante: "outline" },
      { href: "/app/inbox", rotulo: "Voltar pra Inbox", variante: "default" },
    ],
  },
  "nao-encontrada": {
    titulo: "404 — Página não encontrada",
    descricao: (i) => traduzir("Verifique o link ou volte pra inbox.", i),
    botoes: [
      { href: "/", rotulo: "Voltar", variante: "outline" },
      { href: "/app/inbox", rotulo: "Voltar pra Inbox", variante: "default" },
    ],
  },
  "erro-interno": {
    titulo: "500 — Erro interno",
    descricao: (i) =>
      traduzir(
        "Algo quebrou do nosso lado. Já registramos o ocorrido; tente de novo em instantes.",
        i,
      ),
    botoes: [{ href: "/", rotulo: "Voltar", variante: "default" }],
  },
  "manutencao": {
    titulo: "503 — Em manutenção",
    descricao: (i) => traduzir("Voltamos em alguns minutos.", i),
    botoes: [{ href: "/", rotulo: "Voltar", variante: "default" }],
  },
  "conta-suspensa": {
    titulo: "Conta suspensa",
    descricao: (i, suporte) =>
      suporte ? (
        <>
          {traduzir("Sua conta está suspensa. Entre em contato com", i)}{" "}
          <a
            href={`mailto:${suporte}`}
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {suporte}
          </a>{" "}
          {traduzir("para mais informações.", i)}
        </>
      ) : (
        traduzir(
          "Sua conta está suspensa. Fale com quem administra este sistema para saber o motivo e como reativá-la.",
          i,
        )
      ),
    botoes: [{ href: "/login", rotulo: "Sair", variante: "outline" }],
    card: `${PADRAO.card} space-y-4`,
    descricaoClasse: "text-sm text-muted-foreground",
    acoesClasse: "pt-2",
  },
  "acesso-negado-admin": {
    titulo: "Acesso negado",
    descricao: (i) =>
      traduzir(
        "Esta área é restrita a administradores da plataforma com MFA ativo. Se você acredita que isso é um erro, contate o time de operações.",
        i,
      ),
    botoes: [
      { href: "/", rotulo: "Início", variante: "outline" },
      { href: "/app", rotulo: "Voltar para /app", variante: "default" },
    ],
    card: "hover-raise w-full max-w-lg p-8 text-center",
    tituloClasse: "text-2xl font-medium text-text",
    descricaoClasse: "mt-3 text-sm text-muted-foreground",
  },
};

export function StatusPage({
  variante,
  idioma,
  suporte = null,
}: {
  variante: VarianteStatus;
  idioma: Idioma;
  /** Só a variante `conta-suspensa` usa: operador via `SUPPORT_EMAIL`. */
  suporte?: string | null;
}) {
  const def = CATALOGO[variante];
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className={def.card ?? PADRAO.card}>
        <h1 className={def.tituloClasse ?? PADRAO.tituloClasse}>
          {traduzir(def.titulo, idioma)}
        </h1>
        <p className={def.descricaoClasse ?? PADRAO.descricaoClasse}>
          {def.descricao(idioma, suporte)}
        </p>
        <div className={def.acoesClasse ?? PADRAO.acoesClasse}>
          {def.botoes.map((botao) => (
            <Button
              key={botao.href + botao.rotulo}
              asChild
              variant={botao.variante === "outline" ? "outline" : "default"}
            >
              <Link href={botao.href}>{traduzir(botao.rotulo, idioma)}</Link>
            </Button>
          ))}
        </div>
      </Card>
    </main>
  );
}
