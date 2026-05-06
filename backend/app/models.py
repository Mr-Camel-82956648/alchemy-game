from typing import List, Optional

from pydantic import BaseModel, Field


class SpellInput(BaseModel):
    id: str
    name: str
    attrSet: List[str] = Field(default_factory=list)
    mainAttr: Optional[str] = None
    generation: Optional[int] = 1


class ForgeRequest(BaseModel):
    playerId: str
    spellA: SpellInput
    spellB: SpellInput


class ForgeResult(BaseModel):
    name: str
    attrSet: List[str] = Field(default_factory=list)
    mainAttr: str
    subAttr: Optional[str] = None
    element: str
    generation: int
    baseAtk: float
    videoUrl: Optional[str] = None
    status: str = "partial"
    visualDesc: Optional[str] = None
    fusionPrompt: Optional[str] = None
    source: str


class ForgeStatusResponse(BaseModel):
    taskId: str
    status: str  # "pending" | "completed" | "failed"
    result: Optional[ForgeResult] = None
    error: Optional[str] = None


class ForgeCreateResponse(BaseModel):
    taskId: str
    status: str = "pending"


class PlayerQuotaResponse(BaseModel):
    playerId: str
    quotaDate: str
    dailyLimit: int
    used: int
    remaining: int
    resetAt: str


class AdminQuotaResetRequest(BaseModel):
    playerId: Optional[str] = None
    applyToAll: bool = False
    usedCount: int = 0
    dailyLimit: Optional[int] = None


class AdminQuotaResetResponse(BaseModel):
    updatedPlayers: int
    quotaDate: str
    dailyLimit: Optional[int] = None
