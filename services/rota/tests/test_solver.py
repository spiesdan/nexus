"""Testes do solver VRPTW do servico Python (F5).

Cobrem: contrato valido, solver com matriz injetada, resposta estruturada,
sem solucao quando nao ha paradas. A geometria de rota passa por stub (OSRM
fica de fora do gate unitario — rede).
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.contract import SolverRequest, SolverResponse  # noqa: E402
from app import solver as S  # noqa: E402


def _resolver_matriz(pontos, num_nodes):
    return S._resolver_matriz(pontos, num_nodes)


async def _rota_stub(seq):
    return {"distancia_m": 1000.0, "duracao_s": 2000.0, "geometria": [[10.0, -20.0]], "provedor": "osrm"}


def test_solver_retorna_resposta_valida_sem_veiculos():
    req = SolverRequest(
        org_id="org-teste",
        pontos=[
            {"node_id": "p1", "latitude": -22.9068, "longitude": -43.1729, "peso_kg": 10.0, "volume_m3": 0.5},
            {"node_id": "p2", "latitude": -22.9068, "longitude": -43.1829, "peso_kg": 12.0, "volume_m3": 0.6},
        ],
        veiculos=[],
        tempo_parada_min=30,
    )
    resposta = asyncio.run(S.otimizar_vrptw(req, matriz_fn=_resolver_matriz, rota_fn=_rota_stub))
    assert isinstance(resposta, SolverResponse)
    assert resposta.org_id == "org-teste"
    assert resposta.status == "otimizado"
    assert resposta.erro is None
    assert len(resposta.veiculos) >= 1
    assert resposta.total_paradas >= 1


def test_solver_rejeita_request_sem_pontos_ou_origem():
    import pydantic

    try:
        SolverRequest(org_id="org-teste", pontos=[], veiculos=[])
    except pydantic.ValidationError:
        return
    raise AssertionError("esperava validacao falhar sem pontos/origem")
