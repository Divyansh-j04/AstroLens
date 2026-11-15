"""objects.json is the contract every phase reads, so check it strictly."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.main import load_objects
from app.schemas import ObjectCatalogue, SpaceObject

OBJECTS_FILE = Path(__file__).resolve().parents[1] / "backend" / "app" / "data" / "objects.json"

EXPECTED_IDS = {
    "sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune",
    "orion_nebula", "crab_nebula", "ring_nebula", "eagle_nebula", "carina_nebula", "horsehead_nebula",
    "pleiades", "beehive_cluster", "hercules_cluster", "omega_centauri",
}


def test_all_20_objects_validate():
    objects = load_objects()
    assert len(objects) == 20
    assert {o.id for o in objects} == EXPECTED_IDS


def test_group_counts_match_the_plan():
    groups = [o.group for o in load_objects()]
    assert groups.count("solar_system") == 10
    assert groups.count("nebula") == 6
    assert groups.count("star_cluster") == 4


def test_scene_mode_matches_group():
    for o in load_objects():
        expected = "solar_system" if o.group == "solar_system" else "deep_space"
        assert o.scene_mode == expected, o.id


def test_aliases_are_unique_across_objects():
    # /navigate matches typed text to aliases, so one alias must not point to two objects
    seen: dict[str, str] = {}
    for o in load_objects():
        for alias in [o.name, *o.aliases]:
            key = alias.lower()
            assert key not in seen, f"'{alias}' used by both {seen[key]} and {o.id}"
            seen[key] = o.id


def test_schema_rejects_deep_space_object_without_coordinates():
    raw = json.loads(OBJECTS_FILE.read_text(encoding="utf-8"))
    crab = next(o for o in raw if o["id"] == "crab_nebula")
    del crab["ra_deg"]
    with pytest.raises(ValidationError):
        SpaceObject.model_validate(crab)


def test_schema_rejects_duplicate_ids():
    raw = json.loads(OBJECTS_FILE.read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        ObjectCatalogue.model_validate(raw + [raw[0]])
