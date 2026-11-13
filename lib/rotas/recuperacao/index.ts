/**
 * Address Recovery Engine — exports públicos.
 *
 * Módulo de recuperação inteligente de endereços para o roteirizador.
 * Consulte `lib/rotas/recuperacao/motor.ts` para o fluxo das 5 tentativas
 * e `lib/rotas/recuperacao/confianca.ts` para o sistema de confiança.
 */

export {
  type EstadoGeo,
  type ResultadoGeo,
  geocodificarComFallback,
  geocodificarEndereco,
} from "@/lib/rotas/geocodificacao";

export {
  buscarPhoton,
  buscarPhotonPorComponentes,
  photonDisponivel,
  type CandidatoPhoton,
} from "./photon";

export {
  avaliarConfianca,
  type ContextoConfianca,
  type NivelConfianca,
  type ResultadoConfianca,
  limiares,
} from "./confianca";

export {
  normalizarTexto,
  extrairCep,
  compararCep,
  compararComponente,
  similaridadeEndereco,
  haversineM,
  type SimilaridadeResultado,
} from "./similaridade";

export {
  recuperarDestino,
  recuperarLote,
  type EstadoRecuperacao,
  type MetodoRecuperacao,
  type PartesEnderecoInformado,
  type CandidatoRecuperado,
  type ResultadoRecuperacao,
  type TentativaRegistrada,
} from "./motor";
