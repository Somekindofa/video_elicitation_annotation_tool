#!/usr/bin/env python3
"""
Migration script to add tagging_trigger_number field to annotations table.
This field tracks how many times tagging has been triggered for an elicitation.
"""

import sqlite3
from pathlib import Path
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database paths
CHROMA_DB_PATH = Path(__file__).parent.parent / "chroma_langchain_db" / "annotations.db"
ELICITATIONS_DB_PATH = (
    Path(__file__).parent.parent / "elicitations_db" / "annotations.db"
)


def add_column_if_not_exists(
    db_path: Path, table_name: str, column_name: str, column_def: str
):
    """Add a column to a table if it doesn't already exist"""
    if not db_path.exists():
        logger.warning(f"Database not found: {db_path}")
        return False

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Check if column already exists
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]

        if column_name in columns:
            logger.info(f"Column '{column_name}' already exists in {db_path.name}")
            conn.close()
            return True

        # Add the column
        alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"
        cursor.execute(alter_sql)
        conn.commit()
        logger.info(
            f"Successfully added column '{column_name}' to {table_name} in {db_path.name}"
        )
        conn.close()
        return True

    except sqlite3.Error as e:
        logger.error(f"Database error in {db_path}: {e}")
        return False


def main():
    """Run migrations on both database locations"""
    logger.info("Starting migration: adding tagging_trigger_number field")

    column_def = "INTEGER DEFAULT 0"

    # Try both database paths
    success = True

    if CHROMA_DB_PATH.exists():
        logger.info(f"\nMigrating {CHROMA_DB_PATH}")
        if not add_column_if_not_exists(
            CHROMA_DB_PATH, "annotations", "tagging_trigger_number", column_def
        ):
            success = False

    if ELICITATIONS_DB_PATH.exists():
        logger.info(f"\nMigrating {ELICITATIONS_DB_PATH}")
        if not add_column_if_not_exists(
            ELICITATIONS_DB_PATH, "annotations", "tagging_trigger_number", column_def
        ):
            success = False

    if success:
        logger.info("\nMigration completed successfully!")
        return 0
    else:
        logger.error("\nMigration completed with errors")
        return 1


if __name__ == "__main__":
    sys.exit(main())
