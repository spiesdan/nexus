"use client";

import { useRadarDados } from "../../_dados";
import { NovosProspects } from "../NovosProspects";

/**
 * A PROSPECÇÃO — quem podemos vender hoje, antes do primeiro pedido.
 *
 * FASE 11 (§30): o Radar responde com os melhores prospects da base, com as
 * mesmas três ações da aba Empresas. O componente é o de sempre; o que mudou
 * é ter uma tela só para ele.
 */
export function ProspeccaoDoRadar() {
  const { podeOperar, usuarioId } = useRadarDados();
  return <NovosProspects podeOperar={podeOperar} usuarioId={usuarioId} />;
}
