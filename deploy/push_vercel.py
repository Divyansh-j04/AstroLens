"""Deploy the page to Vercel (static files), without the Vercel command-line tool.

1. Builds the page (npm run build) with VITE_API_URL set to the Space's address, so the built page
   calls the deployed server.
2. Uploads every file of frontend/dist through Vercel's REST API (each file once, identified by its
   SHA-1), plus frontend/vercel.json (cache headers).
3. Creates a production deployment of the project "astrolens" and waits until it is ready.

Reads VERCEL_TOKEN from .env (never printed). Uses only Python's built-in urllib. A token scoped to a
team (e.g. "<name>'s projects", the Hobby team) needs that team's id on every request; it is looked
up automatically (GET /v2/teams) unless VERCEL_TEAM_ID is set in .env.

Usage (from the project root):
    python deploy/push_vercel.py --api https://<user>-astrolens.hf.space
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
API = "https://api.vercel.com"
PROJECT = "astrolens"


TEAM_ID = ""  # filled in main(); added to every request as ?teamId=


def call(method: str, path: str, token: str, body: bytes | None = None, headers: dict | None = None) -> dict:
    if TEAM_ID and "/v2/teams" not in path:
        path += ("&" if "?" in path else "?") + f"teamId={TEAM_ID}"
    req = urllib.request.Request(f"{API}{path}", data=body, method=method,
                                 headers={"Authorization": f"Bearer {token}", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:500]
        sys.exit(f"Vercel API {method} {path} failed: HTTP {err.code} {detail}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True, help="the deployed server's address, e.g. https://user-astrolens.hf.space")
    args = ap.parse_args()
    load_dotenv(ROOT / ".env")
    token = os.getenv("VERCEL_TOKEN", "").strip()
    if not token:
        sys.exit("VERCEL_TOKEN is empty: add a Vercel token to .env (see .env.example).")

    global TEAM_ID
    TEAM_ID = os.getenv("VERCEL_TEAM_ID", "").strip()
    if not TEAM_ID:
        teams = call("GET", "/v2/teams", token).get("teams", [])
        if len(teams) == 1:
            TEAM_ID = teams[0]["id"]
            print(f"Vercel team: {teams[0].get('name') or teams[0].get('slug')}")
        elif len(teams) > 1:
            sys.exit("The token can reach several Vercel teams; set VERCEL_TEAM_ID in .env to choose one: "
                     + ", ".join(f"{t.get('slug')}={t['id']}" for t in teams))

    print(f"Building the page with VITE_API_URL={args.api}")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True,
                   env={**os.environ, "VITE_API_URL": args.api.rstrip("/")})

    files = [(p, p.relative_to(DIST).as_posix()) for p in sorted(DIST.rglob("*")) if p.is_file()]
    files.append((FRONTEND / "vercel.json", "vercel.json"))
    listing = []
    for path, rel in files:
        data = path.read_bytes()
        sha = hashlib.sha1(data).hexdigest()
        call("POST", "/v2/files", token, data, {"Content-Type": "application/octet-stream",
                                                "x-vercel-digest": sha, "Content-Length": str(len(data))})
        listing.append({"file": rel, "sha": sha, "size": len(data)})
    print(f"Uploaded {len(listing)} files ({sum(f['size'] for f in listing) / 1e6:.1f} MB)")

    body = {"name": PROJECT, "files": listing, "target": "production",
            "projectSettings": {"framework": None, "buildCommand": None, "installCommand": None,
                                "outputDirectory": None}}
    dep = call("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", token,
               json.dumps(body).encode(), {"Content-Type": "application/json"})
    for _ in range(60):
        dep = call("GET", f"/v13/deployments/{dep['id']}", token)
        if dep.get("readyState") in ("READY", "ERROR", "CANCELED"):
            break
        time.sleep(5)
    print(f"State: {dep.get('readyState')}")
    aliases = dep.get("alias") or []
    print("Page:", ", ".join(f"https://{a}" for a in aliases) or f"https://{dep.get('url')}")
    if dep.get("readyState") != "READY":
        sys.exit(1)


if __name__ == "__main__":
    main()
