# Database Consolidation - Execution Plan (TODAY)

**Date**: February 19, 2026  
**Risk Level**: 🔴 **HIGH RISK** - Data loss possible if not followed carefully  
**Estimated Time**: 2-4 hours  
**Rollback Available**: Yes (if backups taken)

---

## ⚠️ CRITICAL WARNINGS

1. **This compresses a 9-week plan into 1 day** - expect issues
2. **Data loss is possible** - backups are MANDATORY
3. **No automated rollback** - manual restore required if failure
4. **Test environment recommended** - but you're doing this in production
5. **Downtime required** - users cannot access system during migration

---

## Pre-Migration Checklist

- [ ] **BACKUP BOTH DATABASES** (see Step 1 below)
- [ ] Verify Moodle is accessible at /var/www/html/public
- [ ] Verify SQLite database exists at `/opt/video_elicitation_annotation_tool/chroma_langchain_db/annotations.db`
- [ ] Python packages installed: `psycopg2` OR `pymysql` (depending on Moodle DB type)
- [ ] FastAPI backend is STOPPED (no writes during migration)
- [ ] All users notified of maintenance window

---

## Step-by-Step Execution

### Step 1: Backup Everything (MANDATORY)

```bash
cd /opt/video_elicitation_annotation_tool

# Backup SQLite database
python migrate_to_moodle.py --backup

# Verify backup was created
ls -lh database_backups/
```

**Expected Output**: New timestamped directory with `annotations.db` and `moodle_videoelicit.sql`

**If backup fails**: STOP. Do not proceed without backups.

---

### Step 2: Run Moodle Database Migration

1. **Navigate to Moodle admin**:
   ```
   https://your-moodle-site/admin/index.php
   ```

2. **Moodle will detect plugin upgrade** (version 2026021902)

3. **Click "Upgrade Moodle database now"**

4. **Verify tables were created**:
   ```bash
   # PostgreSQL
   psql -U moodle_user -d moodle_db -c "\dt mdl_local_videoelicit_*"
   
   # MySQL
   mysql -u moodle_user -p -D moodle_db -e "SHOW TABLES LIKE 'mdl_local_videoelicit_%'"
   ```

**Expected Output**: 6 tables listed:
- `mdl_local_videoelicit_videos`
- `mdl_local_videoelicit_annotations`
- `mdl_local_videoelicit_segments`
- `mdl_local_videoelicit_projects`
- `mdl_local_videoelicit_tags`
- `mdl_local_videoelicit_tasks`

**If tables missing**: Check Moodle error logs at `/var/www/html/public/admin/tool/log/index.php`

---

### Step 3: Validate Schema Compatibility

```bash
cd /opt/video_elicitation_annotation_tool
python migrate_to_moodle.py --validate
```

**Expected Output**:
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

**If validation fails**: Fix schema issues before proceeding. Check `/var/www/html/public/local/videoelicit/db/upgrade.php` was applied correctly.

---

### Step 4: Configure Migration Script

**Edit `migrate_to_moodle.py` if needed**:

1. Verify `MOODLE_CONFIG_PATH`:
   ```python
   MOODLE_CONFIG_PATH = Path("/var/www/html/public/config.php")
   ```

2. Verify `SQLITE_PATH`:
   ```python
   SQLITE_PATH = Path(__file__).parent / "chroma_langchain_db" / "annotations.db"
   ```

3. Check Moodle table prefix in `/var/www/html/public/config.php`:
   ```php
   $CFG->prefix = 'mdl_';  // Usually 'mdl_' but could be different
   ```

---

### Step 5: Execute Data Migration

```bash
cd /opt/video_elicitation_annotation_tool
python migrate_to_moodle.py --migrate
```

**You will be prompted**:
```
⚠️  WARNING: This is a ONE-WAY migration!
Do you want to continue? (yes/no):
```

Type `yes` and press Enter.

**Migration will run in this order**:
1. **Projects** (SQLite → Moodle, ID mapping created)
2. **Segments** (SQLite → Moodle, linked to parent videos)
3. **Tags** (SQLite → Moodle, unique by name+category)
4. **Tasks** (SQLite → Moodle, unique by name+craft)
5. **Annotation AI Fields** (judge, tagging, review results copied)
6. **Video-Project Links** (project IDs updated with mapping)

**Expected Duration**: 5-30 minutes depending on data size

---

### Step 6: Verify Migration Success

**Check migration summary output**:
```
📊 MIGRATION SUMMARY
==============================================================
✅ Projects migrated:       X
✅ Segments migrated:       X
✅ Tags migrated:           X
✅ Tasks migrated:          X
✅ Annotations updated:     X
✅ Videos updated:          X
==============================================================
```

**If errors reported**:
- Review error messages (first 10 shown)
- Check if errors are critical (missing records) or warnings (duplicates skipped)
- Consider rollback if too many errors

**Manual verification queries**:

```bash
# Check projects migrated
psql -U moodle_user -d moodle_db -c "SELECT COUNT(*) FROM mdl_local_videoelicit_projects;"

# Check segments migrated
psql -U moodle_user -d moodle_db -c "SELECT COUNT(*) FROM mdl_local_videoelicit_segments;"

# Check tags migrated
psql -U moodle_user -d moodle_db -c "SELECT COUNT(*) FROM mdl_local_videoelicit_tags;"

# Check tasks migrated
psql -U moodle_user -d moodle_db -c "SELECT COUNT(*) FROM mdl_local_videoelicit_tasks;"

# Check annotations with AI results
psql -U moodle_user -d moodle_db -c "SELECT COUNT(*) FROM mdl_local_videoelicit_annotations WHERE judge_status != 'pending';"
```

