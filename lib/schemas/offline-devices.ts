/**
 * Schemas da credencial de dispositivo offline (0322).
 *
 * O corpo é `snake_case` como o resto da API. `scopes` NÃO é campo de entrada:
 * o escopo é fechado no servidor (`offline:pedidos:write`,
 * `offline:catalogo:read`) e um corpo não pode alargá-lo — credencial de
 * celular pedindo `mcp:*` seria escalada por campo opcional.
 */
import { z } from "zod";

export const createOfflineDeviceSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao aparelho.").max(100),
  /**
   * A pessoa a quem o aparelho pertence. Default: quem está criando.
   *
   * É ela que assina o pedido no sync (`created_by`/`vendedor_user_id`), então
   * precisa ser o vendedor real — não o admin que gerou o código. A rota
   * confere que é membro ativo da organização com papel que captura.
   */
  user_id: z.string().uuid().optional(),
  expires_in_days: z.coerce.number().int().min(1).max(365).default(90),
});

export type CreateOfflineDeviceInput = z.infer<typeof createOfflineDeviceSchema>;
