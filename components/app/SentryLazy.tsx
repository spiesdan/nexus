"use client";

/**
 * Carrega o Sentry DEPOIS da hidratação.
 *
 * É um componente sem DOM no layout raiz. O `import()` só acontece no efeito,
 * então o SDK não entra no first load de nenhuma rota. Enquanto ele não chega,
 * `instrumentation-client.ts` guarda os erros na fila; aqui a fila é entregue
 * logo depois do `init` e os listeners temporários são desligados.
 */
import * as React from "react";

import { desinstalarCapturaPendente, filaDeErros } from "@/lib/sentry/fila";

export function SentryLazy(): null {
  React.useEffect(() => {
    let vivo = true;

    void import("@/lib/sentry/cliente")
      .then((modulo) => {
        if (!vivo) return;
        modulo.iniciarSentryCliente();
        desinstalarCapturaPendente();
        for (const valor of filaDeErros.splice(0)) {
          modulo.capturarErroPendente(valor);
        }
      })
      .catch(() => {
        // Sem o chunk, a aplicação segue; não há para onde mandar o erro.
        desinstalarCapturaPendente();
        filaDeErros.length = 0;
      });

    return () => {
      vivo = false;
    };
  }, []);

  return null;
}