**Compare counts with SQLite**:
```bash
sqlite3 chroma_langchain_db/annotations.db "SELECT COUNT(*) FROM projects;"
sqlite3 chroma_langchain_db/annotations.db "SELECT COUNT(*) FROM video_segments;"
sqlite3 chroma_langchain_db/annotations.db "SELECT COUNT(*) FROM tags;"
sqlite3 chroma_langchain_db/annotations.db "SELECT COUNT(*) FROM tasks;"
```

**If counts don't match**: Review migration errors, consider re-running specific steps.

---

### Step 7: Test Moodle Plugin Functionality

1. **Access plugin**:
   ```
   https://your-moodle-site/local/videoelicit/
   ```

2. **Test core functions**:
   - [ ] Load video list (should show all videos)
   - [ ] Select video for annotation
   - [ ] Create annotation with audio
   - [ ] View existing annotations with AI results
   - [ ] Check segments appear in video selector
   - [ ] Test project assignment to videos

3. **Check AI pipeline** (FastAPI still using SQLite at this point):
   - [ ] Create annotation
   - [ ] Verify transcription runs
   - [ ] Check judge decision appears
   - [ ] Verify tagging completes
   - [ ] Test review results

**If plugin errors occur**: Check Moodle error logs, verify data integrity.

---

## Rollback Procedure (If Migration Fails)

### Option A: Restore SQLite Only (Moodle unchanged)

```bash
cd /opt/video_elicitation_annotation_tool
cp database_backups/TIMESTAMP/annotations.db chroma_langchain_db/annotations.db
```

**FastAPI backend will continue working with SQLite.**

### Option B: Full Rollback (Restore Both Databases)

```bash
# Restore SQLite
cp database_backups/TIMESTAMP/annotations.db chroma_langchain_db/annotations.db

# Restore Moodle tables (PostgreSQL)
psql -U moodle_user -d moodle_db < database_backups/TIMESTAMP/moodle_videoelicit.sql

# Restore Moodle tables (MySQL)
mysql -u moodle_user -p -D moodle_db < database_backups/TIMESTAMP/moodle_videoelicit.sql
```

**Reset plugin version to force re-upgrade**:
```bash
# Edit /var/www/html/public/local/videoelicit/version.php
# Change: $plugin->version = 2026021902;
# To:     $plugin->version = 2026021600;

# Visit Moodle admin to trigger downgrade detection
# Then change back to 2026021902 and upgrade again
```

---

## Post-Migration Tasks (Phase 3 - Not Today)

These are **NOT** included in today's work:

1. **Update FastAPI to use Moodle DB** (requires Python adapter)
2. **Remove SQLite dependency** (delete old database)
3. **Update API routes** (change from SQLAlchemy to raw SQL)
4. **Connection pooling** (for production performance)
5. **Testing full AI pipeline** (with Moodle as source of truth)

**Recommendation**: Leave FastAPI on SQLite for now. Test Moodle plugin separately. Merge later when confident.

---

## What Could Go Wrong

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Moodle upgrade fails** | Tables not created | Check Moodle error logs, verify upgrade.php syntax |
| **Connection timeout** | Migration script hangs | Increase database timeout in Moodle config |
| **Duplicate key errors** | Migration aborts on unique constraint | Script handles this (skips duplicates), but check data |
| **Missing Python packages** | `ModuleNotFoundError: psycopg2` | Install: `pip install psycopg2-binary` or `pymysql` |
| **Permission denied** | Cannot read/write files | Check file permissions, run as correct user |
| **Data type mismatch** | `column "field" is type integer but expression is text` | Fix schema in upgrade.php, re-run migration |

---

## Success Criteria

✅ **Migration is successful if**:
1. All backup files created
2. Moodle tables exist with correct schema
3. Migration script completes without critical errors
4. Data counts match between SQLite and Moodle
5. Moodle plugin loads and displays videos/annotations
6. No data loss when viewing existing annotations

⚠️ **Acceptable issues** (can fix later):
- Minor errors on edge cases (null values, timestamps)
- Formatting differences (JSON fields)
- Performance slowness (add indexes later)

🔴 **Unacceptable issues** (requires rollback):
- Data loss (annotations missing)
- Broken AI pipeline (transcription fails)
- Moodle plugin crash (cannot load page)
- Database corruption (cannot query tables)

---

## Emergency Contacts

- **Moodle Errors**: Check `/var/www/html/public/error_log` or Moodle admin logs
- **Database Errors**: Check PostgreSQL logs at `/var/log/postgresql/` or MySQL logs
- **FastAPI Errors**: Check `backend/main.py` console output when running `python backend/main.py`

---

## Final Notes

**This is the risky path you chose (Option D)**. If you encounter issues:

1. **Don't panic** - backups exist
2. **Document errors** - take screenshots, copy error messages
3. **Rollback if needed** - better to retry tomorrow than corrupt data
4. **Test thoroughly** - don't skip verification steps

**Good luck!** 🍀
