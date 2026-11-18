# Jornada offline no aparelho (Maestro)

Estes fluxos rodam **no emulador Android**, não no navegador. É o único lugar onde
a ponte nativa do SQLite, o `allowBackup` e a navegação entre páginas do shell
existem de verdade — e foi exatamente ali que apareceu o P0 que nenhum teste
unitário via (ver `docs/auditoria/mobile-e2e-no-aparelho.md`).

## O que precisa estar instalado

| Peça | Versão medida em 18/11/2026 |
|---|---|
| JDK (Gradle do Capacitor 8) | Temurin **21** (o `verify` usa 17, o build Android exige 21) |
| Android SDK | `platform-tools`, `emulator`, `platforms;android-36`, `system-images;android-36;google_apis;arm64-v8a` |
| Emulador | AVD `nexus` (Pixel 7, arm64) |
| Maestro | **2.12.1** (`~/.maestro/bin/maestro`) |
| APK debug | `pnpm mobile:build && pnpm exec cap sync android && (cd android && ./gradlew assembleDebug)` |

```bash
export JAVA_HOME="$HOME/android-sdk/jdk-21.0.13+9/Contents/Home"
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.maestro/bin:$PATH"

emulator -avd nexus -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect &
adb wait-for-device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

maestro test tests/e2e-mobile/jornada-offline.yaml
```

Para escrever/inspecionar fluxos com a árvore de elementos na mão: `maestro studio`.

## Pré-condição de estado (fixture)

O shell só deixa capturar com catálogo no aparelho, e baixar o catálogo exige a
instalação real. Para o teste ser determinístico e **não tocar em produção**, o
catálogo é semeado direto no banco local do app:

```bash
adb shell am force-stop tech.billhigiene.crm
adb exec-out run-as tech.billhigiene.crm \
  cat /data/data/tech.billhigiene.crm/databases/crm-offlineSQLite.db > /tmp/crm-offline.db

sqlite3 /tmp/crm-offline.db <<'SQL'
INSERT OR REPLACE INTO catalogo_produtos (id,codigo,nome,preco_cents,controla_estoque,quantidade,ativo)
  VALUES ('prod-teste-1','SKU-1','Sabonete de glicerina 90g',450,1,100,1),
         ('prod-teste-2','SKU-2','Shampoo neutro 300ml',1890,1,50,1);
INSERT OR REPLACE INTO catalogo_contatos (id,nome,documento,cidade,limite_cents)
  VALUES ('cont-teste-1','Mercadinho do Zé','12345678000199','Ribeirão Preto',500000);
-- A chave é `catalogo_sincronizado_em`; sem ela a home diz "catálogo vazio".
INSERT OR REPLACE INTO meta (chave,valor) VALUES ('catalogo_sincronizado_em','2026-11-18T08:40:00.000Z');
DELETE FROM pedidos_pendentes;
SQL

adb push /tmp/crm-offline.db /data/local/tmp/crm-offline.db
adb shell 'run-as tech.billhigiene.crm cp /data/local/tmp/crm-offline.db /data/data/tech.billhigiene.crm/databases/crm-offlineSQLite.db'
adb shell 'run-as tech.billhigiene.crm rm -f /data/data/tech.billhigiene.crm/databases/crm-offlineSQLite.db-wal /data/data/tech.billhigiene.crm/databases/crm-offlineSQLite.db-shm'
```

`Mercadinho do Zé` e os dois SKUs são fixture, não cliente real. **Deixe o
emulador em modo avião** (`adb shell cmd connectivity airplane-mode enable`):
o dreno não pode alcançar a instalação de ninguém.

## O que cada trecho prova

| Trecho do fluxo | Propriedade |
|---|---|
| busca de cliente e produto com sinal desligado | catálogo local responde sem rede |
| salvar → volta para a home com `(1)` | o pedido entra na fila e a tela confirma |
| `stopApp` + `launchApp` → `(1)` e `OFF-0001` | retomada após reinício; a fila não some |
| toque duplo → `(2)`, nunca `(3)` | o "salvar uma vez só" segura o polegar |
| "Enviar agora" sem sinal → `(2)` + aviso | falha de envio não perde nem inventa sucesso |
