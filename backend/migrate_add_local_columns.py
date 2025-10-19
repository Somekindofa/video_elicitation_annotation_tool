"""
Migration: Add is_local and source_type columns to videos table

Run this script to add the new columns needed for local video streaming feature.
"""

import sqlite3
import sys
from pathlib import Path

# Get database path
DB_PATH = Path(__file__).parent.parent / "data" / "annotations.db"

def migrate():
    """Add is_local and source_type columns to videos table"""
    
    if not DB_PATH.exists():
        print(f"❌ Database not found at: {DB_PATH}")
        print("   The database will be created automatically when you start the server.")
        return
    
    print(f"📂 Database: {DB_PATH}")
    print("🔄 Starting migration...")
    
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(videos)")
        columns = [row[1] for row in cursor.fetchall()]
        
        needs_is_local = "is_local" not in columns
        needs_source_type = "source_type" not in columns
        
        if not needs_is_local and not needs_source_type:
            print("✅ Migration already applied - columns exist!")
            return
        
        # Add is_local column if needed
        if needs_is_local:
            print("   Adding 'is_local' column...")
            cursor.execute("""
                ALTER TABLE videos 
                ADD COLUMN is_local INTEGER DEFAULT 0
            """)
            print("   ✅ Added is_local column")
        else:
            print("   ✓ is_local column already exists")
        
        # Add source_type column if needed
        if needs_source_type:
            print("   Adding 'source_type' column...")
            cursor.execute("""
                ALTER TABLE videos 
                ADD COLUMN source_type TEXT DEFAULT 'uploaded'
            """)
            print("   ✅ Added source_type column")
        else:
            print("   ✓ source_type column already exists")
        
        conn.commit()
        
        # Verify columns were added
        cursor.execute("PRAGMA table_info(videos)")
        columns = [row[1] for row in cursor.fetchall()]
        
        print("\n📋 Current videos table schema:")
        cursor.execute("PRAGMA table_info(videos)")
        for row in cursor.fetchall():
            col_id, name, col_type, not_null, default, pk = row
            print(f"   - {name} ({col_type})" + (f" DEFAULT {default}" if default else ""))
        
        if "is_local" in columns and "source_type" in columns:
            print("\n✅ Migration completed successfully!")
            print("\n🚀 You can now start the server and use local video streaming.")
        else:
            print("\n❌ Migration failed - columns not found after adding them")
            sys.exit(1)
        
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    print("=" * 70)
    print("DATABASE MIGRATION: Add Local Video Support")
    print("=" * 70)
    print()
    
    migrate()
    
    print()
    print("=" * 70)
    print("Next steps:")
    print("1. Start the server: start.bat")
    print("2. Click 'Browse Local Folder' in the web interface")
    print("3. Register your 11GB video instantly!")
    print("=" * 70)
