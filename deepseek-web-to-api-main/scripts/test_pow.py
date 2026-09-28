import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deepseek.client import DeepSeekClient
from app.deepseek.pow import parse_challenge, solve, build_pow_header


async def main():
    async with DeepSeekClient() as client:
        data = await client._post(
            "/api/v0/chat/create_pow_challenge",
            {"target_path": "/api/v0/chat/completion"},
        )
        ch = parse_challenge(data)
        print(f"Challenge: {ch.challenge[:20]}...")
        print(f"Salt: {ch.salt}")
        print(f"Difficulty: {ch.difficulty}")

        answer = solve(ch)
        print(f"Answer: {answer}")

        header = build_pow_header(ch, answer)
        print(f"Header (first 80): {header[:80]}...")


if __name__ == "__main__":
    asyncio.run(main())
