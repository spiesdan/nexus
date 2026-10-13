#!/usr/bin/env python3
"""
Prova que os testes do DISPARO têm dente.

Cada mutação quebra UMA linha do planejador — de propósito, no sentido errado
— e o gate exige que o teste correspondente REPROVE. Um teste que passa com a
correção desligada não é teste: é decoração, e aqui ele é tratado como falha.

Por que um script e não um teste: mutação é caro (9 × a suíte) e não é uma
asserção sobre o produto — é uma auditoria do próprio gate. Rodar é manual e
explícito; o resultado fica no PR.

Uso: python3 scripts/provar-mutacoes-disparo.py
Sai != 0 se alguma mutação NÃO reprovou (ou se a âncora não foi encontrada —
que é pior: significaria que o script está medindo o código errado).
"""
from __future__ import annotations

import pathlib
import re
import shutil
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ALVO = RAIZ / "lib/prospeccao/disparo.ts"
TESTE = "lib/prospeccao/disparo.test.ts"

# (nome, âncora, substituição ou None para REMOVER a linha, teste que deve cair)
MUTACOES: list[tuple[str, str, str | None, str]] = [
    (
        "opt-out não é lido",
        '  if (c.do_not_contact) return "do_not_contact";',
        '  if (false) return "do_not_contact";',
        "opt-out vem primeiro",
    ),
    (
        "bloqueado invertido",
        '  if (c.bloqueado) return "bloqueado";',
        '  if (!c.bloqueado) return "bloqueado";',
        "bloqueado pelo operador",
    ),
    (
        "cliente deixa de ser barrado",
        '  if (c.status_comercial === "cliente") return "ja_cliente";',
        None,
        "cliente antes da canalizacao",
    ),
    (
        "recusa registrada não é lida",
        '  if (c.consentRecusado) return "consent_recusado";',
        None,
        "recusa de marketing registrada",
    ),
    (
        "cota fecha um contato depois",
        "    if (usadasNaCota >= cotaRestante) {",
        "    if (usadasNaCota > cotaRestante) {",
        "cota fecha no limite exato",
    ),
    (
        "envio liberado sem sessão",
        "    podeEnviar: parametros.sessaoWorking,",
        "    podeEnviar: true,",
        "sem sessão WORKING o plano",
    ),
    (
        "envios saem colados",
        "      instanteMs: usadasNaCota * espacoMs,",
        "      instanteMs: 0,",
        "espaça os envios pelo intervalo",
    ),
    (
        "coluna whatsapp_potencial não é conferida",
        "  if (!c.whatsapp_potencial",
        "  if (false",
        "a coluna whatsapp_potencial mentindo",
    ),
    (
        "regex de celular não é conferida",
        r'|| !/^55\d{2}9\d{8}$/.test(c.telefone_normalizado.replace(/\D/g, ""))) {',
        "|| false) {",
        "a coluna whatsapp_potencial mentindo",
    ),
    (
        "telefone nulo passa",
        '  if (!c.telefone_normalizado) return "sem_telefone";',
        '  if (!c.telefone_normalizado && false) return "sem_telefone";',
        "sem telefone",
    ),
]


def aplicar(original: str, ancora: str, subst: str | None) -> str | None:
    """Devolve o arquivo mutado, ou None se a âncora não existir mais."""
    if subst is None:
        alvo = ancora + "\n"
        return original.replace(alvo, "", 1) if alvo in original else None
    return original.replace(ancora, subst, 1) if ancora in original else None


def rodar_teste() -> tuple[bool, int]:
    """(reprovou?, quantos testes falharam)."""
    env_backup = RAIZ / ".env.local"
    temporario = pathlib.Path("/tmp/.env.local-disparo")
    movido = env_backup.exists()
    if movido:
        shutil.move(str(env_backup), str(temporario))
    try:
        proc = subprocess.run(
            ["pnpm", "exec", "vitest", "run", TESTE],
            cwd=RAIZ,
            capture_output=True,
            text=True,
        )
    finally:
        if movido:
            shutil.move(str(temporario), str(env_backup))
    saida = proc.stdout + proc.stderr
    m = re.search(r"Tests\s+.*?(\d+)\s+failed", saida)
    return bool(m), int(m.group(1)) if m else 0


def main() -> int:
    original = ALVO.read_text()
    backup = pathlib.Path("/tmp/disparo.orig")
    backup.write_text(original)

    falhas = 0
    print("")
    try:
        for nome, ancora, subst, teste in MUTACOES:
            mutado = aplicar(original, ancora, subst)
            if mutado is None:
                print(f"  x {nome} — ANCORA NAO ENCONTRADA (o script mediu o codigo errado)")
                falhas += 1
                continue
            ALVO.write_text(mutado)
            try:
                reprovou, quantos = rodar_teste()
            finally:
                ALVO.write_text(original)
            if reprovou:
                print(f"  ok {nome} -> reprovou ({quantos} testes)")
            else:
                print(f"  x {nome} -> NAO REPROVOU. O teste '{teste}' nao tem dente.")
                falhas += 1
    finally:
        ALVO.write_text(original)

    print("")
    if falhas:
        print(f"{falhas} MUTACAO(oes) NAO REPROVARAM — o gate esta furado.")
        return 1
    print(f"TODAS AS {len(MUTACOES)} MUTACOES REPROVARAM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
