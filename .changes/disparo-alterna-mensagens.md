---
impacto: capacidade_nova
secao: adicionado
titulo: O disparo em lote alterna três mensagens e espera 60 segundos entre uma e outra
---

Mandar a mesma mensagem para dezenas de números que nunca falaram com a gente é o
padrão que o WhatsApp reconhece como spam — e o estrago não aparece como erro:
aparece semanas depois, como número banido. A tela de disparo em lote agora pede
até **três opções de texto** e as alterna: a primeira empresa recebe a mensagem 1,
a segunda a 2, a terceira a 3, a quarta volta para a 1. Cada empresa continua
recebendo **uma** mensagem — só não é mais a mesma string cinquenta vezes.

O intervalo padrão passou de 1,2s para **60 segundos**, e a tela mostra isso em
segundos, com o campo aberto para quem precisar de outro ritmo. A simulação diz
quanto tempo o disparo vai levar e em que ordem as mensagens vão sair, para dar
para conferir a rotação antes de qualquer coisa sair.

Quem manda um texto único continua preenchendo um campo só: as opções 2 e 3 são
opcionais, e a API aceita tanto a mensagem única de sempre quanto a lista de
variações.
