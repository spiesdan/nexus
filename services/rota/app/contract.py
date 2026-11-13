"""Contrato tipado (Pydantic) entre o backend Next.js (Nexus) e o servico Python.

O contrato e a unica fronteira entre os dois sistemas: o servico nunca vê o
schema do banco, e o backend nunca monta o modelo OR-Tools. Tudo que atravessa a
fronteira e' validado aqui, em Pydantic, antes de chegar ao solver.

Regra que vale nos dois lados: o que nao tem dado nao e' inventado. Peso,
volume e janela de entrega sao OPCIONAIS; quando faltam, a resposta diz em
`restricoes_nao_aplicadas` que aquela restricao nao foi usada — o operador
nunca recebe um "otimizado" que finge ter respeitado capacidade que nao sabia.
"""

from typing import Optional

from pydantic import BaseModel, Field, model_validator


class PontoMissao(BaseModel):
    """Parada de entrega com coordenadas aceitaveis."""

    node_id: str = Field(..., min_length=1, max_length=64)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    # Demanda da parada. 0 = sem dado (nao significa "nao pesa nada").
    peso_kg: float = Field(default=0, ge=0)
    volume_m3: float = Field(default=0, ge=0)
    # Tempo de atendimento proprio; ausente = usa `tempo_parada_min` do request.
    tempo_servico_min: Optional[int] = Field(default=None, ge=0, le=1440)
    # Janela de entrega em MINUTOS desde a saida da base (0 = saida).
    # Ausente nos dois lados = sem janela; nao ha dado de janela no schema atual.
    janela_inicio_min: Optional[int] = Field(default=None, ge=0, le=1440)
    janela_fim_min: Optional[int] = Field(default=None, ge=0, le=1440)

    @model_validator(mode="after")
    def _validar_janela(self) -> "PontoMissao":
        if (self.janela_inicio_min is None) != (self.janela_fim_min is None):
            raise ValueError(f"janela incompleta em {self.node_id}: informe inicio e fim")
        if (
            self.janela_inicio_min is not None
            and self.janela_fim_min is not None
            and self.janela_fim_min < self.janela_inicio_min
        ):
            raise ValueError(f"janela invertida em {self.node_id}: fim < inicio")
        return self


class VeiculoIn(BaseModel):
    """Veiculo (motorista) disponivel para a distribuicao."""

    veiculo_id: str = Field(..., min_length=1, max_length=64)
    motorista_id: Optional[str] = Field(default=None, max_length=64)
    # 0 = capacidade nao informada (nao limita) — e a resposta declara isso.
    capacidade_kg: float = Field(default=0, ge=0)
    capacidade_m3: float = Field(default=0, ge=0)
    tempo_jornada_min: Optional[int] = Field(default=None, ge=0, le=24 * 60)


class SolverRequest(BaseModel):
    """Payload de otimizacao multi-veiculo (VRPTW)."""

    org_id: str = Field(..., min_length=1, max_length=64)
    # Deposito/ponto de partida. Sem origem o servico usa a primeira parada como
    # base VIRTUAL (coordenada copiada) — a parada continua sendo entrega.
    origem: Optional[PontoMissao] = None
    pontos: list[PontoMissao] = Field(default_factory=list)
    veiculos: list[VeiculoIn] = Field(default_factory=list)
    # Se o veiculo volta para a base depois da ultima entrega.
    retornar_origem: bool = False
    tempo_parada_min: int = Field(default=30, ge=0, le=600)
    max_veiculos: Optional[int] = Field(default=None, ge=1)
    # Limite de busca do OR-Tools; o cliente HTTP espera mais que isto.
    limite_busca_s: int = Field(default=8, ge=1, le=60)

    @model_validator(mode="after")
    def _validar(self) -> "SolverRequest":
        if not self.pontos and not self.origem:
            raise ValueError("solver exige pontos de entrega")
        if self.origem is not None:
            ids = [p.node_id for p in self.pontos]
            if self.origem.node_id in ids:
                raise ValueError(f"origem {self.origem.node_id} tambem aparece como entrega")
        return self


class RotaDeVeiculo(BaseModel):
    """Sequencia de paradas de um veiculo na rota."""

    veiculo_id: str
    motorista_id: Optional[str] = None
    # node_id das entregas, na ordem real do trajeto (sem a base).
    paradas: list[str] = Field(default_factory=list)
    # Instante de CHEGADA em cada parada, em segundos desde a saida da base,
    # alinhado 1:1 com `paradas`. Vem do valor acumulado da dimensao de tempo
    # (inclui espera por janela), nao de uma soma de duracoes refeita no
    # cliente — ETA recalculado fora do solver diverge quando ha janela.
    chegadas_s: list[int] = Field(default_factory=list)
    distancia_m: float = 0
    # Tempo dirigindo (matriz OSRM), e tempo total com os atendimentos.
    duracao_s: float = 0
    duracao_com_paradas_s: float = 0
    carga_kg: float = 0
    carga_m3: float = 0
    # Sequencia completa (base -> entregas -> base quando retorna) desenhada.
    geometria: list[list[float]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validar_chegadas(self) -> "RotaDeVeiculo":
        if self.chegadas_s and len(self.chegadas_s) != len(self.paradas):
            raise ValueError(
                f"chegadas_s de {self.veiculo_id} fora de sincronia com paradas "
                f"({len(self.chegadas_s)} != {len(self.paradas)})"
            )
        return self


class SolverResponse(BaseModel):
    """Resposta padronizada do servico de otimizacao."""

    org_id: str
    # otimizado | sem_solucao
    status: str = "otimizado"
    veiculos: list[RotaDeVeiculo] = Field(default_factory=list)
    total_paradas: int = 0
    # Entregas que nao entraram em nenhuma rota. Sempre explicito: nada some.
    entregas_nao_alocadas: list[str] = Field(default_factory=list)
    # Restricoes que o solver NAO pode aplicar por falta de dado.
    restricoes_nao_aplicadas: list[str] = Field(default_factory=list)
    tempo_total_s: float = 0
    tempo_execucao_ms: int = 0
    versao_algoritmo: str = ""
    matriz_provedor: str = ""
    # Diagnostico quando status != otimizado (capacidade_peso, jornada, ...).
    motivo: Optional[str] = None
    erro: Optional[str] = None

    @model_validator(mode="after")
    def _validar_status(self) -> "SolverResponse":
        if self.status == "otimizado" and self.erro:
            raise ValueError(self.erro)
        if self.status == "otimizado" and self.entregas_nao_alocadas:
            raise ValueError("status otimizado nao pode ter entrega nao alocada")
        return self
