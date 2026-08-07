"""Framework-independent OpenKartLine simulation engine."""

from openkartline_engine.schemas import (
    ENGINE_VERSION,
    SCHEMA_VERSION,
    KartV1,
    Point2D,
    SimulationRequestV1,
    SimulationResultV1,
    SimulationSettingsV1,
    TrackV1,
)
from openkartline_engine.simulation import simulate

__all__ = [
    "ENGINE_VERSION",
    "SCHEMA_VERSION",
    "KartV1",
    "Point2D",
    "SimulationRequestV1",
    "SimulationResultV1",
    "SimulationSettingsV1",
    "TrackV1",
    "simulate",
]
