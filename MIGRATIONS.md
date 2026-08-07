# Database Migration System

## Overview
This project uses an **auto-detecting migration script** that reads your SQLAlchemy models and automatically updates the database schema to match.

**Key principle:** The database schema is defined once in `backend/models.py`. The migration script reads that definition and applies changes automatically.

## How It Works

### Automatic Migration on Startup
During development the migration script `backend/migrate_db.py` should be run before starting the server to ensure the database schema is up-to-date.

Development example (manual):

```bash
# Run migrations
python backend/migrate_db.py

# Start development server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8005
```

For production, run the migration as part of your deployment process (systemd, CI/CD pipeline, or container entrypoint).
### Migration Script (`backend/migrate_db.py`)
The migration script:
1. **Reads expected schema** from `models.py` using SQLAlchemy's metadata
2. **Checks existing database** structure
3. **Automatically adds missing columns** (never drops data)
4. **Reports what changed**

**No hardcoded column names** - everything is derived from your models!

## Adding New Columns (Workflow)

When you need to add a new field to your database:

1. **Edit `backend/models.py`** - Add the column to your model:
```python
class Annotation(Base):
    # ... existing columns ...
    new_field = Column(String, default="default_value")
```

2. **Run migration** (development):
```bash
cd backend
python migrate_db.py
```

3. **Restart the server** (development):
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8005
```

For production, include `python migrate_db.py` in your deployment workflow or container entrypoint.

3. **Migration happens automatically** - You'll see:
```
Adding column 'new_field' to 'annotations'...
✓ Migrations completed successfully:
  - Added new_field to annotations
```

That's it! No manual SQL, no separate migration files to maintain.

## What Gets Migrated

The script auto-detects and migrates:
- **New columns** added to any model
- **Default values** for columns
- **Data types** (INTEGER, VARCHAR, TEXT, FLOAT)

Currently handles these tables (as defined in models.py):
- `projects` - Project/dataset organization
- `videos` - Video metadata
- `tags` - Tag categories
- `annotations` - Video annotations with transcripts

## Database Location
```
C:/Users/Theo Akbas/Documents/Mines/aiassistant_backend/chroma_langchain_db/elicitations_db/annotations.db
```
(Location defined in `backend/config.py` as `ELICITATION_DIR`)

## Real-World Context

**How does this compare to production systems?**

Small-to-medium projects typically use:
- **Alembic** (SQLAlchemy's migration tool) - Auto-generates migration scripts, tracks versions
- **Django Migrations** - Similar auto-detection with rollback support
- **Flyway/Liquibase** - Enterprise tools for complex multi-database scenarios

**For your project scale**, the current approach is appropriate because:
- ✓ Single database (SQLite)
- ✓ Small team / solo developer
- ✓ Auto-detection from models (separation of concerns)
- ✓ No need for rollbacks (forward-only migrations)
- ✓ Simple enough to debug and maintain

If your project grows to need:
- Multiple developers with conflicting schema changes
- Production databases that require careful versioning
- Rollback capabilities

Then migrate to **Alembic** (see upgrade path below).

## Troubleshooting

### Migration fails but server needs to start
The `start.bat` script continues even if migration fails (with a warning). The server will start but features using new columns may not work.

### Reset database completely
If you need to start fresh (⚠️ loses all data):
```bash
# Delete database file
del "C:\Users\Theo Akbas\Documents\Mines\aiassistant_backend\chroma_langchain_db\elicitations_db\annotations.db"

# Restart server - will auto-create with correct schema
start.bat
```

### Check current schema
```bash
# Install sqlite-web for visual inspection
pip install sqlite-web

# Browse database
sqlite_web "C:\Users\Theo Akbas\Documents\Mines\aiassistant_backend\chroma_langchain_db\elicitations_db\annotations.db"
```

### Verify model schema detection
```bash
cd backend
python -c "from models import Base; print([c.name for c in Base.metadata.tables['annotations'].columns])"
```

## Safety Features

- **Non-destructive**: Only adds columns, never drops data
- **Idempotent**: Safe to run multiple times (checks before adding)
- **Error handling**: Server starts even if migration fails
- **Logging**: Clear output of what was migrated
- **Auto-detection**: No hardcoded columns to maintain

## Upgrade Path to Alembic (Future)

If you need more robust migrations later:

```bash
# Install Alembic
pip install alembic

# Initialize
alembic init alembic

# Auto-generate first migration from current models
alembic revision --autogenerate -m "initial"

# Apply migrations
alembic upgrade head
```

Then update `start.bat` to run `alembic upgrade head` instead of `python migrate_db.py`.

## Migration History
- **2025-12-04**: Initial auto-detection system - reads schema from models.py, adds missing columns automatically
