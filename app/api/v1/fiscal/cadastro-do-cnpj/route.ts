/**
 * GET /api/v1/fiscal/cadastro-do-cnpj?cnpj=&uf= — o cadastro público que a nota
 * exige, em uma resposta só.
 *
 * ─── POR QUE ESTA ROTA EXISTE ──────────────────────────────────────────────
 *
 * As rejeições que mais param a fila de notas são de **cadastro do
 * destinatário**: IE ausente (232), endereço incompleto (726), CNPJ divergente.
 * O dado que falta está publicado — e o operador estava redigitando à mão o que
 * a Receita e o cadastro estadual já publicam.
 *
 * O diálogo de correção chama esta rota e monta o plano de preenchimento com
 * `planejarCorrecaoAutomatica` (`lib/fiscal/correcao-automatica.ts`). Por isso a
 * resposta é o cadastro inteiro, e não só a IE: endereço, razão social e CEP
 * entram no mesmo plano.
 *
 * ─── O QUE ELA DEVOLVE, E O QUE NÃO DEVOLVE ────────────────────────────────
 *
 * `ie` é **só a da UF pedida** (`escolherIe` nunca devolve IE de outro estado,
 * porque isso trocaria a rejeição 232 por uma rejeição de divergência de UF).
 * `inscricoes` traz a lista completa para a tela poder dizer "existe IE ativa
 * em SP, e o destinatário está em RJ" — que é a diferença entre um campo que
 * não preenche e um campo que explica por quê.
 *
 * `null` em um campo significa "a fonte não publica", nunca "não existe": quem
 * aplica o plano só preenche campo vazio, e nunca apaga o que a pessoa digitou.
 *
 * Fonte fora do ar vira erro nomeado, não 500: quem está na fila precisa saber
 * se preenche à mão ou tenta de novo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { buscarCnpj, isValidCnpj, normalizarCnpj } from "@/lib/brasil/cnpj";
import { escolherIe, ufsComInscricao } from "@/lib/brasil/inscricao-estadual";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // Consultar cadastro é apoio à emissão — quem corrige nota é agent+, e é o
  // mesmo piso do PATCH de ajustes.
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const digitos = normalizarCnpj(req.nextUrl.searchParams.get("cnpj") ?? "");
  if (!digitos || !isValidCnpj(digitos)) {
    return fail("validation_failed", "CNPJ inválido — precisa de 14 dígitos.", 422, { requestId });
  }

  const uf = (req.nextUrl.searchParams.get("uf") ?? "").trim().toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) {
    return fail("validation_failed", "UF inválida — use a sigla de dois caracteres.", 422, {
      requestId,
    });
  }

  const resultado = await buscarCnpj(digitos);
  if (!resultado.ok) {
    const mensagens = {
      cnpj_invalido: "CNPJ inválido — precisa de 14 dígitos.",
      nao_encontrado: "CNPJ não encontrado no cadastro público.",
      servico_indisponivel: "Cadastro público indisponível agora — preencha à mão e tente de novo.",
    } as const;
    return fail("validation_failed", mensagens[resultado.erro], 422, { requestId });
  }

  const empresa = resultado.empresa;
  const inscricoes = empresa.inscricoes_estaduais;

  return ok(
    {
      cnpj: empresa.cnpj,
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia,
      situacao: empresa.situacao,
      logradouro: empresa.logradouro,
      numero: empresa.numero,
      bairro: empresa.bairro,
      municipio: empresa.municipio,
      uf: empresa.uf,
      cep: empresa.cep,
      uf_consultada: uf || null,
      // A IE da UF pedida — `null` quando não há IE publicada naquele estado.
      ie: escolherIe(inscricoes, uf || empresa.uf),
      ufs_com_inscricao: ufsComInscricao(inscricoes),
      inscricoes,
      fonte: "publica.cnpj.ws",
    },
    { requestId },
  );
}
