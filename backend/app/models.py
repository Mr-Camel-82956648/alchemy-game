from pydantic import BaseModel
from typing import Optional


class SpellInput(BaseModel):
    id: str
    name: str
    mainAttr: Optional[str] = None
    generation: Optional[int] = 1


class ForgeRequest(BaseModel):
    spellA: SpellInput
    spellB: SpellInput


class ForgeResult(BaseModel):
    name: str
    mainAttr: str
    subAttr: Optional[str] = None
    element: str
    generation: int
    baseAtk: float
    videoUrl: Optional[str] = None
    status: str = "partial"
    visualDesc: Optional[str] = None
    fusionPrompt: Optional[str] = None
    source: Optional[str] = None


class ForgeStatusResponse(BaseModel):
    taskId: str
    status: str  # "pending" | "completed" | "failed"
    result: Optional[ForgeResult] = None
    error: Optional[str] = None


class ForgeCreateResponse(BaseModel):
    taskId: str
    status: str = "pending"
