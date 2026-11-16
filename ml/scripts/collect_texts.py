"""Collect the texts the chat answers from (Phase 4): 3 to 6 documents per object.

For every object in objects.json:
  - each link in its `sources` (the English Wikipedia article and, for most, a NASA Science page);
  - from ml/data/text_sources.json: the Simple English Wikipedia article (a plain-language explainer),
    related English Wikipedia articles (e.g. "Pillars of Creation" for the Eagle Nebula) and extra
    NASA pages (the planets' "facts" pages).

Wikipedia text comes from its API as plain text (no HTML). Reference lists, "See also" and similar
end sections are dropped. NASA pages are reduced to their article paragraphs and headings.

Each document is saved as backend/app/data/corpus/<object_id>/<slug>.md with a header block
(title, url, object_id, source, licence, retrieved_on) and the text below it.
A failed page is reported and skipped (the run continues); a summary goes to
ml/results/corpus_counts.json.

Usage (from the project root):
    python ml/scripts/collect_texts.py
"""

import datetime as dt
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlencode, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect import fetch  # noqa: E402  (urllib with verified HTTPS, retries on rate limits)

ROOT = Path(__file__).resolve().parents[2]
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
EXTRA = ROOT / "ml" / "data" / "text_sources.json"
CORPUS = ROOT / "backend" / "app" / "data" / "corpus"
COUNTS = ROOT / "ml" / "results" / "corpus_counts.json"

WIKI_LICENCE = "CC BY-SA 4.0 (Wikipedia contributors)"
NASA_LICENCE = "Public domain (NASA; not copyrighted in the United States)"
END_SECTIONS = re.compile(
    r"^==\s*(See also|References|Notes|Footnotes|Citations|Sources|Further reading|External links|"
    r"Bibliography|Gallery|Explanatory notes|Works cited)\s*==\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def wikipedia(title: str, lang: str = "en") -> tuple[str, str, str]:
    """(title, url, plain text) of a Wikipedia article, without its end sections."""
    params = {"action": "query", "format": "json", "prop": "extracts|info", "inprop": "url", "explaintext": 1,
              "exsectionformat": "wiki", "redirects": 1, "titles": title}
    data = json.loads(fetch(f"https://{lang}.wikipedia.org/w/api.php?{urlencode(params)}"))
    page = next(iter(data["query"]["pages"].values()))
    if "missing" in page or not page.get("extract"):
        raise ValueError(f"no {lang} Wikipedia article '{title}'")
    text = page["extract"]
    end = END_SECTIONS.search(text)
    if end:
        text = text[: end.start()]
    text = re.sub(r"\{\\displaystyle(?:[^{}]|\{[^{}]*\})*\}", "", text)  # leftover maths markup
    text = re.sub(r"^(=+)\s*(.*?)\s*\1\s*$", lambda m: "#" * (len(m.group(1)) - 1) + " " + m.group(2), text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return page["title"], page["fullurl"], text


def nasa(url: str) -> tuple[str, str, str]:
    """(title, url, text) of a NASA Science page: its headings and paragraphs, up to "Keep Exploring"."""
    raw = fetch(url).decode("utf-8", "replace").replace("�", "'")
    title = html.unescape(re.search(r"<title>(.*?)</title>", raw, re.S).group(1)).split(" - NASA")[0].strip()
    body = raw[raw.find("<article"):] if "<article" in raw else raw
    blocks = []
    for tag, inner in re.findall(r"<(h2|h3|p)\b[^>]*>(.*?)</\1>", body, re.S):
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", inner))).strip()
        if text.startswith("Keep Exploring") or text.startswith("Discover More Topics"):
            break
        if tag == "p" and len(text) >= 60:
            blocks.append(text)
        elif tag != "p" and 3 <= len(text) <= 80:
            blocks.append(f"## {text}")
    while blocks and blocks[-1].startswith("##"):  # no heading without text under it
        blocks.pop()
    text = "\n\n".join(blocks)
    if len(text.split()) < 80:
        raise ValueError(f"too little text on {url}")
    return title, url, text


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def save(obj_id: str, name: str, title: str, url: str, source: str, licence: str, text: str) -> int:
    folder = CORPUS / obj_id
    folder.mkdir(parents=True, exist_ok=True)
    header = {"title": title, "url": url, "object_id": obj_id, "source": source, "licence": licence,
              "retrieved_on": dt.date.today().isoformat()}
    lines = ["---"] + [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in header.items()] + ["---", "", text, ""]
    (folder / f"{name}.md").write_text("\n".join(lines), encoding="utf-8")
    return len(text.split())


def main() -> None:
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    extra = json.loads(EXTRA.read_text(encoding="utf-8"))["objects"]
    summary: dict[str, list[dict]] = {}
    failures: list[str] = []
    for o in objects:
        jobs = []  # (file name, source label, licence, function, argument)
        for s in o["sources"]:
            u = urlparse(s)
            if u.netloc == "en.wikipedia.org":
                jobs.append(("wikipedia", "Wikipedia", WIKI_LICENCE, wikipedia, unquote(u.path.rsplit("/", 1)[-1]).replace("_", " ")))
            elif u.netloc == "science.nasa.gov":
                jobs.append(("nasa", "NASA Science", NASA_LICENCE, nasa, s))
        more = extra.get(o["id"], {})
        if "simple_wikipedia" in more:
            jobs.append(("simple-wikipedia", "Simple English Wikipedia", WIKI_LICENCE,
                         lambda t: wikipedia(t, "simple"), more["simple_wikipedia"]))
        for t in more.get("related_wikipedia", []):
            jobs.append((f"wikipedia-{slug(t)}", "Wikipedia", WIKI_LICENCE, wikipedia, t))
        for k, u in enumerate(more.get("nasa", [])):
            jobs.append((f"nasa-{slug(urlparse(u).path.strip('/').split('/')[-1]) or k}", "NASA Science", NASA_LICENCE, nasa, u))

        summary[o["id"]] = []
        for name, source, licence, fn, arg in jobs:
            try:
                title, url, text = fn(arg)
            except Exception as err:  # one bad page must not stop the run
                failures.append(f"{o['id']}: {arg}: {err}")
                print(f"  FAILED {o['id']} {arg}: {err}", file=sys.stderr)
                continue
            words = save(o["id"], name, title, url, source, licence, text)
            summary[o["id"]].append({"file": f"{name}.md", "title": title, "url": url, "source": source, "words": words})
        print(f"{o['id']}: {len(summary[o['id']])} documents, "
              f"{sum(d['words'] for d in summary[o['id']]):,} words", file=sys.stderr)

    COUNTS.write_text(json.dumps({
        "script": "ml/scripts/collect_texts.py",
        "retrieved_on": dt.date.today().isoformat(),
        "documents": sum(len(v) for v in summary.values()),
        "words": sum(d["words"] for v in summary.values() for d in v),
        "failures": failures,
        "per_object": summary,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{sum(len(v) for v in summary.values())} documents; {len(failures)} failed", file=sys.stderr)


if __name__ == "__main__":
    main()
