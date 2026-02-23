#!/usr/bin/env python3
"""
Migration: Add Moodle integration fields

Adds moodle_userid, moodle_contextid, moodle_file_id, moodle_username
to videos and annotations tables.
"""

import sqlite3
import sys
from pathlib import Path
import logging

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from config import CHROMA_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = CHROMA_DIR / "annotations.db"


def add_moodle_fields():
    """Add Moodle integration fields to database"""
    
    if not DB_PATH.exists():
        logger.error(f"Database not found at {DB_PATH}")
        return False
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        logger.info("Adding Moodle integration fields...")
        
        # Get existing columns for videos table
        cursor.execute("PRAGMA table_info(videos)")
        video_columns = {row[1] for row in cursor.fetchall()}
        
        # Add Moodle fields to videos table
        moodle_video_fields = [
            ("moodle_userid", "INTEGER"),
            ("moodle_contextid", "INTEGER"),
            ("moodle_file_id", "TEXT"),
            ("moodle_username", "TEXT"),
        ]
        
        for field_name, field_type in moodle_video_fields:
            if field_name not in video_columns:
                logger.info(f"Adding {field_name} to videos table")
                cursor.execute(f"ALTER TABLE videos ADD COLUMN {field_name} {field_type}")
            else:
                logger.info(f"{field_name} already exists in videos table")
        
        # Get existing columns for annotations table
        cursor.execute("PRAGMA table_info(annotations)")
        annotation_columns = {row[1] for row in cursor.fetchall()}
        
        # Add Moodle fields to annotations table
        moodle_annotation_fields = [
            ("moodle_userid", "INTEGER"),
            ("moodle_contextid", "INTEGER"),
            ("moodle_username", "TEXT"),
            ("moodle_audio_file_id", "TEXT"),
        ]
        
        for field_name, field_type in moodle_annotation_fields:
            if field_name not in annotation_columns:
                logger.info(f"Adding {field_name} to annotations table")
                cursor.execute(f"ALTER TABLE annotations ADD COLUMN {field_name} {field_type}")
            else:
                logger.info(f"{field_name} already exists in annotations table")
        
        conn.commit()
        logger.info("✓ Moodle integration fields added successfully")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    success = add_moodle_fields()
    sys.exit(0 if success else 1)
