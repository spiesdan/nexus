---
impacto: nada_mudou
secao: adicionado
titulo: Toda tag publicada avisa o Discord automaticamente
---

O aviso de versão nova dependia de alguém rodar um script local — e quando ninguém lembrava, a versão subia calada (foi o caso da 1.72.1 e da 2.0.0). Agora a própria tag `v*` é o gatilho: o workflow monta a mensagem a partir da seção do CHANGELOG e posta no webhook configurado em secret. Falha no post não derruba a release — canal fora do ar não pode impedir a publicação de uma correção.
