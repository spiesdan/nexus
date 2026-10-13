#!/usr/bin/env python3
"""
Prova que os testes da CATEGORIA PT têm dente.

Cada mutação quebra a lógica de tradução ou de busca, e o gate exige que o
teste correspondente REPROVE. Um teste que passa com a correção desligada não
é teste.

O que NÃO entra aqui: a tabela das 533 traduções. Desligar a tradução de uma
categoria é um dado faltando, não uma lógica quebrada — e a cobertura da
tabela é verificada por outro caminho (`categoria-pt.test.ts`, caso "NENHUMA
das 22 do banco fica em ingles", com a lista vinda do banco de verdade).

Uso: python3 scripts/provar-mutacoes-categoria-pt.py
Sai != 0 se alguma mutação NÃO reprovou, ou se a âncora não existir — que é
pior: significaria que o script mede o código errado.
"""
from __future__ import annotations

import pathlib
import re
import shutil
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ALVO = RAIZ / "lib/prospeccao/categoria-pt.ts"
TESTE = "lib/prospeccao/categoria-pt.test.ts"

MUTACOES: list[tuple[str, str, str | None, str]] = [
    (
        "substring em portugues vira igualdade (filtro some)",
        "    if (semAcentoFlexivel(pt).includes(tFlex) || semAcento(gravada).includes(t)) {",
        "    if (semAcentoFlexivel(pt) === tFlex || semAcento(gravada) === t) {",
        "'mecanica' traz 'Auto repair shop' — o caso que estava quebrado",
    ),
    (
        "passo 3 (busca no ingles gravado) some",
        "    if (semAcentoFlexivel(pt).includes(tFlex) || semAcento(gravada).includes(t)) {",
        "    if (semAcentoFlexivel(pt).includes(tFlex)) {",
        "quem digita o ingles ainda acha",
    ),
    (
        "traduzir devolve vazio em vez do original",
        "  return CATEGORIA_PT[gravada] ?? gravada;",
        "  return CATEGORIA_PT[gravada] ?? \"\";",
        "categoria fora da tabela volta ela mesma, e nao lanca",
    ),
    (
        "flexao de genero desliga",
        '  return base.replace(/(os|as|o|a)$/, "");',
        "  return base;",
        "'mecanica' traz 'Mecanico' — flexao de genero",
    ),
    (
        "semAcento deixa de tirar acento",
        '    .replace(/[\\u0300-\\u036f]/g, "")',
        "",
        "tira acento e baixa a caixa",
    ),
    (
        "termo vazio passa a trazer TUDO",
        '  if (t === "") return [];',
        "",
        "termo vazio nao traz nada — e nao traz TUDO",
    ),
    (
        "uma das traducoes do banco some (voltando a ingles)",
        '  "Gas station": "Posto de combustível",',
        None,
        "NENHUMA das 22 categorias medidas no banco fica em ingles",
    ),
]


def aplicar(original: str, ancora: str, subst: str | None) -> str | None:
    if subst is None:
        alvo = ancora + "\n"
        return original.replace(alvo, "", 1) if alvo in original else None
    return original.replace(ancora, subst, 1) if ancora in original else None


def rodar() -> tuple[bool, int]:
    env = RAIZ / ".env.local"
    tmp = pathlib.Path("/tmp/.env.local-catpt")
    movido = env.exists()
    if movido:
        shutil.move(str(env), str(tmp))
    try:
        proc = subprocess.run(
            ["pnpm", "exec", "vitest", "run", TESTE],
            cwd=RAIZ, capture_output=True, text=True,
        )
    finally:
        if movido:
            shutil.move(str(tmp), str(env))
    saida = proc.stdout + proc.stderr
    m = re.search(r"Tests\s+.*?(\d+)\s+failed", saida)
    return bool(m), int(m.group(1)) if m else 0


def main() -> int:
    original = ALVO.read_text()
    print("")
    falhas = 0
    try:
        for nome, ancora, subst, teste in MUTACOES:
            mutado = aplicar(original, ancora, subst)
            if mutado is None:
                print(f"  x {nome} — ANCORA NAO ENCONTRADA (o script mediu o codigo errado)")
                falhas += 1
                continue
            ALVO.write_text(mutado)
            try:
                reprovou, quantos = rodar()
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
