"""
Database migration script to add Project table and update Video table
Run this script to migrate existing database to support Projects feature
"""
import sqlite3
import sys
from pathlib import Path

# Get the database path
DB_PATH = Path(__file__).parent.parent / "data" / "annotations.db"

def migrate_database():
    """Add Project table and update Video table"""
    print(f"Migrating database at: {DB_PATH}")
    
    if not DB_PATH.exists():
        print("Database does not exist. It will be created when you start the server.")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Check if projects table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        projects_exists = cursor.fetchone() is not None
        
        migrations_needed = []
        
        if not projects_exists:
            migrations_needed.append((
                "CREATE TABLE projects",
                """CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )"""
            ))
        
        # Check if videos table has project_id column
        cursor.execute("PRAGMA table_info(videos)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'project_id' not in columns:
            migrations_needed.append((
                "ALTER TABLE videos ADD COLUMN project_id",
                "ALTER TABLE videos ADD COLUMN project_id INTEGER"
            ))
        
        if 'batch_position' not in columns:
            migrations_needed.append((
                "ALTER TABLE videos ADD COLUMN batch_position",
                "ALTER TABLE videos ADD COLUMN batch_position INTEGER"
            ))
        
        if not migrations_needed:
            print("✓ Database is already up to date!")
            return
        
        # Execute migrations
        print(f"\nApplying {len(migrations_needed)} migration(s)...")
        for i, (description, sql) in enumerate(migrations_needed, 1):
            print(f"  {i}. {description}")
            cursor.execute(sql)
        
        conn.commit()
        print("\n✓ Migration completed successfully!")
        print("\nNew features added:")
        print("  - projects table (id, name, description, timestamps)")
        print("  - videos.project_id (link video to project)")
        print("  - videos.batch_position (order videos in batch)")
        
    except sqlite3.Error as e:
        print(f"✗ Error during migration: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Projects Feature - Database Migration")
    print("=" * 60)
    migrate_database()
    print("\nYou can now start the server.")
    print("=" * 60)
