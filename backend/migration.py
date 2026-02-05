#!/usr/bin/env python3
"""
Unified Database Migration System

Consolidates all database migrations in a single, maintainable file.
Each migration is defined as a separate, idempotent function.

Usage:
    python migration.py              # Run all pending migrations
    python migration.py --reset      # Recreate database from models (CAUTION: data loss)
    python migration.py --check      # Check schema without applying changes

How to add new migrations:
1. Define a new function: def migration_007_new_feature(cursor)
2. Add column check: if "new_column" not in columns
3. Add to MIGRATIONS list at bottom: ("001_your_name", migration_001_your_name)
4. Run: python migration.py

Key principles:
- All migrations are IDEMPOTENT (safe to run multiple times)
- Check if column exists before adding
- Never delete data
- Use default values for new columns
- Log what was done
"""

import sqlite3
import sys
import json
import logging
from pathlib import Path
from typing import Callable, List, Tuple
from config import CHROMA_DIR

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Database path
DB_PATH = CHROMA_DIR / "annotations.db"


def get_table_columns(cursor, table_name: str) -> set:
    """Get all column names for a table"""
    try:
        cursor.execute(f"PRAGMA table_info({table_name})")
        return {row[1] for row in cursor.fetchall()}
    except sqlite3.OperationalError:
        return set()


def column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    return column_name in get_table_columns(cursor, table_name)


# ============================================================================
# MIGRATION FUNCTIONS
# ============================================================================


def migration_001_schema_from_models(cursor) -> str:
    """
    Auto-detect and apply schema from SQLAlchemy models.
    Creates tables and adds missing columns to match models.py
    """
    from models import Base

    expected_schema = {}

    # Extract schema from SQLAlchemy models
    for table_name, table in Base.metadata.tables.items():
        expected_schema[table_name] = {"columns": {}, "indexes": []}

        for column in table.columns:
            col_info = {
                "type": str(column.type),
                "nullable": column.nullable,
                "default": column.default,
                "primary_key": column.primary_key,
            }
            expected_schema[table_name]["columns"][column.name] = col_info

        for index in table.indexes:
            expected_schema[table_name]["indexes"].append(index.name)

    migrations_applied = []

    # Check existing tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {row[0] for row in cursor.fetchall()}

    # Process each expected table
    for table_name, table_schema in expected_schema.items():

        if table_name not in existing_tables:
            logger.info(
                f"Table '{table_name}' missing - will be created on next server start"
            )
            continue

        # Check for missing columns
        existing_columns = get_table_columns(cursor, table_name)
        expected_columns = set(table_schema["columns"].keys())
        missing_columns = expected_columns - existing_columns

        for column_name in missing_columns:
            col_info = table_schema["columns"][column_name]
            col_type = col_info["type"]

            # Map SQLAlchemy types to SQLite types
            if "INTEGER" in col_type.upper():
                sql_type = "INTEGER"
            elif "FLOAT" in col_type.upper() or "NUMERIC" in col_type.upper():
                sql_type = "FLOAT"
            elif "TEXT" in col_type.upper():
                sql_type = "TEXT"
            else:
                sql_type = "VARCHAR"

            # Build ALTER TABLE statement
            alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}"

            # Add DEFAULT if specified
            if col_info["default"] is not None and not col_info["primary_key"]:
                default_val = col_info["default"]
                if hasattr(default_val, "arg"):
                    default_val = default_val.arg
                if isinstance(default_val, str):
                    alter_sql += f" DEFAULT '{default_val}'"
                else:
                    alter_sql += f" DEFAULT {default_val}"

            logger.info(f"Adding column '{column_name}' to '{table_name}'")
            cursor.execute(alter_sql)
            migrations_applied.append(f"Added {column_name} to {table_name}")

    return (
        f"Processed {len(migrations_applied)} column additions"
        if migrations_applied
        else "Schema up to date"
    )


def migration_002_judge_fields(cursor) -> str:
    """Add judge_status and judge_decision fields to annotations table"""
    if not column_exists(cursor, "annotations", "judge_status"):
        logger.info("Adding judge_status column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN judge_status TEXT DEFAULT 'pending'
        """
        )

    if not column_exists(cursor, "annotations", "judge_decision"):
        logger.info("Adding judge_decision column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN judge_decision TEXT
        """
        )

    return "Judge fields added/verified"


