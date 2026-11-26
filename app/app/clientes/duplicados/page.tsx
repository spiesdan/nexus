import { DuplicadosClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * A FILA DE DUPLICADOS QUE EXIGE UM HUMANO.
 *
 * Não há Server Component buscando os dados: a tela é de trabalho contínuo
 * (fundir um grupo muda o próximo), e a fonte única é o GET
 * `/api/v1/contacts/duplicados`, que o cliente revalida após cada decisão.
 * O cabeçalho mostra o número real da API — nunca uma constante de release.
 */
export default function ClientesDuplicadosPage() {
  return <DuplicadosClient />;
}
