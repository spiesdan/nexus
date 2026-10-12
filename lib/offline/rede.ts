/**
 * TEM SINAL?
 *
 * Duas fontes, e as duas são necessárias: `navigator.onLine` mente quando o
 * Wi-Fi conecta sem internet (portal de hotel, roteador sem link), e o
 * `Network.getStatus()` do Capacitor diz `connected` para o mesmo caso. A
 * resposta honesta vem do servidor — mas perguntar ao servidor a cada toque é
 * bateria. Então: rápido e aproximado para a UI, confirmado no sync (que trata
 * timeout como "sem sinal" de qualquer jeito).
 */
export async function temSinal(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const { Network } = await import("@capacitor/network");
    const s = await Network.getStatus();
    return s.connected;
  } catch {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }
}

/** Assina mudanças de conectividade. Devolve a função de cancelar. */
export async function aoMudarDeRede(fn: (online: boolean) => void): Promise<() => void> {
  const voltarOnline = () => fn(true);
  const voltarOffline = () => fn(false);
  window.addEventListener("online", voltarOnline);
  window.addEventListener("offline", voltarOffline);
  try {
    const { Network } = await import("@capacitor/network");
    const h = await Network.addListener("networkStatusChange", (s) => fn(s.connected));
    return () => {
      window.removeEventListener("online", voltarOnline);
      window.removeEventListener("offline", voltarOffline);
      void h.remove();
    };
  } catch {
    return () => {
      window.removeEventListener("online", voltarOnline);
      window.removeEventListener("offline", voltarOffline);
    };
  }
}
