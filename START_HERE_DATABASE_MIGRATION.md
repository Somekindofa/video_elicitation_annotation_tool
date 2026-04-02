# 🚀 Database Migration - Start Here

**Status**: ✅ **Code Ready** - Waiting for manual execution  
**Date**: February 19, 2026  
**Risk**: 🔴 **HIGH** - Follow instructions carefully

---

## What Was Prepared For You

✅ **Moodle Database Schema** extended with 4 new tables + AI pipeline fields  
✅ **Migration Script** created with backup/validate/migrate/rollback modes  
✅ **Execution Guide** with step-by-step checklist and troubleshooting  
✅ **Rollback Procedures** documented for emergency recovery

---

## Quick Start (3 Commands)

```bash
cd /opt/video_elicitation_annotation_tool

# 1. Backup everything (MANDATORY - takes 2-5 minutes)
python migrate_to_moodle.py --backup

# 2. Validate schema (dry-run, takes 10 seconds)
python migrate_to_moodle.py --validate

# 3. Execute migration (ONE-WAY, takes 5-30 minutes)
python migrate_to_moodle.py --migrate
```

---

## Prerequisites Checklist

Before running commands above:

- [ ] **Stop FastAPI backend** (no writes during migration)
   ```bash
   # If running in terminal, press Ctrl+C
   # Or: systemctl stop videoelicit-backend
   ```

- [ ] **Verify Python packages installed**:
   ```bash
   pip install psycopg2-binary  # For PostgreSQL
   # OR
   pip install pymysql          # For MySQL
   ```

- [ ] **Verify Moodle is accessible**:
   - Visit: https://your-moodle-site/admin/index.php
   - You should see "Updates available" notification

- [ ] **Run Moodle upgrade first**:
   - Click "Upgrade Moodle database now" in admin
   - Wait for completion message
   - **This creates the new tables** (segments, projects, tags, tasks)

- [ ] **Notify users of maintenance window** (1-2 hours downtime)

---

## Detailed Execution Guide

📖 **Read this before executing**: [`MIGRATION_EXECUTION_PLAN.md`](MIGRATION_EXECUTION_PLAN.md)

This 350-line guide contains:
- Pre-migration checklist (everything you need)
- Step-by-step execution (7 detailed steps)
- Verification queries (SQLite vs Moodle counts)
- Rollback procedures (if things go wrong)
- Troubleshooting table (common issues + solutions)
- Success criteria (how to know if migration worked)

---

## What Happens During Migration

**Phase 1: Backup** (2-5 minutes)
- SQLite database copied to `database_backups/TIMESTAMP/`
- Moodle tables dumped to SQL file
- **CRITICAL**: Do not skip this step!

**Phase 2: Validation** (10 seconds)
- Checks all Moodle tables exist
- Verifies schema matches expectations
- **No data modified** - safe to run anytime

**Phase 3: Migration** (5-30 minutes depending on data size)
1. Projects: SQLite → Moodle (ID mapping created)
2. Segments: SQLite → Moodle (linked to parent videos)
3. Tags: SQLite → Moodle (duplicates merged)
4. Tasks: SQLite → Moodle (duplicates merged)
5. Annotation AI Fields: Judge/tagging/review results copied
6. Video-Project Links: Project IDs updated with mapping

**Phase 4: Verification** (manual)
- Compare counts between SQLite and Moodle
- Test Moodle plugin functionality
- Check AI pipeline still works

---

## Expected Output

### Backup Command
```
🔄 Creating database backups...
✅ SQLite backed up to: database_backups/20260219_143052/annotations.db
✅ Moodle tables backed up to: database_backups/20260219_143052/moodle_videoelicit.sql

📁 Backup directory: database_backups/20260219_143052
```

### Validation Command
```
🔍 Validating database schemas...
✅ Table exists: mdl_local_videoelicit_videos
✅ Table exists: mdl_local_videoelicit_annotations
✅ Table exists: mdl_local_videoelicit_segments
✅ Table exists: mdl_local_videoelicit_projects
✅ Table exists: mdl_local_videoelicit_tags
✅ Table exists: mdl_local_videoelicit_tasks
✅ Schema validation passed
```

