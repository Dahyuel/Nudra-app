"""
Persistent conversation store.

Maps user-facing `conversation_id` to DeepSeek `chat_session_id` plus
last_message_id for threaded continuation.

Also tracks `last_parent_seen` + `stuck_count` so we can detect when
DeepSeek has stopped advancing the message tree and auto-reset the session.
"""

import sqlite3
import time
from pathlib import Path

from loguru import logger

from app.config import settings


DB_PATH = Path(settings.cookie_path).parent / "conversations.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id  TEXT PRIMARY KEY,
                chat_session_id  TEXT NOT NULL,
                last_message_id  INTEGER,
                model_type       TEXT,
                created_at       REAL NOT NULL,
                updated_at       REAL NOT NULL,
                last_parent_seen INTEGER,
                stuck_count      INTEGER NOT NULL DEFAULT 0,
                last_stream_empty INTEGER NOT NULL DEFAULT 0
            )
        """)
        existing_cols = {
            row["name"]
            for row in c.execute("PRAGMA table_info(conversations)").fetchall()
        }
        for col, ddl in (
            ("last_parent_seen",  "ALTER TABLE conversations ADD COLUMN last_parent_seen INTEGER"),
            ("stuck_count",       "ALTER TABLE conversations ADD COLUMN stuck_count INTEGER NOT NULL DEFAULT 0"),
            ("last_stream_empty", "ALTER TABLE conversations ADD COLUMN last_stream_empty INTEGER NOT NULL DEFAULT 0"),
            ("last_msg_count",    "ALTER TABLE conversations ADD COLUMN last_msg_count INTEGER"),
            ("turns_sent",        "ALTER TABLE conversations ADD COLUMN turns_sent INTEGER NOT NULL DEFAULT 0"),
        ):
            if col not in existing_cols:
                try:
                    c.execute(ddl)
                    logger.info(f"[store] migrated: added column {col}")
                except sqlite3.OperationalError as e:
                    logger.warning(f"[store] migration for {col} skipped: {e}")
        c.commit()
    logger.info(f"Conversation store ready at {DB_PATH}")


def get_session(conversation_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM conversations WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        return dict(row) if row else None


def upsert_session(
    conversation_id: str,
    chat_session_id: str,
    last_message_id: int | None = None,
    model_type: str | None = None,
    last_parent_seen: int | None = None,
    stuck_count: int | None = None,
    last_stream_empty: int | None = None,
    turns_sent: int | None = None,
    **kwargs,
) -> None:
    now = time.time()
    with _conn() as c:
        existing = c.execute(
            "SELECT conversation_id FROM conversations WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()

        if existing:
            c.execute(
                """
                UPDATE conversations
                   SET chat_session_id  = ?,
                       last_message_id  = COALESCE(?, last_message_id),
                       model_type       = COALESCE(?, model_type),
                       last_parent_seen = COALESCE(?, last_parent_seen),
                       stuck_count      = COALESCE(?, stuck_count),
                       last_stream_empty = COALESCE(?, last_stream_empty),
                       turns_sent       = COALESCE(?, turns_sent),
                       updated_at       = ?
                 WHERE conversation_id = ?
                """,
                (
                    chat_session_id,
                    last_message_id,
                    model_type,
                    last_parent_seen,
                    stuck_count,
                    last_stream_empty,
                    turns_sent,
                    now,
                    conversation_id,
                ),
            )
        else:
            c.execute(
                """
                INSERT INTO conversations
                    (conversation_id, chat_session_id, last_message_id,
                     model_type, created_at, updated_at,
                     last_parent_seen, stuck_count, last_stream_empty, turns_sent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    conversation_id,
                    chat_session_id,
                    last_message_id,
                    model_type,
                    now,
                    now,
                    last_parent_seen,
                    stuck_count if stuck_count is not None else 0,
                    last_stream_empty if last_stream_empty is not None else 0,
                    turns_sent if turns_sent is not None else 0,
                ),
            )
        c.commit()


def delete_session(conversation_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM conversations WHERE conversation_id = ?", (conversation_id,))
        c.commit()


def list_sessions(limit: int = 50) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
