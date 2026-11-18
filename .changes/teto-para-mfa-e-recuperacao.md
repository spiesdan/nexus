---
impacto: nada_mudou
secao: corrigido
titulo: Código de MFA e de recuperação têm teto de tentativas
---

O código de seis dígitos do MFA tinha apenas um contador guardado no navegador
— quem apagasse o cookie recomeçava do zero, e seis dígitos são um milhão de
tentativas. O código de recuperação, de oito caracteres, não tinha teto nenhum.

Os dois passam a ter limite por pessoa e por origem, independente do navegador.
A resposta continua genérica: nunca revela se o e-mail existe nem que houve
bloqueio.
