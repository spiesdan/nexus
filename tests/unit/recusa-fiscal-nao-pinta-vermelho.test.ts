/**
 * "NÃO ESTÁ CONFIGURADO" não pode pintar a tela de vermelho.
 *
 * O que aconteceu na instalação real, em 08/10/2026: com `Nota fiscal ›
 * Importar`, o console mostrava
 *
 *   /api/v1/invoices/importar-sefaz:1  502
 *
 * e a resposta vinha com o motivo certo — "Provedor fiscal é o stub: nada é
 * transmitido à SEFAZ". A rota estava certa; o que estava errado era o TOM, e
 * é o tom que a pessoa vê: um `toast.error` vermelho para uma instalação que
 * simplesmente não transmite, que é o estado dela.
 *
 * ─── Por que o código é separado, e não só o tom ─────────────────────────────
 *
 * `upstream_unavailable` cobre DUAS coisas que precisam de tons opostos:
 *
 *   1. falta configuração (provedor `stub`, sem sidecar) — esperado, âmbar;
 *   2. a SEFAZ ou o sidecar caiu DE VERDADE — é isso que o operador precisa ver,
 *      vermelho.
 *
 * Numa entrada só, alguém escolheria um tom para as duas. Quem escolhe errado
 * aprende a ignorar vermelho — que é exatamente o que o `ApiErrorToast` já
 * registra na seção da agenda. Por isso o código nasce separado.
 *
 * ─── Por que o teste olha o TOM, e não o HTTP ────────────────────────────────
 *
 * O status continua 502 nas duas situações, e mudar o status aqui seria mudar
 * contrato de API por causa de cor de tela. O que este teste trava é a decisão
 * que a pessoa realmente sofre: vermelho ou não.
 */
import { describe, expect, it } from "vitest";

import { COPY } from "@/components/feedback/ApiErrorToast";
import { ApiErrorCodes } from "@/lib/api/errors";

describe("recusa de configuração fiscal", () => {
  it("o código existe e é aceito pelo registro de erros", () => {
    expect(Object.values(ApiErrorCodes)).toContain("fiscal_nao_configurado");
  });

  it("é âmbar, não vermelho — é estado da instalação, não queda de serviço", () => {
    const entrada = COPY.fiscal_nao_configurado;
    expect(entrada, "sem entrada no COPY, o toast volta ao vermelho padrão").toBeDefined();
    expect(entrada!.variant).toBe("warning");
    expect(entrada!.variant).not.toBe("error");
  });

  it("não traz `msg`: o texto da rota é quem sabe o que falta", () => {
    // `toastFor` faz `entry.msg ?? err.message`, e a descrição leva só o
    // requestId. Uma `msg` aqui TROCARIA "Provedor fiscal é o stub: configure o
    // sidecar" por uma frase genérica, e o operador perderia o motivo.
    expect(COPY.fiscal_nao_configurado?.msg).toBeUndefined();
  });

  it("a SEFAZ caindo de verdade continua sendo `upstream_unavailable` — vermelho", () => {
    // O outro lado da distinção: se alguém trocar os dois, a queda real vira
    // âmbar e o operador perde o sinal que o المنتج está fora do ar.
    expect(Object.values(ApiErrorCodes)).toContain("upstream_unavailable");
    // Sem entrada no COPY, `upstream_unavailable` cai em `toast.error` — que é
    // o desejado para uma dependência que caiu.
    expect(COPY.upstream_unavailable).toBeUndefined();
  });
});
