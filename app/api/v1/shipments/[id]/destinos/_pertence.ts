/**
 * O DESTINO É DESTA CARGA? — uma pergunta, três rotas.
 *
 * Três rotas de destino (`.../confirmar`, `.../reverter` e `.../entrada/confirmar`)
 * faziam a mesma checagem de pertencimento com `.maybeSingle()` sobre
 * `shipment_orders`. Esse é o operador errado, e o erro é silencioso: em 0308 um
 * destino passou a ser UM por ENDEREÇO, não por pedido — então dois pedidos ao
 * mesmo endereço são uma parada só, com DUAS linhas em `shipment_orders`. O
 * PostgREST devolve erro de cardinalidade, a rota conclui "não pertence a esta
 * carga" e responde 422 para um destino que pertence.
 *
 * O sintoma medido na jornada da entrada do endereço (15/11/2026): o motorista
 * toca "é aqui — estamos na entrada" numa parada com dois pedidos e recebe
 * "Destino não pertence a esta carga". Ninguém entende, porque a parada está na
 * tela dele.
 *
 * A pergunta certa é de EXISTÊNCIA, e existência não tem cardinalidade: basta
 * uma linha. Daí `limit(1)` e a checagem do tamanho da lista — nunca
 * `maybeSingle()`, que transforma "tem mais de um" em "não tem nenhum".
 */
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * O destino está ligado a pelo menos um pedido desta carga, da organização
 * informada? `false` cobre os dois casos que a rota precisa recusar: destino de
 * outra carga e destino de outra organização (o filtro de `organization_id`
 * também impede que um id adivinhado vaze existência entre tenants).
 */
export async function destinoPertenceACarga(
  supabase: Supabase,
  opcoes: { orgId: string; shipmentId: string; destinationId: string },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shipment_orders")
    .select("id")
    .eq("destination_id", opcoes.destinationId)
    .eq("shipment_id", opcoes.shipmentId)
    .eq("organization_id", opcoes.orgId)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}
