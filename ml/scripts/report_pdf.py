"""Export REPORT.md to docs/REPORT.pdf.

REPORT.md is turned into an HTML page with markdown-it-py (tables and images included), the
architecture diagram is drawn by Mermaid (loaded from a CDN at a pinned version), and the
installed Microsoft Edge prints the page to PDF in headless mode. No new libraries.

Usage (from the project root):
    python ml/scripts/report_pdf.py
    python ml/scripts/report_pdf.py --html out.html    # also keep the HTML page (to check it in a browser)
"""

import html
import subprocess
import sys
import tempfile
from pathlib import Path

from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "REPORT.pdf"
EDGE = [Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")]
MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"

CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111; }
h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4px; }
h2 { font-size: 14pt; margin-top: 22px; border-bottom: 1px solid #bbb; padding-bottom: 2px; page-break-after: avoid; }
h3 { font-size: 12pt; page-break-after: avoid; }
table { border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; page-break-inside: avoid; }
th, td { border: 1px solid #999; padding: 3px 6px; vertical-align: top; }
th { background: #eee; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #f3f3f3; padding: 0 2px; }
pre { background: #f6f6f6; padding: 8px; font-size: 8.5pt; white-space: pre-wrap; }
blockquote { margin: 4px 0 4px 12px; padding-left: 10px; border-left: 3px solid #ccc; color: #333; }
img { max-width: 100%; page-break-inside: avoid; }
.mermaid { text-align: center; margin: 10px 0; }
"""


def main() -> None:
    keep_html = Path(sys.argv[sys.argv.index("--html") + 1]) if "--html" in sys.argv else None
    edge = next((e for e in EDGE if e.exists()), None)
    if not edge:
        sys.exit("Microsoft Edge not found.")
    md = MarkdownIt("commonmark", {"html": True}).enable("table")
    body = md.render((ROOT / "REPORT.md").read_text(encoding="utf-8"))
    # ```mermaid blocks -> <div class="mermaid"> so Mermaid draws them.
    body = body.replace('<pre><code class="language-mermaid">', '<div class="mermaid">').replace(
        "</code></pre>", "</code></pre>")
    parts = body.split('<div class="mermaid">')
    for i in range(1, len(parts)):
        diagram, rest = parts[i].split("</code></pre>", 1)
        parts[i] = html.unescape(diagram) + "</div>" + rest
    body = '<div class="mermaid">'.join(parts)
    page = f"""<!doctype html><html><head><meta charset="utf-8"><base href="{ROOT.as_uri()}/">
<title>AstroLens: Project Report</title><style>{CSS}</style>
<script src="{MERMAID}"></script>
<script>mermaid.initialize({{ startOnLoad: true, theme: 'neutral', flowchart: {{ htmlLabels: false }} }});</script>
</head><body>{body}</body></html>"""
    OUT.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "report.html"
        src.write_text(page, encoding="utf-8")
        if keep_html:
            keep_html.write_text(page, encoding="utf-8")
        subprocess.run([str(edge), "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        "--virtual-time-budget=15000", f"--user-data-dir={tmp}\\profile",
                        f"--print-to-pdf={OUT}", src.as_uri()], check=True, timeout=180,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
