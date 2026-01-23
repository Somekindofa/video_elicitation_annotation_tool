"""
Data migration script to convert tags from old format to new format

Old format: ["tag1", "tag2", "tag3"]
New format: [{"name": "tag1", "category": "material"}, {"name": "tag2", "category": "tool"}]

This script:
1. Reads all annotations with tags
2. Converts old format (list of strings) to new format (list of objects)
3. Looks up category from tags table if available, otherwise sets to null
4. Updates the annotations table
"""

import sqlite3
import json
from pathlib import Path
from config import CHROMA_DIR

DB_PATH = CHROMA_DIR / "annotations.db"


def migrate_tags():
    """Migrate tags from old format to new format"""
    print(f"Connecting to database: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Get all annotations with tags
        cursor.execute("SELECT id, tags FROM annotations WHERE tags IS NOT NULL AND tags != ''")
        annotations = cursor.fetchall()

        if not annotations:
            print("No annotations with tags found")
            return True

        print(f"Found {len(annotations)} annotations with tags")

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
                    if isinstance(tags[0], dict) and "name" in tags[0] and "category" in tags[0]:
                        already_migrated_count += 1
                        continue

                    # Old format - convert to new format
                    if isinstance(tags[0], str):
                        new_tags = []
                        for tag_name in tags:
                            # Look up category from tags table
                            category = tag_categories.get(tag_name, None)
                            new_tags.append({
                                "name": tag_name,
                                "category": category
                            })

                        # Update annotation
                        new_tags_json = json.dumps(new_tags)
                        cursor.execute(
                            "UPDATE annotations SET tags = ? WHERE id = ?",
                            (new_tags_json, annotation_id)
                        )
                        updated_count += 1
                        print(f"  [OK] Migrated annotation {annotation_id}: {len(new_tags)} tags")

            except (json.JSONDecodeError, KeyError, IndexError) as e:
                print(f"  [ERROR] Error processing annotation {annotation_id}: {e}")
                continue

        conn.commit()

        print(f"\n[SUCCESS] Migration completed:")
        print(f"  - {updated_count} annotations updated")
        print(f"  - {already_migrated_count} annotations already in new format")

        return True

    except Exception as e:
        print(f"\n[ERROR] Migration error: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    success = migrate_tags()
    sys.exit(0 if success else 1)
