# F-32/D9 — backup e restore dos uploads (o que o dump do banco não leva)

> Executado em 18/11/2026, com docker real, em projeto descartável.
> Evidência bruta: [`evidencias/f32/prova-20261118-034153.txt`](evidencias/f32/prova-20261118-034153.txt)
> (`scripts/auditoria/prova-backup-uploads.sh`). Teste de decisão com dublê:
> `tests/shell/backup-uploads.test.sh`, dentro do `pnpm test:shell`.
> Nenhuma VPS, banco remoto ou produção foi tocado.

## 1. A lacuna que estava aberta

O `backup.sh` sempre copiou o banco (`pg_dump`) e as sessões do WhatsApp
(`waha-data`). Ficavam de fora **os arquivos que o banco referencia**:

| Superfície | Onde vive | Consequência de perder |
|---|---|---|
| fotos de produto | bind `/var/www/crm/storage/product-images` (compose) | ficha do produto com imagem quebrada, sem erro no log |
| mídia do WhatsApp | volume `waha-media` | áudio/imagem de conversa antiga somem |
| buckets de um Supabase **próprio** | volume do `supabase/storage-api` | avatares, comprovantes e mídia do Storage |

`docs/auditoria/25-ensaio-de-restauracao.md` §3 declarava a lacuna e dizia que
fechá-la exige **decisão de operação**, não uma linha de código. As decisões
estão abaixo, escritas.

## 2. O que passou a existir

- `uploads_do_projeto()` (`_common.sh`): **fonte única** da lista de superfícies,
  uma por linha (`rótulo<TAB>tipo<TAB>fonte`), usada pelo backup **e** pelo
  restore. O restore descobre o destino **pelo rótulo do arquivo** — rótulo novo
  sem entrada na lista faz o restore recusar em vez de gravar no lugar errado.
- `hostgator-setup-kit/backup-uploads.sh`: `--listar`, `--backup <dir> [ts]` e
  `--restore <arquivo> [--substituir]`.
- `backup.sh`: chama o passo de uploads, aplica retenção **por rótulo** (14 de
  cada) e **sai 1** se qualquer superfície falhar.
- `restore.sh`: `--uploads <arquivo>` restaura os arquivos depois do banco; sem
  `--uploads`, avisa que não restaurou.

## 3. Decisões de operação (e a razão)

1. **Restore recusa destino com conteúdo** a menos que se peça `--substituir`.
   Um backup de ontem aplicado sobre volume que já recebeu mídia de hoje
   sobrescreveria arquivo NOVO com arquivo velho — e o banco continuaria
   apontando para os dois. Em recuperação de desastre (destino vazio) funciona
   sem flag; no dia a dia, quem quer sobrescrever diz que quer.
2. **Supabase Cloud não é copiado.** O bucket é do provedor; copiá-lo exige a
   API do Storage com service role, não um `tar` de volume. O backup avisa.
3. **Certificado A1 fica fora.** É credencial; um `.tgz` no diretório de backups
   a guardaria em claro. Backup de certificado é cifrado e fora deste fluxo.
4. **Falha de superfície derruba o backup.** Backup parcial que se apresenta como
   completo é pior que backup nenhum — a mesma régua do piso de 4 KiB do dump.
5. **Retenção por rótulo, não por glob.** `uploads-*` mistura fotos, mídia e
   storage; "14 de cada tipo" viraria "14 no total" e o volume de mídia expulsaria
   o backup das fotos.

## 4. O que a execução provou

Com docker real (bind + volume), ciclo completo:

| Passo | Medido |
|---|---|
| Descoberta | `product-images` (bind) e `waha-media` (volume) listados |
| Backup | `.tgz` com subdiretórios (`./sub/c.jpg`, `./sub/y.ogg`) |
| Perda simulada | bind e volume esvaziados |
| Restore | 3 fotos e 2 arquivos de mídia de volta |
| **Conteúdo** | `foto-1`, `foto-3` e `audio-1` idênticos (não só “existe”) |
| Sobrescrita | recusa sem `--substituir`; arquivo alheio preservado |

Teste de decisão (`pnpm test:shell`), 18 casos: descoberta com/sem Storage
próprio, `.tgz` legível, permissão 600, restore em destino vazio, recusa e
`--substituir`, arquivo truncado, rótulo desconhecido, `backup.sh` integrado,
retenção em 14 e superfície ilegível derrubando o backup.

## 5. Defeitos que a execução real achou (e o dublê não pegava)

1. **`-v backups:/out` não é diretório.** Com caminho relativo, o Docker lê
   `backups` como NOME DE VOLUME, cria um volume vazio, o `tar` “dá certo” dentro
   dele e o arquivo não aparece no host. Correção: o destino é convertido em
   caminho absoluto — e o transporte passou a ser **stdin/stdout**, que não
   depende de permissão de escrita no bind do container.
2. **`-u $(id -u)` quebrava o backup do volume.** No Docker Desktop (e no VPS,
   onde o diretório é do root) o tar não podia escrever em `/out`. Stdin/stdout
   resolve sem afrouxar permissão.
3. **`gzip -t` reprovava arquivo bom no macOS.** O `tar` do BSD, escrevendo em
   stdout, preenche o stream até blocos de 10 KiB, e o `gzip -t` chama isso de
   “trailing garbage” (rc 2). A validação passou a ser `tar -tzf`, que é o que o
   restore realmente faz — truncamento continua reprovando.
4. **`xargs -r` é opção GNU.** No macOS a retenção morria com “illegal option” e
   o `pipefail` derrubava o backup antes de limpar. Trocado por `xargs rm -f`
   (sem entrada é no-op).

## 6. Limites declarados

- **Storage em Cloud**: fora do backup, por decisão (§3.2).
- **Certificado A1**: fora, por decisão (§3.3).
- **Restore não reconcilia banco e arquivos**: se o dump for de um dia e o
  `uploads-*.tgz` de outro, o resultado é o banco antigo com arquivos do dia do
  arquivo. O kit não tenta casar datas — os dois arquivos levam o mesmo `<ts>`
  quando gerados juntos, e o operador escolhe.
- **Prova de VPS real**: não executada (proibido nesta rodada). O instrumento usa
  o mesmo `docker`/`tar`/`alpine` do kit; o que muda na VPS é o dono dos
  diretórios, coberto pelo `garantir_dir_de_fotos`.

## 7. Reproduzir

```bash
pnpm test:shell                                   # decisão, com dublê (18 casos)
bash scripts/auditoria/prova-backup-uploads.sh    # transporte, com docker real
```
