"""Send one short message to the Groq language model to prove the API key works.

Usage (from the project root, after putting GROQ_API_KEY in .env):
    python ml/scripts/check_llm.py
"""

import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
MODEL = "llama-3.1-8b-instant"  # small, fast, free-tier Groq model


def main() -> None:
    load_dotenv(ROOT / ".env")
    import os

    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        sys.exit("GROQ_API_KEY is empty. Copy .env.example to .env and paste your key from console.groq.com.")

    from groq import Groq

    client = Groq(api_key=key)
    start = time.perf_counter()
    reply = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "In one short sentence: what is the Crab Nebula?"}],
        max_tokens=60,
    )
    ms = (time.perf_counter() - start) * 1000
    print(f"Model: {MODEL}")
    print(f"Reply: {reply.choices[0].message.content.strip()}")
    print(f"Time:  {ms:.0f} ms")


if __name__ == "__main__":
    main()
