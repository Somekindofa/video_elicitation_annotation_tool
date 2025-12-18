"""
Database migration script for Video Elicitation Annotation Tool
Automatically adds missing columns to existing database tables

This script auto-detects schema from models.py and applies migrations.

HOW TO USE:
1. Add new columns to your models in models.py
2. Run this script (or restart server via start.bat)
3. Script auto-detects and adds missing columns

Example:
  - Add: craft = Column(String, default="glassblowing") to Annotation model
  - Run: python migrate_db.py
  - Output: "Adding column 'craft' to 'annotations'..."

No hardcoded columns - everything is derived from SQLAlchemy models!
"""

import sqlite3
import sys
from pathlib import Path
from config import CHROMA_DIR
from models import Base

# Use the same DB path as runtime (config.DATABASE_URL -> CHROMA_DIR/annotations.db)
DB_PATH = CHROMA_DIR / "annotations.db"


def get_table_columns(cursor, table_name):
    """Get all column names for a table"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cursor.fetchall()}


def get_expected_schema():
    """Extract expected schema from SQLAlchemy models"""
    schema = {}

    for table_name, table in Base.metadata.tables.items():
        schema[table_name] = {"columns": {}, "indexes": []}

        for column in table.columns:
            col_info = {
                "type": str(column.type),
                "nullable": column.nullable,
                "default": column.default,
                "primary_key": column.primary_key,
            }
            schema[table_name]["columns"][column.name] = col_info

        for index in table.indexes:
            schema[table_name]["indexes"].append(index.name)

    return schema


def migrate_database():
    """Apply database migrations to match current schema from models.py"""
    print(f"Checking database at: {DB_PATH}")

    # Ensure database directory exists
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)

    # Get expected schema from models
    expected_schema = get_expected_schema()

    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    migrations_applied = []

    try:
        # Check if tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cursor.fetchall()}

        # Iterate through expected tables from models
        for table_name, table_schema in expected_schema.items():

            # Create table if it doesn't exist
            if table_name not in existing_tables:
                print(
                    f"Table '{table_name}' missing - will be created on next server start"
                )
                # Note: We don't create tables here, let SQLAlchemy do that via init_db()
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
                alter_sql = (
                    f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}"
                )

                # Add DEFAULT if specified and not primary key
                if col_info["default"] is not None and not col_info["primary_key"]:
                    default_val = col_info["default"]
                    if hasattr(default_val, "arg"):
                        default_val = default_val.arg
                    if isinstance(default_val, str):
                        alter_sql += f" DEFAULT '{default_val}'"
                    else:
                        alter_sql += f" DEFAULT {default_val}"

                print(f"Adding column '{column_name}' to '{table_name}'...")
                cursor.execute(alter_sql)
                migrations_applied.append(f"Added {column_name} to {table_name}")

        # Commit all changes
        conn.commit()

        if migrations_applied:
            print("\n✓ Migrations completed successfully:")
            for migration in migrations_applied:
                print(f"  - {migration}")
        else:
            print("✓ Database schema is up to date - no migrations needed")

        return True

    except Exception as e:
        print(f"\n✗ Migration error: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    success = migrate_database()
    sys.exit(0 if success else 1)
