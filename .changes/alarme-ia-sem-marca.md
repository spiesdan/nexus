---
impacto: nada_mudou
secao: alterado
titulo: "O alerta de orçamento de IA não assina mais com o nome do produto"
---

O e-mail de aviso de orçamento de IA saía com o assunto `Alerta IA: orçamento
atingiu X% — DeskcommCRM`. Numa instalação self-host isso é o nome de outra
empresa na cara de quem recebeu o aviso.

O assunto passa a assinar com a organização sobre a qual o alarme disparou
(`orgName`) e, quando esse campo vem vazio, sai sem assinatura nenhuma — silencioso
é melhor do que mentir sobre quem escreveu.

Era a última dívida da catraca de marca (`tests/unit/branding.test.ts`), que fica
agora zerada: o gate que tranca o conjunto pelo nome passou a esperar o vazio, de
modo que a dívida não reapareça trocando de arquivo.