"""Pydantic models: the exact shape every piece of data must have.

If objects.json is missing a field or has the wrong type, loading it fails
with a clear error instead of breaking the page later.
"""

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, RootModel, model_validator

Group = Literal["solar_system", "nebula", "star_cluster"]
SceneMode = Literal["solar_system", "deep_space"]


class SpaceObject(BaseModel):
    """One of the 20 objects AstroLens knows about."""

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str
    aliases: list[str] = Field(min_length=1)  # nicknames and catalogue ids, used by /navigate
    type: str
    group: Group
    scene_mode: SceneMode
    constellation: str | None = None

    # Deep-space objects: position on the sky and distance from Earth
    ra_deg: float | None = Field(default=None, ge=0, lt=360)
    dec_deg: float | None = Field(default=None, ge=-90, le=90)
    distance_ly: float | None = Field(default=None, gt=0)
    radius_ly: float | None = Field(default=None, gt=0)  # physical radius, from Wikipedia (used by the true-distance view)

    # Solar-system bodies: size and orbit (the Moon orbits Earth, so it uses parent + orbit_km)
    radius_km: float | None = Field(default=None, gt=0)
    orbit_au: float | None = Field(default=None, ge=0)
    parent: str | None = None
    orbit_km: float | None = Field(default=None, gt=0)

    facts: dict[str, str] = Field(min_length=3, max_length=4)
    summary: str = Field(min_length=40)
    suggested_questions: list[str] = Field(min_length=3, max_length=3)
    sources: list[HttpUrl] = Field(min_length=1)

    @model_validator(mode="after")
    def check_position_fields(self) -> "SpaceObject":
        if self.scene_mode == "deep_space":
            missing = [f for f in ("ra_deg", "dec_deg", "distance_ly", "radius_ly") if getattr(self, f) is None]
            if missing:
                raise ValueError(f"{self.id}: deep-space object is missing {missing}")
        else:
            if self.radius_km is None:
                raise ValueError(f"{self.id}: solar-system body is missing radius_km")
            has_sun_orbit = self.orbit_au is not None
            has_parent_orbit = self.parent is not None and self.orbit_km is not None
            if not (has_sun_orbit or has_parent_orbit):
                raise ValueError(f"{self.id}: needs orbit_au, or parent + orbit_km")
        return self


class ObjectCatalogue(RootModel[list[SpaceObject]]):
    """The whole objects.json file: a list of objects with unique ids."""

    @model_validator(mode="after")
    def check_unique_ids(self) -> "ObjectCatalogue":
        ids = [o.id for o in self.root]
        duplicates = {i for i in ids if ids.count(i) > 1}
        if duplicates:
            raise ValueError(f"duplicate ids: {sorted(duplicates)}")
        known = set(ids)
        for o in self.root:
            if o.parent is not None and o.parent not in known:
                raise ValueError(f"{o.id}: parent '{o.parent}' is not in the catalogue")
        return self


class HealthResponse(BaseModel):
    status: Literal["ok"]
    objects: int
    model: str | None  # name of the loaded classifier; None if no weights are installed


class Guess(BaseModel):
    """One of the classifier's top guesses."""

    id: str
    name: str
    prob: float = Field(ge=0, le=1)


class ClassifyResponse(BaseModel):
    """Answer to POST /classify."""

    top3: list[Guess] = Field(min_length=3, max_length=3)
    is_unknown: bool  # True when the best guess is below the threshold: "not one of my known objects"
    threshold: float
    known_classes: int  # how many objects the classifier can recognise
    gradcam_png_base64: str  # the photo (as the model saw it) with the Grad-CAM heatmap over it
    latency_ms: float  # time spent classifying on the server


class ErrorResponse(BaseModel):
    detail: str


class ChatTurn(BaseModel):
    """One earlier message in the conversation."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    object_id: str | None = None  # the object the user is looking at, so "it" makes sense
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class Citation(BaseModel):
    n: int  # the number used in the answer, e.g. [2]
    title: str
    url: str
    section: str
    object_id: str
    snippet: str  # the start of the paragraph given to the language model
    score: float  # similarity to the question (plus the current-object bonus)
    cited: bool  # True if the answer actually cites it


class ChatResponse(BaseModel):
    answer: str
    refused: bool  # True when the answer is "I don't know from my sources."
    citations: list[Citation]
    retrieval_ms: float
    llm_ms: float
    latency_ms: float


class NavigateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class Candidate(BaseModel):
    id: str
    name: str
    score: float


class NavigateResponse(BaseModel):
    intent: Literal["fly_to", "clarify", "chat"]
    object_id: str | None  # where to fly (fly_to), or the object a question is about (chat)
    score: float  # best similarity between the text and an object's name or nickname
    needs_clarification: bool
    candidates: list[Candidate]  # best matches; for "clarify", the two options to offer
    latency_ms: float
