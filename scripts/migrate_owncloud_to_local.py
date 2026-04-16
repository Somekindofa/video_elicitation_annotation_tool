#!/usr/bin/env python3
"""
OwnCloud → Local Storage Migration Script
==========================================
Downloads all WebDAV videos from OwnCloud to the local data/videos/ directory,
then updates the Moodle DB records so FastAPI serves them directly from disk.

Usage (as root, from the project root):
    source .venv/bin/activate
    python scripts/migrate_owncloud_to_local.py [--dry-run]

Options:
    --dry-run   Print what would happen without downloading or changing the DB.
"""

import os
import sys
import uuid
import time
import argparse
import re
from pathlib import Path

# ── locate project root and load .env ────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

import requests
import pymysql

# ── config from .env ─────────────────────────────────────────────────────────
WEBDAV_BASE_URL  = os.environ["WEBDAV_BASE_URL"].rstrip("/")
WEBDAV_USERNAME  = os.environ["WEBDAV_USERNAME"]
WEBDAV_PASSWORD  = os.environ["WEBDAV_PASSWORD"]

DB_HOST   = os.getenv("MOODLE_DB_HOST", "localhost")
DB_PORT   = int(os.getenv("MOODLE_DB_PORT", "3306"))
DB_NAME   = os.getenv("MOODLE_DB_NAME", "moodle")
DB_USER   = os.getenv("MOODLE_DB_USER", "moodleuser")
DB_PASS   = os.getenv("MOODLE_DB_PASSWORD", "")
DB_PREFIX = os.getenv("MOODLE_TABLE_PREFIX", "mdl_")

VIDEOS_DIR = PROJECT_ROOT / "data" / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

# ── helpers ───────────────────────────────────────────────────────────────────

def normalise_url(external_url: str) -> str:
    """Ensure external_url is an absolute HTTPS URL."""
    if external_url.startswith("http://") or external_url.startswith("https://"):
        return external_url
    # Relative path like /remote.php/dav/...
    path = external_url if external_url.startswith("/") else "/" + external_url
    return WEBDAV_BASE_URL + path

def safe_filename(original: str) -> str:
    """Strip dangerous path components, keep extension."""
    name = os.path.basename(original)
    # Replace anything that's not alphanumeric, dot, dash, underscore, space
    name = re.sub(r"[^\w\.\-\s]", "_", name)
    return name.strip()

def download_video(url: str, dest: Path, auth) -> int:
    """Stream-download a video from OwnCloud. Returns bytes written."""
    # Use a requests session with streaming to avoid loading multi-GB files into RAM.
    with requests.get(url, auth=auth, stream=True, timeout=300, verify=True) as r:
        r.raise_for_status()
        written = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):  # 1 MB chunks
                if chunk:
                    f.write(chunk)
                    written += len(chunk)
    return written

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrate OwnCloud videos to local storage")
    parser.add_argument("--dry-run", action="store_true", help="Print plan only — no downloads, no DB changes")
    args = parser.parse_args()
    dry = args.dry_run

    if dry:
        print("[DRY RUN] No files will be downloaded and no DB changes will be made.\n")

    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, db=DB_NAME,
        user=DB_USER, password=DB_PASS,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )
    auth = (WEBDAV_USERNAME, WEBDAV_PASSWORD)

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, userid, filename, external_url, filesize "
                f"FROM {DB_PREFIX}local_videoelicit_videos "
                f"WHERE source_type = 'webdav' "
                f"ORDER BY id"
            )
            rows = cur.fetchall()

        print(f"Found {len(rows)} video(s) with source_type='webdav'.\n")
        if not rows:
            print("Nothing to migrate.")
            return

        succeeded = []
        failed = []

        for row in rows:
            vid_id   = row["id"]
            userid   = row["userid"]
            filename = row["filename"] or f"video_{vid_id}.mp4"
            ext_url  = row["external_url"] or ""
            db_size  = row["filesize"] or 0

            print(f"[{vid_id}] user={userid}  {filename}")

            if not ext_url:
                print(f"  SKIP — no external_url in DB\n")
                failed.append((vid_id, "no external_url"))
                continue

            url = normalise_url(ext_url)
            local_name = f"{uuid.uuid4().hex}_{safe_filename(filename)}"
            dest = VIDEOS_DIR / local_name

            print(f"  Source : {url}")
            print(f"  Dest   : {dest}")

            if dry:
                print(f"  [dry-run] would download and update DB\n")
                continue

            try:
                start = time.time()
                print(f"  Downloading...", end="", flush=True)
                bytes_written = download_video(url, dest, auth)
                elapsed = time.time() - start
                mb = bytes_written / (1024 * 1024)
                print(f" {mb:.1f} MB in {elapsed:.1f}s")

                if bytes_written == 0:
                    dest.unlink(missing_ok=True)
                    raise ValueError("Downloaded file is empty (0 bytes)")

                # Update DB
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE {DB_PREFIX}local_videoelicit_videos "
                        f"SET source_type='uploaded', filepath=%s, filesize=%s, "
                        f"    external_url='', timemodified=%s "
                        f"WHERE id=%s",
                        (str(dest), bytes_written, int(time.time()), vid_id)
                    )
                conn.commit()
                print(f"  DB updated: source_type='uploaded', filepath='{dest}'\n")
                succeeded.append(vid_id)

            except Exception as e:
                # Leave DB record unchanged — OwnCloud still works as fallback
                if dest.exists() and dest.stat().st_size == 0:
                    dest.unlink()
                conn.rollback()
                print(f"\n  FAILED: {e}\n")
                failed.append((vid_id, str(e)))

        print("=" * 60)
        print(f"DONE.  Succeeded: {len(succeeded)}   Failed: {len(failed)}")
        if failed:
            print("\nFailed videos (DB left unchanged — OwnCloud still serves them):")
            for vid_id, reason in failed:
                print(f"  id={vid_id}: {reason}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
