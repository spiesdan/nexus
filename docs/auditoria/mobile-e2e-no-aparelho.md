# Mobile no aparelho — o que o emulador viu e os testes não

> **Ambiente medido em 18/11/2026:** macOS arm64 (8 núcleos), emulador AVD `nexus`
> (Pixel 7, Android 36, `google_apis;arm64-v8a`), APK **debug** compilado do branch
> `fix/mobile-conexao-ja-existe` (base `nexus/main`), Maestro **2.12.1**.
> Nenhuma instalação real foi acessada: o emulador rodou em **modo avião** e o
> catálogo foi semeado no banco local, não baixado.

## 1. O P0 que só apareceu no aparelho

O shell tem duas páginas (`index.html` e `novo-pedido.html`). Ao tocar em
"Novo pedido offline", o WebView navega — e navegação **troca o contexto
JavaScript**, não o processo.

O plugin `@capacitor-community/sqlite` mantém `isConnection` e
`retrieveConnection` num dicionário **do contexto JS**:

```js
// node_modules/@capacitor-community/sqlite/dist/esm/definitions.js
async isConnection(database, readonly) {
  res.result = this._connectionDict.has(connName);   // ← dicionário local
}
```

No Android, `retrieveConnection` **não existe no lado nativo**:

```console
$ # CDP (chrome://inspect) na página novo-pedido.html do APK de debug
CapacitorSQLite.retrieveConnection() is not implemented on android
CapacitorSQLite.isConnection() is not implemented on android
```

Ou seja: o contexto novo vê o dicionário **vazio**, o nativo continua com
`crm-offline` aberto, e `createConnection` lança:

```console
CreateConnection: Connection crm-offline already exists
```

Esse throw rejeitava `abrir()`. E `banco()` guarda a promessa rejeitada, então
**toda** chamada seguinte falhava — sem erro na tela:

| Toque do vendedor | Antes | Depois |
|---|---|---|
| digitar "Mercadinho" no cliente | lista vazia | `Mercadinho do Zé — Ribeirão Preto` |
| digitar "Sabonete" no produto | lista vazia | `Sabonete de glicerina 90g — R$ 4,50` |
| "Salvar na fila" | nada acontecia | pedido `OFF-0001` na fila |

O sintoma que o vendedor relata é "o aparelho não tem catálogo" — e ele volta
sem o pedido. É o tipo de silêncio que a doutrina proíbe: falha existia, tela não
dizia nada.

## 2. A correção

`lib/offline/db.ts` passa a **fechar a conexão órfã e reabrir o mesmo arquivo**
(não há o que recuperar no Android):

```ts
try {
  return await abrirAgora();
} catch (e) {
  if (!/already exists/i.test(String(e))) throw e;   // erro de verdade sobe
  await sqlite.closeConnection(NOME_DO_BANCO, false).catch(() => undefined);
  return await abrirAgora();
}
```

`open()` numa conexão já aberta ("already open") também deixou de ser fatal.
Fechar não apaga dado: o arquivo é o mesmo, e o banco local é **um por
aparelho**, não um por página.

Prova unitária: `tests/unit/offline-conexao-ja-existe.test.ts` (2 casos — reabre
a órfã; e "disco cheio" continua subindo).

## 3. A jornada executada no emulador

`tests/e2e-mobile/jornada-offline.yaml`, com Maestro, em modo avião:

```console
[Passed] jornada-offline
```

| Passo | Prova |
|---|---|
| captura com sinal desligado | `01-cliente-encontrado.png`, `02-produto-encontrado.png` |
| salvar | `03-item-adicionado.png`, `04-salvo-volta-para-home.png` (home mostra `Fila de envio (1)`) |
| `stopApp` + `launchApp` | `05-fila-sobrevive-ao-reinicio.png` — `(1)` e `OFF-0001` |
| toque duplo em "Salvar na fila" | `06-duplo-toque-nao-duplica.png` — `(2)`, nunca `(3)` |
| "Enviar agora" sem sinal | `07-enviar-sem-sinal.png` — `(2)` e o aviso visível |

Banco depois do fluxo, lido do aparelho:

```console
$ sqlite3 crm-offlineSQLite.db "select count(*), group_concat(numero_provisorio) from pedidos_pendentes;"
2|OFF-0001,OFF-0002
```

Backup do SQLite com CPF/CNPJ continua recusado (F-MOB-8):

```console
$ adb shell dumpsys backup | grep -A2 tech.billhigiene.crm
# (vazio: o app não aparece como elegível)
```

## 4. Limites declarados

- **APK físico, iOS e leitor de tela** continuam `[!]`: este ambiente tem
  emulador, não aparelho. TalkBack no emulador é possível e fica para a próxima
  fatia.
- O fluxo **não drena para servidor**: em modo avião, o dreno não roda. Provar o
  envio de ponta a ponta exige instalação descartável com WAHA/Redis — o que a
  doutrina de QA chama de P0 e o CI ainda não cobre (`vps-fresh-onboarding`).
- A ponte entre shell e sistema continua sendo o bloqueio da **opção B**
  (ver `docs/frentes/front-mobile.md` §4/§9): o shell drena com credencial de
  dispositivo, não com a sessão do navegador.
