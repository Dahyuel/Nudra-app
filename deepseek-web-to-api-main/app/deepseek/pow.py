import base64
import json
import struct
from dataclasses import dataclass
from pathlib import Path

import wasmtime
from loguru import logger

from .errors import PowError

WASM_PATH = Path(__file__).parent / "sha3_wasm_bg.wasm"


@dataclass
class Challenge:
    algorithm: str
    challenge: str
    salt: str
    signature: str
    difficulty: int
    expire_at: int
    target_path: str


def parse_challenge(payload: dict) -> Challenge:
    c = payload["data"]["biz_data"]["challenge"]
    return Challenge(
        algorithm=c["algorithm"],
        challenge=c["challenge"],
        salt=c["salt"],
        signature=c["signature"],
        difficulty=c["difficulty"],
        expire_at=c["expire_at"],
        target_path=c["target_path"],
    )


class _WasmSolver:
    def __init__(self):
        if not WASM_PATH.exists():
            raise PowError(f"WASM binary not found at {WASM_PATH}")
        self.engine = wasmtime.Engine()
        self.module = wasmtime.Module.from_file(self.engine, str(WASM_PATH))
        self.store = wasmtime.Store(self.engine)
        self.instance = wasmtime.Instance(self.store, self.module, [])
        self.exports = self.instance.exports(self.store)

        for name in ("wasm_solve", "memory",
                     "__wbindgen_export_0", "__wbindgen_export_1",
                     "__wbindgen_add_to_stack_pointer"):
            if name not in self.exports:
                raise PowError(f"WASM missing export: {name}")
        logger.info("WASM PoW module loaded")

    def _memory(self):
        # Re-fetch each time — memory may have grown
        return self.instance.exports(self.store)["memory"]

    def _write_string(self, s: str):
        data = s.encode("utf-8")
        n = len(data)
        alloc = self.exports["__wbindgen_export_0"]
        ptr = alloc(self.store, n, 1)
        # Refresh memory AFTER allocation (it may have grown)
        mem = self._memory()
        mem.write(self.store, data, ptr)
        return int(ptr), n

    def solve(self, challenge: str, salt: str, difficulty: int) -> float:
        add_to_stack = self.exports["__wbindgen_add_to_stack_pointer"]
        wasm_solve = self.exports["wasm_solve"]

        retptr = add_to_stack(self.store, -16)

        h_ptr, h_len = self._write_string(challenge)
        l_ptr, l_len = self._write_string(salt)

        wasm_solve(
            self.store,
            retptr,
            h_ptr,
            h_len,
            l_ptr,
            l_len,
            float(difficulty),
        )

        mem = self._memory()
        raw = bytes(mem.read(self.store, retptr, retptr + 16))
        flag = struct.unpack_from("<i", raw, 0)[0]
        answer = struct.unpack_from("<d", raw, 8)[0]

        add_to_stack(self.store, 16)

        if flag == 0:
            raise PowError("WASM returned no solution")
        return float(answer)


_solver = None


def _get_solver():
    global _solver
    if _solver is None:
        _solver = _WasmSolver()
    return _solver


def solve(ch: Challenge) -> float:
    if ch.algorithm != "DeepSeekHashV1":
        raise PowError(f"Unsupported algorithm: {ch.algorithm}")
    actual_salt = f"{ch.salt}_{ch.expire_at}_"
    answer = _get_solver().solve(ch.challenge, actual_salt, ch.difficulty)
    logger.debug(f"PoW solved: answer={answer}")
    return answer


def build_pow_header(ch: Challenge, answer: float) -> str:
    payload = {
        "algorithm": ch.algorithm,
        "challenge": ch.challenge,
        "salt": ch.salt,
        "answer": int(answer),
        "signature": ch.signature,
        "target_path": ch.target_path,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.b64encode(raw).decode()
