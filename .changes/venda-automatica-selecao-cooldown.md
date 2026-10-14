---
impacto: nada_mudou
secao: adicionado
titulo: "Criar venda automática abre a seleção com mensagem padrão e cooldown de 60s"
---

O botão "Criar venda automática" criava a campanha direto, sem texto e sem
lista. A mensagem era gerada pela IA a cada envio, a fila era preenchida
pelo filtro a cada tick, e os envios saíam em rajada — limitados só por cota e
janela. O "criar" era um ato de fé: o dono só descobria o que saiu quando o
cliente recebia.

Agora o botão leva para uma aba com **as empresas do filtro** (cidade,
categoria, ou a marcação manual): a lista, a **mensagem padrão**, o **cooldown**
e o limite — e só então cria. A campanha nasce com lista fechada: o motor só
enfileira aqueles prospects (passando pela mesma elegibilidade de telefone,
WhatsApp e duplicidade) e nunca preenche pelo filtro.

**Com mensagem padrão, sem IA.** Quando preenchida, o texto sai como está —
inclusive em instalação sem LLM configurado, que antes falhava tudo com
`ia_indisponivel`. Sem mensagem, a IA gera como antes. O cliente recebe
exatamente o que foi escrito na tela.

**60 segundos entre um envio e outro.** O espaçamento que já existia
(`espacarEnvio`) é um Map em memória: morre no restart e não vale entre
processos. O cooldown novo é carimbo no banco (`ultimo_envio_at`): antes de
cada envio o motor confere, e a fila que não coube espera o próximo tick (o
cron roda a cada minuto). O carimbo anda em toda tentativa, não só no sucesso
— sem isso, uma sequência de falhas mandaria em rajada.

Abaixo de 10 segundos não é cooldown, é rajada com outro nome — e rajada
contra o WAHA é ban. O piso é 10 no schema, no CHECK e no teste, os três.

**Mutações provadas:** `ids` fora da rota listaria o catálogo inteiro (2
testes); coluna esquecida no insert criaria campanha muda (1 teste); CHECK com
piso 1 liberaria rajada (invariante com insert de verdade); sanitizador
removido quebraria o filtro (1 teste); off-by-one no range (1 teste).