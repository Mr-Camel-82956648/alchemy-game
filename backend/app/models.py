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


class PixVerseTaskEvent(BaseModel):
    at: int
    kind: str
    message: str
    traceId: Optional[str] = None
    providerStatus: Optional[int] = None
    errCode: Optional[int] = None
    errMsg: Optional[str] = None


class PixVerseCallDiagnostic(BaseModel):
    at: int
    phase: str
    method: str
    url: str
    traceId: str
    requestHeaders: dict[str, str] = Field(default_factory=dict)
    requestSummary: dict[str, object] = Field(default_factory=dict)
    httpStatus: Optional[int] = None
    providerErrCode: Optional[int] = None
    providerErrMsg: Optional[str] = None
    providerStatus: Optional[int] = None
    responseSummary: dict[str, object] = Field(default_factory=dict)


class PixVerseTask(BaseModel):
    videoTaskId: str
    cardId: Optional[str] = None
    forgeTaskId: Optional[str] = None
    pixverseVideoId: Optional[int] = None
    traceId: Optional[str] = None
    lastPollTraceId: Optional[str] = None
    status: str
    providerStatus: Optional[int] = None
    providerErrCode: Optional[int] = None
    providerErrMsg: Optional[str] = None
    error: Optional[str] = None
    resultUrl: Optional[str] = None
    promptSummary: Optional[str] = None
    promptLength: int = 0
    submitAttempts: int = 0
    pollCount: int = 0
    createdAt: int
    updatedAt: int
    finishedAt: Optional[int] = None
    events: List[PixVerseTaskEvent] = Field(default_factory=list)


class PixVerseTaskListResponse(BaseModel):
    count: int
    tasks: List[PixVerseTask] = Field(default_factory=list)


class PixVerseConfigResponse(BaseModel):
    configSource: str
    baseUrl: Optional[str] = None
    submitUrl: Optional[str] = None
    resultUrlTemplate: Optional[str] = None
    apiKeyHint: Optional[str] = None
    model: Optional[str] = None
    quality: Optional[str] = None
    aspectRatio: Optional[str] = None
    durationSeconds: int
    waterMark: bool
    seed: int
    generateAudioSwitch: bool
    maxRetries: int
    pollIntervalSeconds: float
    timeoutSeconds: float
    missing: List[str] = Field(default_factory=list)
    fieldSources: dict[str, str] = Field(default_factory=dict)


class PixVerseTaskDebugResponse(BaseModel):
    task: PixVerseTask
    config: PixVerseConfigResponse
    latestSubmitCall: Optional[PixVerseCallDiagnostic] = None
    latestPollCall: Optional[PixVerseCallDiagnostic] = None


class CardVideoRegistrationItem(BaseModel):
    cardId: str
    forgeTaskId: Optional[str] = None
    name: Optional[str] = None
    attrSet: List[str] = Field(default_factory=list)
    generation: Optional[int] = 1
    themeText: Optional[str] = None
    videoPrompt: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    sourceType: Optional[str] = None
    status: Optional[str] = None
    videoTaskId: Optional[str] = None
    pixverseVideoId: Optional[int] = None
    providerStatus: Optional[int] = None
    submitAttempts: int = 0
    pollCount: int = 0
    resultUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    error: Optional[str] = None
    updatedAt: Optional[int] = None
    completedAt: Optional[int] = None


class CardVideoRegistrationRequest(BaseModel):
    cards: List[CardVideoRegistrationItem] = Field(default_factory=list)


class CardVideoStatus(BaseModel):
    assetId: str
    cardId: Optional[str] = None
    forgeTaskId: Optional[str] = None
    sourceType: str
    status: str
    name: Optional[str] = None
    attrSet: List[str] = Field(default_factory=list)
    generation: int = 1
    themeText: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    videoTaskId: Optional[str] = None
    pixverseVideoId: Optional[int] = None
    providerStatus: Optional[int] = None
    submitAttempts: int = 0
    pollCount: int = 0
    resultUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    error: Optional[str] = None
    createdAt: int = 0
    updatedAt: int = 0
    completedAt: Optional[int] = None
    metadataPath: Optional[str] = None
    assetDir: Optional[str] = None


class CardVideoStatusListResponse(BaseModel):
    count: int
    cards: List[CardVideoStatus] = Field(default_factory=list)


class CardAssetListResponse(BaseModel):
    count: int
    assets: List[CardVideoStatus] = Field(default_factory=list)


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