def migration_003_review_fields(cursor) -> str:
    """Add review_status, review_results, review_timestamp, and review_attempts fields"""
    added = []

    if not column_exists(cursor, "annotations", "review_status"):
        logger.info("Adding review_status column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_status TEXT DEFAULT 'pending'
        """
        )
        added.append("review_status")

    if not column_exists(cursor, "annotations", "review_results"):
        logger.info("Adding review_results column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_results TEXT
        """
        )
        added.append("review_results")

    if not column_exists(cursor, "annotations", "review_timestamp"):
        logger.info("Adding review_timestamp column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_timestamp TIMESTAMP
        """
        )
        added.append("review_timestamp")

    if not column_exists(cursor, "annotations", "review_attempts"):
        logger.info("Adding review_attempts column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_attempts INTEGER DEFAULT 0
        """
        )
        added.append("review_attempts")

    return f"Review fields added/verified: {len(added)} columns"


def migration_004_is_salient_field(cursor) -> str:
    """Add is_salient field to annotations table (marks pedagogically valuable moments)"""
    if not column_exists(cursor, "annotations", "is_salient"):
        logger.info("Adding is_salient column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN is_salient INTEGER DEFAULT 0
        """
        )
        return "is_salient field added"

    return "is_salient field already exists"


def migration_005_tagging_trigger_number(cursor) -> str:
    """Add tagging_trigger_number field to track how many times tagging has been triggered"""
    if not column_exists(cursor, "annotations", "tagging_trigger_number"):
        logger.info("Adding tagging_trigger_number column")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN tagging_trigger_number INTEGER DEFAULT 0
        """
        )
        return "tagging_trigger_number field added"

    return "tagging_trigger_number field already exists"


def migration_006_convert_tags_format(cursor) -> str:
    """
    Migrate tags from old format to new format.
    Old format: ["tag1", "tag2", "tag3"]
    New format: [{"name": "tag1", "category": "material"}, ...]
    """
    if not column_exists(cursor, "annotations", "tags"):
        return "tags column does not exist - skipping"

    # Get all annotations with tags
    cursor.execute(
        "SELECT id, tags FROM annotations WHERE tags IS NOT NULL AND tags != ''"
    )
    annotations = cursor.fetchall()

    if not annotations:
        return "No annotations with tags found"

    logger.info(f"Found {len(annotations)} annotations with tags - checking format")

    # Get all tags for category lookup
    cursor.execute("SELECT name, category FROM tags")
    tag_categories = {row[0]: row[1] for row in cursor.fetchall()}

    updated_count = 0
    already_migrated_count = 0

    for annotation_id, tags_json in annotations:
        try:
            tags = json.loads(tags_json)

            # Check if already in new format
            if isinstance(tags, list) and len(tags) > 0:
                if (
                    isinstance(tags[0], dict)
                    and "name" in tags[0]
                    and "category" in tags[0]
                ):
                    already_migrated_count += 1
                    continue

                # Old format - convert to new format
                if isinstance(tags[0], str):
                    new_tags = []
                    for tag_name in tags:
                        category = tag_categories.get(tag_name, None)
                        new_tags.append({"name": tag_name, "category": category})

                    new_tags_json = json.dumps(new_tags)
                    cursor.execute(
                        "UPDATE annotations SET tags = ? WHERE id = ?",
                        (new_tags_json, annotation_id),
                    )
                    updated_count += 1
                    logger.info(
                        f"Migrated annotation {annotation_id}: {len(new_tags)} tags"
                    )

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            logger.warning(f"Error processing annotation {annotation_id}: {e}")
            continue

    return f"Tags format migrated: {updated_count} updated, {already_migrated_count} already new format"


def migration_007_video_segments_table(cursor) -> str:
    """Create video_segments table for segmentation feature"""
    try:
        # Check if table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='video_segments'"
        )
        if cursor.fetchone():
            logger.info("video_segments table already exists")
            return "video_segments table already exists"
        
        # Create video_segments table
        cursor.execute("""
            CREATE TABLE video_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_video_id INTEGER NOT NULL,
                name TEXT,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                thumbnail_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        """)
        
        logger.info("Created video_segments table")
        return "Created video_segments table"
    
    except sqlite3.Error as e:
        logger.error(f"Error creating video_segments table: {e}")
        return f"Error: {e}"


