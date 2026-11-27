---
impacto: nada_mudou
secao: adicionado
titulo: Um comando único diz se a instalação está saudável (disco, RAM, backup, A1, versão, borda)
---

`hostgator-setup-kit/saude.sh` lê o estado da instalação e responde em uma tela:
contêiner unhealthy ou parado, disco, RAM, swap, idade do último backup do banco,
se existe backup agendado, validade do certificado fiscal A1 (e `.pfx` truncado),
versão em execução contra a última release publicada, HTTP e validade do TLS.

Ele é **somente leitura**: não sobe, não reinicia, não escreve arquivo e não toca
no `.env`. Sai com 0 (tudo ok), 1 (alerta) ou 2 (não deu para inspecionar), o que
permite usá-lo numa rotina que só avisa quando há anomalia. `--json` para
máquina, `--quiet` para silêncio quando está tudo bem.

O runbook `docs/runbooks/operacao-vps.md` traz o baseline medido da instalação de
produção, os limites de cada sinal e as lacunas que ainda não têm monitoramento —
a principal é que o `backup.sh` só roda dentro do `update.sh`, então uma semana
sem deploy é uma semana sem backup.

O `docs/runbooks/deploy.md` ganhou a seção de rollback por tag de imagem, que não
existia: as sete tags no `.env`, os `-f` certos para cada tipo de instalação, a
prova e o limite (rollback de imagem não desfaz migration).
