import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "quota.sqlite3"
DEFAULT_DAILY_LIMIT = int(os.getenv("FORGE_DAILY_QUOTA", "5"))
logger = logging.getLogger("forge.quota")


def _load_timezone():
    timezone_name = os.getenv("FORGE_QUOTA_TIMEZONE", "Asia/Shanghai")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning(
            "quota timezone %s unavailable; falling back to fixed UTC+08:00",
            timezone_name,
        )
        return timezone(timedelta(hours=8), name="UTC+08:00")


TIMEZONE = _load_timezone()


class QuotaExceededError(Exception):
    pass


def _ensure_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS player_quota (
                player_id TEXT PRIMARY KEY,
                quota_date TEXT NOT NULL,
                used_count INTEGER NOT NULL,
                daily_limit INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _connect():
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now():
    return datetime.now(TIMEZONE)


def get_quota_date() -> str:
    return _now().date().isoformat()


def _get_reset_at() -> str:
    tomorrow = (_now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return tomorrow.isoformat()


def _upsert_today_row(conn: sqlite3.Connection, player_id: str):
    today = get_quota_date()
    now = _now().isoformat()
    row = conn.execute(
        "SELECT player_id, quota_date, used_count, daily_limit FROM player_quota WHERE player_id = ?",
        (player_id,),
    ).fetchone()

    if row is None:
        conn.execute(
            """
            INSERT INTO player_quota (player_id, quota_date, used_count, daily_limit, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (player_id, today, 0, DEFAULT_DAILY_LIMIT, now),
        )
        conn.commit()
        return {
            "player_id": player_id,
            "quota_date": today,
            "used_count": 0,
            "daily_limit": DEFAULT_DAILY_LIMIT,
        }

    if row["quota_date"] != today:
        conn.execute(
            """
            UPDATE player_quota
            SET quota_date = ?, used_count = 0, updated_at = ?
            WHERE player_id = ?
            """,
            (today, now, player_id),
        )
        conn.commit()
        return {
            "player_id": player_id,
            "quota_date": today,
            "used_count": 0,
            "daily_limit": int(row["daily_limit"]),
        }

    return {
        "player_id": row["player_id"],
        "quota_date": row["quota_date"],
        "used_count": int(row["used_count"]),
        "daily_limit": int(row["daily_limit"]),
    }


def get_quota_snapshot(player_id: str):
    with _connect() as conn:
        row = _upsert_today_row(conn, player_id)

    remaining = max(0, int(row["daily_limit"]) - int(row["used_count"]))
    return {
        "playerId": row["player_id"],
        "quotaDate": row["quota_date"],
        "dailyLimit": int(row["daily_limit"]),
        "used": int(row["used_count"]),
        "remaining": remaining,
        "resetAt": _get_reset_at(),
    }


def consume_quota_or_raise(player_id: str):
    with _connect() as conn:
        row = _upsert_today_row(conn, player_id)
        used_count = int(row["used_count"])
        daily_limit = int(row["daily_limit"])
        if used_count >= daily_limit:
            raise QuotaExceededError("今日实时合成次数已用尽")

        conn.execute(
            """
            UPDATE player_quota
            SET used_count = ?, updated_at = ?
            WHERE player_id = ?
            """,
            (used_count + 1, _now().isoformat(), player_id),
        )
        conn.commit()


def admin_reset_or_adjust(
    player_id: Optional[str],
    apply_to_all: bool,
    used_count: int,
    daily_limit: Optional[int],
) -> int:
    today = get_quota_date()
    now = _now().isoformat()

    with _connect() as conn:
        if apply_to_all and not player_id:
            if daily_limit is None:
                conn.execute(
                    """
                    UPDATE player_quota
                    SET quota_date = ?, used_count = ?, updated_at = ?
                    """,
                    (today, used_count, now),
                )
            else:
                conn.execute(
                    """
                    UPDATE player_quota
                    SET quota_date = ?, used_count = ?, daily_limit = ?, updated_at = ?
                    """,
                    (today, used_count, daily_limit, now),
                )
            conn.commit()
            return conn.total_changes

        if not player_id:
            return 0

        row = conn.execute(
            "SELECT daily_limit FROM player_quota WHERE player_id = ?",
            (player_id,),
        ).fetchone()
        next_limit = daily_limit if daily_limit is not None else (int(row["daily_limit"]) if row else DEFAULT_DAILY_LIMIT)

        conn.execute(
            """
            INSERT INTO player_quota (player_id, quota_date, used_count, daily_limit, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET
                quota_date = excluded.quota_date,
                used_count = excluded.used_count,
                daily_limit = excluded.daily_limit,
                updated_at = excluded.updated_at
            """,
            (player_id, today, used_count, next_limit, now),
        )
        conn.commit()
        return 1
