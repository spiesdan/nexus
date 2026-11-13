"""Contrato tipado (Pydantic) entre o backend Next.js (Nexus) e o servico Python.

O contrato e a unica fronteira entre os dois sistemas: o servico nunca vê o
schema do banco, e o backend nunca monta o modelo OR-Tools. Tudo que atravessa a
fronteira e' validado aqui, em Pydantic, antes de chegar ao solver.
"""

from typing import Optional

from pydantic import BaseModel, Field, model_validator


class PontoMissao(BaseModel):
    """Parada de entrega com coordenadas aceitaveis."""

    node_id: str = Field(..., min_length=1, max_length=64)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    peso_kg: float = Field(default=0, ge=0)
    volume_m3: float = Field(default=0, ge=0)


class VeiculoIn(BaseModel):
    """Veiculo (motorista) disponivel para a distribuicao."""

    veiculo_id: str = Field(..., min_length=1, max_length=64)
    motorista_id: Optional[str] = Field(default=None, max_length=64)
    capacidade_kg: float = Field(default=0, ge=0)
    capacidade_m3: float = Field(default=0, ge=0)
    tempo_jornada_min: Optional[int] = Field(default=None, ge=0)


class SolverRequest(BaseModel):
    """Payload de otimizacao multi-veiculo (VRPTW)."""

    org_id: str = Field(..., min_length=1, max_length=64)
    # Ponto de origem (deposito) — coordenada de entrega/base.
    origem: Optional[PontoMissao] = None
    pontos: list[PontoMissao] = Field(default_factory=list)
    veiculos: list[VeiculoIn] = Field(default_factory=list)
    tempo_parada_min: int = Field(default=30, ge=0, le=600)
    max_veiculos: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _validar(self) -> "SolverRequest":
        if not self.pontos and not self.origem:
            raise ValueError("solver exige pontos de entrega ou origem")
        return self


class RotaDeVeiculo(BaseModel):
    """Sequencia de paradas de um veiculo na rota."""

    veiculo_id: str
    motorista_id: Optional[str] = None
    paradas: list[str] = Field(default_factory=list)
    distancia_m: float = 0
    duracao_s: float = 0
    custo: float = 0
    geometria: list[list[float]] = Field(default_factory=list)


class SolverResponse(BaseModel):
    """Resposta padronizada do servico de otimizacao."""

    org_id: str
    status: str = "otimizado"
    veiculos: list[RotaDeVeiculo] = Field(default_factory=list)
    total_paradas: int = 0
    tempo_total_s: float = 0
    erro: Optional[str] = None

    @model_validator(mode="after")
    def _validar_status(self) -> "SolverResponse":
        if self.erro:
            raise ValueError(self.erro)
        return self
