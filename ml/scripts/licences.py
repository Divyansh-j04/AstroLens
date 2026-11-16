"""Which image licences AstroLens may use (the licence rule agreed for Phase 2).

Allowed: public domain, CC0, CC BY, CC BY-SA, and NASA works.
Excluded: non-commercial (NC) or no-derivatives (ND) licences, "all rights reserved",
anything unclear, and NASA Photojournal images whose credit is not NASA/JPL (those keep
their owner's terms, e.g. "Copyright: Stuart Heggie").
"""

import re

_BLOCKED = re.compile(r"\bnc\b|-nc|non-?commercial|\bnd\b|-nd|no-?deriv|all rights reserved|copyright", re.I)
_ALLOWED = re.compile(r"^\s*(public domain|pd\b|cc0|cc[ -]by(?:[ -]sa)?(?:[ -]\d|\s*$)|nasa photojournal)", re.I)


def licence_ok(licence: str, author: str = "") -> bool:
    """True if an image with this licence (and credit) may be used for training or testing."""
    if not licence or _BLOCKED.search(licence) or _ALLOWED.search(licence) is None:
        return False
    if licence.lower().startswith("nasa photojournal"):
        return bool(re.search(r"NASA|JPL", author)) and not re.search(r"copyright", author, re.I)
    return True


if __name__ == "__main__":  # quick self-check
    cases = {
        ("CC BY 4.0", ""): True, ("CC BY-SA 4.0", ""): True, ("CC BY-SA 3.0 IGO", ""): True,
        ("Public domain", ""): True, ("Public domain (NASA)", ""): True, ("CC0", ""): True,
        ("CC BY-NC 4.0", ""): False, ("CC BY-NC-SA 2.0", ""): False, ("CC BY-ND 4.0", ""): False,
        ("GFDL", ""): False, ("", ""): False, ("All rights reserved", ""): False,
        ("NASA Photojournal (...)", "NASA/JPL-Caltech"): True,
        ("NASA Photojournal (...)", "Copyright: Stuart Heggie"): False,
        ("NASA Photojournal (...)", "Courtesy AAAS/Science"): False,
    }
    for (lic, auth), want in cases.items():
        got = licence_ok(lic, auth)
        assert got == want, (lic, auth, got)
    print(f"licence_ok: {len(cases)} cases pass")
