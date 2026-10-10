import type { CapacitorConfig } from "@capacitor/cli";

/**
 * O SHELL NATIVO — `tech.billhigiene.crm`.
 *
 * ─── O que este arquivo decide ──────────────────────────────────────────────
 *
 * `webDir: mobile/www` é o shell estático empacotado (home offline, captura,
 * fila). Ele abre SEM internet, sempre.
 *
 * O sistema completo NÃO está empacotado: ele mora em
 * `https://crm.billhigiene.tech` e o shell navega até lá quando há sinal. Por
 * quê? Porque empacotar o Next inteiro exigiria export estático — e export
 * estático mata Server Actions, rotas de API e tudo que faz o sistema ser o
 * sistema. O shell é pequeno e offline; o sistema é completo e online; o
 * SQLite é a ponte entre os dois.
 */
const config: CapacitorConfig = {
  appId: "tech.billhigiene.crm",
  appName: "Bill Higiene",
  webDir: "mobile/www",
  backgroundColor: "#0f172a",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
  },
};

export default config;
