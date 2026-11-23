/**
 * O TÍTULO DE CADA TELA — resolvido de UMA fonte, não redigitado em 127 arquivos.
 *
 * ─── O PROBLEMA MEDIDO ──────────────────────────────────────────────────────
 * Em 15/11/2026, 36 de 40 páginas capturadas tinham o MESMO `<title>`: o padrão
 * do layout raiz. O produto sabe o nome de cada tela — o `<h1>` estava certo em
 * 38 das 40 — e mesmo assim toda aba do navegador se chamava igual. Com cinco
 * abas abertas, nenhuma se distingue; histórico e favoritos ficam
 * indistinguíveis; o leitor de tela anuncia o mesmo nome para telas diferentes.
 *
 * ─── POR QUE AQUI, E NÃO `export const metadata` EM CADA PÁGINA ─────────────
 * O nome de uma tela já existe em `lib/navigation/registry.ts`, e
 * `tests/unit/navegacao-completude.test.ts` REPROVA o CI quando nasce tela sem
 * porta. Escrever o título em cada `page.tsx` criaria uma segunda cópia do mesmo
 * nome, sem gate, que envelhece calada — exatamente o defeito que este repo
 * combate. Aqui a fonte é a mesma do menu; tela nova herda o nome sozinha.
 *
 * ─── O QUE ESTE MÓDULO NÃO RESOLVE ──────────────────────────────────────────
 * Páginas que já declaram `metadata` próprio continuam mandando: no Next, a
 * metadata do segmento mais profundo vence. Isto é o PADRÃO para quem não
 * declarou nada, não uma substituição.
 */

import { PASSOS } from "@/lib/onboarding/passos";
import { NAV_DESTINATIONS } from "./registry";

/**
 * Rotas que existem e NÃO são destino de navegação — mesma categoria da
 * `NAV_ALLOWLIST` de `tests/unit/navegacao-completude.test.ts`, com o nome que a
 * pessoa lê na aba. Sem esta lista, `/app/pedidos/novo` herdaria "Pedidos" por
 * prefixo: palatável, mas é a MESMA aba de outra tela.
 */
const TITULOS_FORA_DO_MENU: Record<string, string> = {
  "/app/pedidos/novo": "Novo pedido",
  "/app/pedidos/imprimir": "Imprimir pedidos",
  "/app/pedidos/colisoes-mercos": "Pedidos do Mercos que não entraram",
  "/app/ai/agents/new": "Novo agente",
  "/app/expedicao/nova": "Nova carga",
  "/app/prospeccao/nova": "Nova campanha",
  "/app/team/invite": "Convidar pessoa",
  "/app/radar/categorias": "Radar por categoria",
  "/app/radar/oportunidades": "Oportunidades",
  "/app/radar/risco": "Em risco",
  "/app/radar/prospeccao": "Prospecção",
  "/app/radar/recuperacao": "Recuperação",
  "/app/vitrine-agenda": "Vitrine da agenda",
  "/app/lgpd/requests/[id]": "Pedido LGPD",
  "/app/integrations": "Integrações",
  "/app/pipelines": "Etapas do funil",
  "/app/leads": "Leads",
  // Hub da área de IA. O nome é o do `<h1>` medido em 15/11/2026 ("Agente de
  // IA"), não o do grupo do menu: `/app/inteligencia` é OUTRA tela (o grafo) e
  // já usa "Inteligência". Duas telas com o mesmo nome foi o que a captura
  // pegou — este comentário é o registro de por que este título não é aquele.
  "/app/ai": "Agente de IA",
  "/app/settings": "Configurações",
  // `/app/prospeccao` redireciona para Campanha desde o PR #105; o título é o
  // do destino, porque é ali que a pessoa cai.
  "/app/prospeccao": "Campanha",
};

/**
 * Prefixos fora do app do tenant. Casamento por prefixo MAIS LONGO: `/admin/tenants/abc`
 * cai em "Tenant", não em "Admin".
 */
const PREFIXOS: Array<{ prefixo: string; titulo: string }> = [
  { prefixo: "/admin/tenants/", titulo: "Tenant" },
  { prefixo: "/admin/inbox/", titulo: "Conversa (suporte)" },
  { prefixo: "/admin/", titulo: "Admin Plataforma" },
  { prefixo: "/admin", titulo: "Admin Plataforma" },
  { prefixo: "/team/accept-invite/", titulo: "Aceitar convite" },
];

/** Normaliza o pathname publicado pelo `proxy.ts` (`x-pathname`). */
export function normalizarCaminho(pathname: string): string {
  const semConsulta = pathname.split("?")[0]!.split("#")[0]!;
  const semBarra = semConsulta.replace(/\/+$/, "");
  return semBarra === "" ? "/" : semBarra;
}

/**
 * O título da tela, ou `null` quando a rota não é uma tela com nome próprio
 * (a raiz `/`, que só redireciona).
 *
 * Ordem de resolução — da afirmação mais específica para a mais genérica:
 *   1. título declarado fora do menu (sub-fluxos e telas de detalhe);
 *   2. passo do onboarding (o rótulo é a peça que a pessoa está montando);
 *   3. destino de navegação EXATO;
 *   4. prefixo conhecido (admin, convite);
 *   5. destino de navegação por PREFIXO — `/app/pedidos/abc` → "Pedidos".
 *
 * O passo 5 é o que garante que tela de detalhe nunca fique sem nome: o prefixo
 * mais longo vence, então `/app/fiscal/notas/123` vira "Notas fiscais" e não
 * "Fiscal".
 */
export function tituloDaRota(pathname: string): string | null {
  const caminho = normalizarCaminho(pathname);
  if (caminho === "/") return null;

  const proprio = TITULOS_FORA_DO_MENU[caminho];
  if (proprio) return proprio;

  if (caminho === "/onboarding") return "Configuração inicial";
  if (caminho.startsWith("/onboarding/")) {
    const segmento = caminho.slice("/onboarding/".length).split("/")[0]!;
    const passo = PASSOS.find((p) => p.segmento === segmento);
    return passo ? `Configuração inicial — ${passo.rotulo}` : "Configuração inicial";
  }

  const exato = NAV_DESTINATIONS.find((d) => normalizarCaminho(d.href) === caminho);
  if (exato) return exato.label;

  let melhorPrefixo: { prefixo: string; titulo: string } | undefined;
  for (const p of PREFIXOS) {
    if ((caminho + "/").startsWith(p.prefixo)) {
      if (!melhorPrefixo || p.prefixo.length > melhorPrefixo.prefixo.length) melhorPrefixo = p;
    }
  }
  if (melhorPrefixo) return melhorPrefixo.titulo;

  let melhorDestino: { href: string; label: string } | undefined;
  const candidatos = [
    ...Object.entries(TITULOS_FORA_DO_MENU).map(([href, label]) => ({ href, label })),
    ...NAV_DESTINATIONS.map((d) => ({ href: d.href, label: d.label })),
  ];
  for (const d of candidatos) {
    const base = normalizarCaminho(d.href);
    if (base === "/app") continue; // a raiz casa com tudo por prefixo
    if (caminho.startsWith(base + "/")) {
      if (!melhorDestino || base.length > normalizarCaminho(melhorDestino.href).length) {
        melhorDestino = d;
      }
    }
  }
  return melhorDestino?.label ?? null;
}
