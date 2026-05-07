from typing import List, Optional

from pydantic import BaseModel, Field


class SpellInput(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    attrSet: List[str] = Field(default_factory=list)
    mainAttr: Optional[str] = None
    themeText: Optional[str] = None
    generation: Optional[int] = 1


class ForgeRequest(BaseModel):
    playerId: str
    spellA: Optional[SpellInput] = None
    spellB: Optional[SpellInput] = None


class ForgeResult(BaseModel):
    name: str
    attrSet: List[str] = Field(default_factory=list)
    themeText: Optional[str] = None
    mainAttr: Optional[str] = None
    subAttr: Optional[str] = None
    element: Optional[str] = None
    generation: int
    baseAtk: float
    videoPrompt: Optional[str] = None
    promptRoute: Optional[str] = None
    promptRouteReason: Optional[str] = None
    promptFallbackApplied: bool = False
    promptTemplate: Optional[str] = None
    promptModel: Optional[str] = None
    promptRouteElapsedMs: Optional[int] = None
    promptGenerationElapsedMs: Optional[int] = None
    promptTotalElapsedMs: Optional[int] = None
    videoUrl: Optional[str] = None
    status: str = "partial"
    source: str
    inputState: Optional[str] = None


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