### Migration Command
```
🚀 Starting database migration...
⚠️  WARNING: This is a ONE-WAY migration!

Do you want to continue? (yes/no): yes

📦 Migrating projects...
  ✓ Migrated project: Research Dataset (ID 1 → 15)
  ✓ Migrated project: Teaching Demos (ID 2 → 16)

🎬 Migrating video segments...
  ✓ Migrated segment: Segment 1 (Video 5)
  ✓ Migrated segment: Segment 2 (Video 5)

🏷️  Migrating tags...
  ✓ Migrated tag: pince_brucelles (tool)
  ✓ Migrated tag: argent (material)

📋 Migrating tasks...
  ✓ Migrated task: sertissage (jewelry)

🤖 Migrating AI pipeline results...
  ✓ Updated annotation 23 with AI results
  ✓ Updated annotation 45 with AI results

🔗 Migrating video-project links...
  ✓ Linked video 5 to project 15

============================================================
📊 MIGRATION SUMMARY
============================================================
✅ Projects migrated:       2
✅ Segments migrated:       2
✅ Tags migrated:           25
✅ Tasks migrated:          8
✅ Annotations updated:     47
✅ Videos updated:          3
============================================================

✅ Migration complete!
```

---

## If Migration Fails

**DON'T PANIC** - Backups exist!

1. **Read error messages carefully**
2. **Document errors** (screenshot or copy/paste)
3. **Check troubleshooting table** in MIGRATION_EXECUTION_PLAN.md
4. **Rollback if needed** (see below)

### Quick Rollback

```bash
# Find your backup timestamp
ls -lh database_backups/

# Restore SQLite only (FastAPI continues working)
cp database_backups/TIMESTAMP/annotations.db chroma_langchain_db/annotations.db

# Restart FastAPI backend
cd backend && python main.py
```

**System will work as before (dual database).**

---

## After Successful Migration

✅ **Moodle plugin should work** with all data visible  
✅ **FastAPI still uses SQLite** (Phase 3 work required to switch)  
⚠️ **Don't delete SQLite yet** - wait until Phase 3 complete  
⚠️ **Test thoroughly** before declaring success

**Testing checklist**:
- [ ] Load videos in Moodle plugin
- [ ] View annotations with AI results
- [ ] Check segments appear in video selector
- [ ] Test creating new annotation (FastAPI still on SQLite)
- [ ] Verify projects show in UI
- [ ] Compare counts: SQLite vs Moodle (should match)

---

## What's NOT Included Today

These require **Phase 3 work** (future):

❌ FastAPI adapter for Moodle DB (needs new code)  
❌ Connection pooling (performance optimization)  
❌ Removing SQLite dependency (after testing)  
❌ API route refactoring (SQLAlchemy → raw SQL)

**Current state after migration**: Dual database architecture (data copied but FastAPI still on SQLite)

---

## Documentation Files

1. **START_HERE_DATABASE_MIGRATION.md** (this file) - Quick start guide
2. **MIGRATION_EXECUTION_PLAN.md** - Detailed execution steps with troubleshooting
3. **guides/DATABASE_CONSOLIDATION_IMPLEMENTATION.md** - Technical implementation summary
4. **guides/DATABASE_CONSOLIDATION_OPTION_A.md** - Original 9-week plan (reference)

---

## Emergency Contact

If you get stuck:

1. Check Moodle error logs: `/var/www/html/public/admin/tool/log/index.php`
2. Check database logs: `/var/log/postgresql/` or `/var/log/mysql/`
3. Check FastAPI logs: Console output when running `python backend/main.py`
4. Review troubleshooting table in MIGRATION_EXECUTION_PLAN.md

---

## Ready to Proceed?

1. ✅ Read MIGRATION_EXECUTION_PLAN.md (full details)
2. ✅ Complete prerequisites checklist above
3. ✅ Run Moodle upgrade first (creates tables)
4. ✅ Run backup command (MANDATORY)
5. ✅ Run validation command (dry-run)
6. ✅ Run migration command (ONE-WAY)
7. ✅ Verify data integrity (compare counts)
8. ✅ Test Moodle plugin functionality

**Good luck!** 🍀

---

**Last Updated**: February 19, 2026  
**Status**: 🟡 Awaiting manual execution by user  
**Next Action**: `python migrate_to_moodle.py --backup`
