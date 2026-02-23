#!/usr/bin/env python3
"""
Database Consolidation - Phase 2: Data Migration Script
Migrates all data from SQLite (FastAPI backend) to Moodle PostgreSQL/MySQL database.

⚠️ WARNING: This is a ONE-WAY migration. Always backup first!

Usage:
    python migrate_to_moodle.py --backup    # Backup both databases first
    python migrate_to_moodle.py --validate  # Dry-run validation
    python migrate_to_moodle.py --migrate   # Execute migration
    python migrate_to_moodle.py --rollback  # Restore from backup

Prerequisites:
    1. Moodle upgrade.php migration completed (version 2026021902)
    2. Valid Moodle config.php with database credentials
    3. Python packages: psycopg2 OR pymysql, sqlite3
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# Database connection settings (configure these!)
SQLITE_PATH = Path(__file__).parent / "chroma_langchain_db" / "annotations.db"
BACKUP_DIR = Path(__file__).parent / "database_backups"
MOODLE_CONFIG_PATH = Path("/var/www/html/config.php")  # Fixed: correct Moodle config path

# Moodle table prefix (usually 'mdl_')
TABLE_PREFIX = 'mdl_'

# Statistics tracking
stats = {
    'projects_migrated': 0,
    'segments_migrated': 0,
    'tags_migrated': 0,
    'tasks_migrated': 0,
    'annotations_updated': 0,
    'videos_updated': 0,
    'errors': []
}


def parse_moodle_config() -> Dict[str, str]:
    """Extract database credentials from Moodle config.php"""
    if not MOODLE_CONFIG_PATH.exists():
        raise FileNotFoundError(f"Moodle config not found: {MOODLE_CONFIG_PATH}")
    
    config = {}
    with open(MOODLE_CONFIG_PATH, 'r') as f:
        for line in f:
            if '$CFG->dbtype' in line:
                config['dbtype'] = line.split("'")[1]
            elif '$CFG->dbhost' in line:
                config['dbhost'] = line.split("'")[1]
            elif '$CFG->dbname' in line:
                config['dbname'] = line.split("'")[1]
            elif '$CFG->dbuser' in line:
                config['dbuser'] = line.split("'")[1]
            elif '$CFG->dbpass' in line:
                config['dbpass'] = line.split("'")[1]
            elif '$CFG->prefix' in line:
                global TABLE_PREFIX
                TABLE_PREFIX = line.split("'")[1]
    
    return config


def get_moodle_connection(config: Dict[str, str]):
    """Create connection to Moodle database"""
    dbtype = config.get('dbtype', 'pgsql')
    
    if dbtype == 'pgsql':
        import psycopg2
        return psycopg2.connect(
            host=config['dbhost'],
            database=config['dbname'],
            user=config['dbuser'],
            password=config['dbpass']
        )
    elif dbtype in ['mysqli', 'mariadb']:  # Support both MySQL variants
        import pymysql
        return pymysql.connect(
            host=config['dbhost'],
            database=config['dbname'],
            user=config['dbuser'],
            password=config['dbpass'],
            cursorclass=pymysql.cursors.DictCursor
        )
    else:
        raise ValueError(f"Unsupported database type: {dbtype}")


def backup_databases():
    """Backup both SQLite and Moodle databases"""
    print("🔄 Creating database backups...")
    
    # Create backup directory with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / timestamp
    backup_path.mkdir(parents=True, exist_ok=True)
    
    # Backup SQLite
    if SQLITE_PATH.exists():
        sqlite_backup = backup_path / "annotations.db"
        shutil.copy2(SQLITE_PATH, sqlite_backup)
        print(f"✅ SQLite backed up to: {sqlite_backup}")
    else:
        print(f"⚠️ SQLite database not found: {SQLITE_PATH}")
    
    # Backup Moodle database (dump via pg_dump or mysqldump)
    config = parse_moodle_config()
    dbtype = config.get('dbtype', 'pgsql')
    
    if dbtype == 'pgsql':
        dump_file = backup_path / "moodle_videoelicit.sql"
        cmd = f"pg_dump -h {config['dbhost']} -U {config['dbuser']} -d {config['dbname']} " \
              f"-t '{TABLE_PREFIX}local_videoelicit_*' > {dump_file}"
        os.system(cmd)
        print(f"✅ Moodle tables backed up to: {dump_file}")
    elif dbtype in ['mysqli', 'mariadb']:  # Support both MySQL variants
        dump_file = backup_path / "moodle_videoelicit.sql"
        cmd = f"mysqldump -h {config['dbhost']} -u {config['dbuser']} -p{config['dbpass']} " \
              f"{config['dbname']} {TABLE_PREFIX}local_videoelicit_videos " \
              f"{TABLE_PREFIX}local_videoelicit_annotations {TABLE_PREFIX}local_videoelicit_segments " \
              f"{TABLE_PREFIX}local_videoelicit_projects {TABLE_PREFIX}local_videoelicit_tags " \
              f"{TABLE_PREFIX}local_videoelicit_tasks > {dump_file}"
        os.system(cmd)
        print(f"✅ Moodle tables backed up to: {dump_file}")
    
    print(f"\n📁 Backup directory: {backup_path}")
    return backup_path


def validate_schemas():
    """Validate that Moodle schema matches SQLite expectations"""
    print("🔍 Validating database schemas...")
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Check that all required tables exist
    required_tables = [
        'local_videoelicit_videos',
        'local_videoelicit_annotations',
        'local_videoelicit_segments',
        'local_videoelicit_projects',
        'local_videoelicit_tags',
        'local_videoelicit_tasks'
    ]
    
    for table in required_tables:
        full_table = f"{TABLE_PREFIX}{table}"
        moodle_cur.execute(f"SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '{full_table}'")
        exists = moodle_cur.fetchone()['count'] > 0
        
        if not exists:
            print(f"❌ Missing table: {full_table}")
            print("   Run Moodle upgrade first! Visit: Site administration > Notifications")
            sys.exit(1)
        else:
            print(f"✅ Table exists: {full_table}")
    
    moodle_conn.close()
    print("✅ Schema validation passed\n")


def migrate_projects():
    """Migrate projects from SQLite to Moodle"""
    print("📦 Migrating projects...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all projects from SQLite (note: SQLite doesn't have user_id, we'll use default)
    sqlite_cur.execute("SELECT id, name, description, created_at, updated_at FROM projects")
    projects = sqlite_cur.fetchall()
    
    if not projects:
        print("  No projects to migrate")
        return {}
    
    # Map old IDs to new IDs
    id_mapping = {}
    
    for old_id, name, description, created_at, updated_at in projects:
        user_id = 2  # Default to admin user (Moodle userid 2)
        # Convert timestamps to Unix
        created_unix = int(datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp())
        updated_unix = int(datetime.fromisoformat(updated_at.replace('Z', '+00:00')).timestamp())
        
        # Insert into Moodle
        if config.get('dbtype') == 'pgsql':
            moodle_cur.execute(
                f"INSERT INTO {TABLE_PREFIX}local_videoelicit_projects "
                f"(name, description, userid, timecreated, timemodified) "
                f"VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (name, description, user_id or 0, created_unix, updated_unix)
            )
            new_id = moodle_cur.fetchone()[0]
        else:  # MySQL
            moodle_cur.execute(
                f"INSERT INTO {TABLE_PREFIX}local_videoelicit_projects "
                f"(name, description, userid, timecreated, timemodified) "
                f"VALUES (%s, %s, %s, %s, %s)",
                (name, description, user_id or 0, created_unix, updated_unix)
            )
            new_id = moodle_cur.lastrowid
        
        id_mapping[old_id] = new_id
        stats['projects_migrated'] += 1
        print(f"  ✓ Migrated project: {name} (ID {old_id} → {new_id})")
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()
    
    return id_mapping


def migrate_segments():
    """Migrate video segments from SQLite to Moodle"""
    print("\n🎬 Migrating video segments...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all segments from SQLite
    sqlite_cur.execute(
        "SELECT id, parent_video_id, name, start_time, end_time, thumbnail_path, created_at, updated_at "
        "FROM video_segments"
    )
    segments = sqlite_cur.fetchall()
    
    if not segments:
        print("  No segments to migrate")
        return
    
    for old_id, parent_video_id, name, start_time, end_time, thumbnail_path, created_at, updated_at in segments:
        # Convert timestamps to Unix
        created_unix = int(datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp())
        updated_unix = int(datetime.fromisoformat(updated_at.replace('Z', '+00:00')).timestamp())
        
        # Insert into Moodle
        moodle_cur.execute(
            f"INSERT INTO {TABLE_PREFIX}local_videoelicit_segments "
            f"(videoid, name, starttime, endtime, thumbnailpath, timecreated, timemodified) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (parent_video_id, name, start_time, end_time, thumbnail_path, created_unix, updated_unix)
        )
        
        stats['segments_migrated'] += 1
        print(f"  ✓ Migrated segment: {name or 'Unnamed'} (Video {parent_video_id})")
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()


def migrate_tags():
    """Migrate tags from SQLite to Moodle"""
    print("\n🏷️  Migrating tags...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all tags from SQLite
    sqlite_cur.execute(
        "SELECT name, category, usage_count, created_at, updated_at FROM tags"
    )
    tags = sqlite_cur.fetchall()
    
    if not tags:
        print("  No tags to migrate")
        return
    
    for name, category, usage_count, created_at, updated_at in tags:
        # Convert timestamps to Unix
        created_unix = int(datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp())
        updated_unix = int(datetime.fromisoformat(updated_at.replace('Z', '+00:00')).timestamp())
        
        # Insert into Moodle (or update if exists)
        moodle_cur.execute(
            f"SELECT id FROM {TABLE_PREFIX}local_videoelicit_tags WHERE name = %s AND category = %s",
            (name, category)
        )
        existing = moodle_cur.fetchone()
        
        if existing:
            # Update usage count
            moodle_cur.execute(
                f"UPDATE {TABLE_PREFIX}local_videoelicit_tags "
                f"SET usagecount = %s, timemodified = %s WHERE id = %s",
                (usage_count, updated_unix, existing[0])
            )
            print(f"  ✓ Updated tag: {name} ({category})")
        else:
            # Insert new tag
            moodle_cur.execute(
                f"INSERT INTO {TABLE_PREFIX}local_videoelicit_tags "
                f"(name, category, usagecount, timecreated, timemodified) "
                f"VALUES (%s, %s, %s, %s, %s)",
                (name, category, usage_count, created_unix, updated_unix)
            )
            print(f"  ✓ Migrated tag: {name} ({category})")
        
        stats['tags_migrated'] += 1
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()


def migrate_tasks():
    """Migrate tasks taxonomy from SQLite to Moodle"""
    print("\n📋 Migrating tasks...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all tasks from SQLite
    sqlite_cur.execute(
        "SELECT name, craft, description, is_published, created_at, updated_at FROM tasks"
    )
    tasks = sqlite_cur.fetchall()
    
    if not tasks:
        print("  No tasks to migrate")
        return
    
    for name, craft, description, is_published, created_at, updated_at in tasks:
        # Convert timestamps to Unix
        created_unix = int(datetime.fromisoformat(created_at.replace('Z', '+00:00')).timestamp())
        updated_unix = int(datetime.fromisoformat(updated_at.replace('Z', '+00:00')).timestamp())
        
        # Insert into Moodle (or update if exists)
        moodle_cur.execute(
            f"SELECT id FROM {TABLE_PREFIX}local_videoelicit_tasks WHERE name = %s AND craft = %s",
            (name, craft)
        )
        existing = moodle_cur.fetchone()
        
        if existing:
            # Update existing task
            moodle_cur.execute(
                f"UPDATE {TABLE_PREFIX}local_videoelicit_tasks "
                f"SET description = %s, ispublished = %s, timemodified = %s WHERE id = %s",
                (description, is_published, updated_unix, existing[0])
            )
            print(f"  ✓ Updated task: {name} ({craft})")
        else:
            # Insert new task
            moodle_cur.execute(
                f"INSERT INTO {TABLE_PREFIX}local_videoelicit_tasks "
                f"(name, craft, description, ispublished, timecreated, timemodified) "
                f"VALUES (%s, %s, %s, %s, %s, %s)",
                (name, craft, description, is_published, created_unix, updated_unix)
            )
            print(f"  ✓ Migrated task: {name} ({craft})")
        
        stats['tasks_migrated'] += 1
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()


def migrate_annotation_ai_fields():
    """Copy AI pipeline results from SQLite annotations to Moodle annotations"""
    print("\n🤖 Migrating AI pipeline results...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all annotations with AI results from SQLite
    sqlite_cur.execute(
        "SELECT id, judge_status, judge_decision, tagging_status, tags, "
        "review_status, review_results, detected_task, is_salient "
        "FROM annotations WHERE judge_status != 'pending' OR tagging_status != 'pending'"
    )
    annotations = sqlite_cur.fetchall()
    
    if not annotations:
        print("  No AI results to migrate")
        return
    
    for ann_id, judge_status, judge_decision, tagging_status, tags, \
        review_status, review_results, detected_task, is_salient in annotations:
        
        # Update Moodle annotation with AI fields
        try:
            moodle_cur.execute(
                f"UPDATE {TABLE_PREFIX}local_videoelicit_annotations "
                f"SET judge_status = %s, judge_decision = %s, tagging_status = %s, tags = %s, "
                f"review_status = %s, review_results = %s, detected_task = %s, is_salient = %s "
                f"WHERE id = %s",
                (judge_status, judge_decision, tagging_status, tags,
                 review_status, review_results, detected_task, is_salient or 0, ann_id)
            )
            stats['annotations_updated'] += 1
            print(f"  ✓ Updated annotation {ann_id} with AI results")
        except Exception as e:
            stats['errors'].append(f"Annotation {ann_id}: {str(e)}")
            print(f"  ✗ Error updating annotation {ann_id}: {e}")
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()


def migrate_video_project_links(project_id_mapping: Dict[int, int]):
    """Update video project references with new Moodle project IDs"""
    print("\n🔗 Migrating video-project links...")
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_cur = sqlite_conn.cursor()
    
    config = parse_moodle_config()
    moodle_conn = get_moodle_connection(config)
    moodle_cur = moodle_conn.cursor()
    
    # Get all videos with project assignments from SQLite
    sqlite_cur.execute("SELECT id, project_id FROM videos WHERE project_id IS NOT NULL")
    videos = sqlite_cur.fetchall()
    
    if not videos:
        print("  No video-project links to migrate")
        return
    
    for video_id, old_project_id in videos:
        new_project_id = project_id_mapping.get(old_project_id)
        
        if new_project_id:
            moodle_cur.execute(
                f"UPDATE {TABLE_PREFIX}local_videoelicit_videos "
                f"SET projectid = %s WHERE id = %s",
                (new_project_id, video_id)
            )
            stats['videos_updated'] += 1
            print(f"  ✓ Linked video {video_id} to project {new_project_id}")
        else:
            stats['errors'].append(f"Video {video_id}: Project {old_project_id} not found in mapping")
    
    moodle_conn.commit()
    moodle_conn.close()
    sqlite_conn.close()


def print_summary():
    """Print migration statistics"""
    print("\n" + "="*60)
    print("📊 MIGRATION SUMMARY")
    print("="*60)
    print(f"✅ Projects migrated:       {stats['projects_migrated']}")
    print(f"✅ Segments migrated:       {stats['segments_migrated']}")
    print(f"✅ Tags migrated:           {stats['tags_migrated']}")
    print(f"✅ Tasks migrated:          {stats['tasks_migrated']}")
    print(f"✅ Annotations updated:     {stats['annotations_updated']}")
    print(f"✅ Videos updated:          {stats['videos_updated']}")
    
    if stats['errors']:
        print(f"\n⚠️  Errors encountered:     {len(stats['errors'])}")
        for error in stats['errors'][:10]:  # Show first 10 errors
            print(f"   - {error}")
        if len(stats['errors']) > 10:
            print(f"   ... and {len(stats['errors']) - 10} more")
    
    print("="*60)


def main():
    parser = argparse.ArgumentParser(description="Migrate data from SQLite to Moodle database")
    parser.add_argument('--backup', action='store_true', help="Backup databases before migration")
    parser.add_argument('--validate', action='store_true', help="Validate schemas without migrating")
    parser.add_argument('--migrate', action='store_true', help="Execute full migration")
    parser.add_argument('--rollback', action='store_true', help="Restore from latest backup")
    
    args = parser.parse_args()
    
    if not any([args.backup, args.validate, args.migrate, args.rollback]):
        parser.print_help()
        sys.exit(1)
    
    if args.backup:
        backup_path = backup_databases()
        print(f"\n✅ Backups complete: {backup_path}")
    
    if args.validate:
        validate_schemas()
        print("✅ Validation complete")
    
    if args.migrate:
        print("🚀 Starting database migration...")
        print("⚠️  WARNING: This is a ONE-WAY migration!")
        
        response = input("\nDo you want to continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Migration cancelled")
            sys.exit(0)
        
        # Execute migration steps
        validate_schemas()
        project_id_mapping = migrate_projects()
        migrate_segments()
        migrate_tags()
        migrate_tasks()
        migrate_annotation_ai_fields()
        migrate_video_project_links(project_id_mapping)
        
        print_summary()
        
        print("\n✅ Migration complete!")
        print("⚠️  Next steps:")
        print("   1. Test the Moodle plugin thoroughly")
        print("   2. Verify all data migrated correctly")
        print("   3. If everything works, you can delete SQLite database")
        print("   4. Update FastAPI backend to use Moodle database (Phase 3)")
    
    if args.rollback:
        print("🔄 Rollback functionality not yet implemented")
        print("   Manually restore from backup directory:")
        print(f"   {BACKUP_DIR}")


if __name__ == '__main__':
    main()