# ============================================================================
# MIGRATION REGISTRY
# ============================================================================
# Add new migrations here in order. Each tuple is (migration_name, migration_function)
# Migration names must be unique and in order (migration_001, migration_002, etc.)
MIGRATIONS: List[Tuple[str, Callable]] = [
    ("001_schema_from_models", migration_001_schema_from_models),
    ("002_judge_fields", migration_002_judge_fields),
    ("003_review_fields", migration_003_review_fields),
    ("004_is_salient_field", migration_004_is_salient_field),
    ("005_tagging_trigger_number", migration_005_tagging_trigger_number),
    ("006_convert_tags_format", migration_006_convert_tags_format),
    ("007_video_segments_table", migration_007_video_segments_table),
]


# ============================================================================
# MIGRATION RUNNER
# ============================================================================


def run_migrations(db_path: Path = DB_PATH) -> bool:
    """
    Run all migrations in order.
    Each migration is idempotent - safe to run multiple times.
    """
    if not db_path.parent.exists():
        logger.info(f"Creating database directory: {db_path.parent}")
        db_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Checking database at: {db_path}")

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        logger.info(f"Running {len(MIGRATIONS)} migrations...")
        results = []

        for migration_name, migration_func in MIGRATIONS:
            try:
                logger.info(f"\n[{migration_name}]")
                result = migration_func(cursor)
                logger.info(f"  ✓ {result}")
                results.append((migration_name, True, result))

            except Exception as e:
                logger.error(f"  ✗ Failed: {e}")
                results.append((migration_name, False, str(e)))
                conn.rollback()
                return False

        # Commit all changes
        conn.commit()

        # Print summary
        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)

        successful = sum(1 for _, success, _ in results if success)
        logger.info(
            f"✓ {successful}/{len(MIGRATIONS)} migrations completed successfully"
        )

        for migration_name, success, result in results:
            status = "✓" if success else "✗"
            logger.info(f"  {status} {migration_name}")

        logger.info("=" * 60)

        return True

    except Exception as e:
        logger.error(f"\n✗ Migration error: {e}")
        return False

    finally:
        try:
            if conn is not None:
                conn.close()
        except:
            pass


def reset_database(db_path: Path = DB_PATH) -> bool:
    """
    DANGEROUS: Delete and recreate database from scratch.
    All data will be lost!
    """
    if db_path.exists():
        logger.warning(f"⚠️  DELETING DATABASE: {db_path}")
        logger.warning("⚠️  ALL DATA WILL BE LOST!")
        response = input("Type 'yes' to confirm: ")
        if response.lower() != "yes":
            logger.info("Operation cancelled")
            return False

        db_path.unlink()
        logger.info(f"Deleted {db_path}")

    logger.info("Running migrations on fresh database...")
    return run_migrations(db_path)


def check_migrations(db_path: Path = DB_PATH) -> bool:
    """Check what migrations would be applied without actually applying them"""
    logger.info(f"Checking migrations for: {db_path}")

    if not db_path.exists():
        logger.warning(f"Database does not exist: {db_path}")
        return False

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        logger.info(f"\nWould apply {len(MIGRATIONS)} migrations:\n")

        for migration_name, migration_func in MIGRATIONS:
            logger.info(f"[{migration_name}]")
            try:
                result = migration_func(cursor)
                logger.info(f"  {result}\n")
            except Exception as e:
                logger.warning(f"  Error checking: {e}\n")

        return True

    except Exception as e:
        logger.error(f"Error checking migrations: {e}")
        return False

    finally:
        try:
            if conn is not None:
                conn.close()
        except:
            pass


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description="Database migration tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python migration.py              # Run all migrations
  python migration.py --check      # Check without applying
  python migration.py --reset      # Reset database (CAUTION!)
        """,
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset database from scratch (CAUTION: data loss!)",
    )
    parser.add_argument(
        "--check", action="store_true", help="Check migrations without applying"
    )
    parser.add_argument(
        "--db", type=Path, default=DB_PATH, help=f"Database path (default: {DB_PATH})"
    )

    args = parser.parse_args()

    if args.reset:
        success = reset_database(args.db)
    elif args.check:
        success = check_migrations(args.db)
    else:
        success = run_migrations(args.db)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
