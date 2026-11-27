import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { CATEGORIAS_COMERCIAIS } from "@/lib/prospeccao/categorias";
import { googlePlacesHabilitado, resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { listaDeBuscasDaPagina } from "@/lib/prospeccao/lista-da-pagina";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { CampanhasClient } from "./_client";
import type { BuscaResumo } from "../prospeccao/_client";
import type { CapacidadePlaces } from "../prospeccao/_buscas-estado";

export const dynamic = "force-dynamic";

/**
 * A TELA CAMPANHA — a porta do menu para falar com a base.
 *
 * Subtelas: Campanha (por região, clientes cadastrados na cidade) e Prospecção
 * (a tela B2B de sempre). O menu passou a ter UMA entrada, e a prospecção virou
 * a segunda subtela — o endereço antigo `/app/prospeccao` redireciona para cá
 * preservando o `?aba=`, então link salvo e F5 continuam funcionando.
 *
 * A biblioteca de categorias e as buscas iniciais vêm do servidor; a prospecção
 * só carrega quando a subtela dela é aberta.
 */
export default async function CampanhasPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeBuscar =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const podeGerenciar =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const { data: buscas, error: erroBuscas } = await supabase
    .from("prospecting_searches")
    .select(
      "id, categorias, cidade, estado, latitude, longitude, raio_km, max_empresas, provider, status, " +
        "total_celulas, celulas_processadas, encontradas, novas, duplicadas, erros, " +
        "requisicoes, custo_estimado_cents, progresso, motivo_zero, degradada, " +
        "degradacao_motivo, parada_solicitada_em, ultimo_erro, created_at, finished_at",
    )
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Erro de query não vira lista vazia: a aba mostra o estado de erro com
  // "Tentar de novo", em vez de dizer "Nenhuma busca ainda" sem ter lido.
  const listaDaPagina = listaDeBuscasDaPagina(buscas, erroBuscas);

  /**
   * CAPACIDADE DO PLACES — a tela precisa saber ANTES do clique.
   *
   * A rota de busca só aceita Places com a flag da instalação ligada E uma
   * chave (organização ou instalação). Nenhuma rota diz isso ao cliente, então
   * o cálculo mora aqui, no único ponto que já fala com o servidor e com a
   * organização: o botão nasce desabilitado com o motivo, em vez de falhar
   * depois do clique ou sumir em silêncio.
   */
  let places: CapacidadePlaces;
  if (!googlePlacesHabilitado()) {
    places = {
      habilitado: false,
      motivo: t("Busca no Google Places desligada nesta instalação."),
      origem: null,
    };
  } else {
    try {
      const chave = await resolverChaveGoogle(createAdminClient(), activeOrg.orgId);
      places = chave.chave
        ? { habilitado: true, motivo: null, origem: chave.origem }
        : {
            habilitado: false,
            motivo: t(
              "Sem chave do Google (organização ou instalação). Configure em Configurações → Prospecção.",
            ),
            origem: "nenhuma",
          };
    } catch {
      places = {
        habilitado: false,
        motivo: t("Não foi possível confirmar a chave do Google agora."),
        origem: null,
      };
    }
  }

  return (
    <CampanhasClient
      podeOperar={podeBuscar}
      buscasIniciais={listaDaPagina.buscas as unknown as BuscaResumo[]}
      erroInicialBuscas={listaDaPagina.erro}
      categorias={CATEGORIAS_COMERCIAIS}
      podeBuscar={podeBuscar}
      podeGerenciar={podeGerenciar}
      usuarioId={user.id}
      places={places}
      textos={{
        titulo: t("Prospecção"),
        subtitulo: t("Encontre empresas por região e categoria e leve ao CRM."),
        abaBuscar: t("Encontrar empresas"),
        abaPesquisas: t("Pesquisas"),
        abaEmpresas: t("Empresas"),
        abaMercado: t("Mercado"),
        abaCampanhas: t("Campanhas"),
        abaConfig: t("Configuração"),
        onde: t("Onde você quer vender?"),
        tipoEmpresa: t("Que tipo de empresa?"),
        oQueEncontrar: t("O que você quer encontrar?"),
        cidade: t("Cidade"),
        estado: t("UF"),
        raio: t("Raio (km)"),
        maximo: t("Máximo de empresas"),
        buscar: t("Encontrar empresas"),
        buscando: t("Procurando…"),
        progresso: t("Progresso"),
        encontradas: t("Encontradas"),
        novas: t("Novas"),
        duplicadas: t("Duplicadas"),
        erros: t("Erros"),
        custo: t("Custo estimado"),
        verEmpresas: t("Ver empresas"),
        pausar: t("Pausar"),
        continuar: t("Continuar"),
        cancelar: t("Cancelar"),
        vazias: t("Nenhuma busca ainda — crie a primeira acima."),
        buscaCriada: t("Busca criada — os resultados começam a chegar em até 1 minuto"),
        reutilizada: t("Busca recente reutilizada (dentro do TTL)"),
        exemploCidade: t("Ex.: Canoinhas"),
      }}
    />
  );
}
