"""Only images under the agreed licences may be used (ml/scripts/licences.py)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml" / "scripts"))
from licences import licence_ok  # noqa: E402


@pytest.mark.parametrize("licence,author", [
    ("CC BY 4.0", ""), ("CC BY-SA 4.0", ""), ("CC BY-SA 3.0 IGO", ""), ("CC0", ""),
    ("Public domain", ""), ("Public domain (NASA)", ""),
    ("NASA Photojournal (NASA images not copyrighted)", "NASA/JPL-Caltech/University of Arizona"),
])
def test_allowed(licence, author):
    assert licence_ok(licence, author)


@pytest.mark.parametrize("licence,author", [
    ("CC BY-NC 4.0", ""), ("CC BY-NC-SA 2.0", ""), ("CC BY-ND 4.0", ""), ("GFDL", ""), ("", ""),
    ("All rights reserved", ""),
    ("NASA Photojournal (NASA images not copyrighted)", "Copyright: Stuart Heggie"),
    ("NASA Photojournal (NASA images not copyrighted)", "Courtesy AAAS/Science"),
])
def test_blocked(licence, author):
    assert not licence_ok(licence, author)
