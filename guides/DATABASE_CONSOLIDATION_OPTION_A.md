# Database Consolidation: Option A - Moodle as Source of Truth

**Status**: Planning Document  
**Date**: February 19, 2026  
**Objective**: Eliminate SQLite database duplication by making Moodle the single source of truth for all data

---

## Executive Summary

**Current State**: Data is duplicated across Moodle PostgreSQL/MySQL database and FastAPI SQLite database, with bridge fields (`fastapi_video_id`, `fastapi_annotation_id`) linking records. This creates:
- Data drift risk (updates in one system may not sync to the other)
- Maintenance complexity (two schemas to maintain)
- Inconsistent permissions (Moodle permissions don't apply to SQLite data)

**Proposed State**: FastAPI backend reads/writes directly to Moodle database. SQLite is eliminated for operational data. Only static reference data (if needed) stays in SQLite.

**Benefits**:
- Single source of truth eliminates data drift
- Leverages Moodle's permission system for all data
- Simplifies deployment (no SQLite sync concerns)
- Reduces storage requirements

**Trade-offs**:
- Tighter coupling between FastAPI and Moodle
- FastAPI becomes Moodle-dependent (cannot run standalone without Moodle DB connection)
- Database connection configuration more complex

---

## Current Architecture Analysis

### Data Duplication Map

| Entity | Moodle DB | SQLite | Bridge Field | Sync Status |
|--------|-----------|--------|--------------|-------------|
| **Videos** | `local_videoelicit_videos` | `videos` | `fastapi_video_id` | ⚠️ Manual sync required |
| **Annotations** | `local_videoelicit_annotations` | `annotations` | `fastapi_annotation_id` | ⚠️ Manual sync required |
| **Segments** | ❌ Not stored | `video_segments` | None | ❌ SQLite only |
| **Projects** | ❌ Not stored | `projects` | None | ❌ SQLite only |
| **Tags** | ❌ Not stored | `tags` | None | ❌ SQLite only (taxonomy) |
| **Tasks** | ❌ Not stored | `tasks` | None | ❌ SQLite only (taxonomy) |

### Current Database Schemas

#### Moodle Tables (`/var/www/html/public/local/videoelicit/db/install.xml`)

**1. `local_videoelicit_videos`** (36 fields):
```sql
- id, contextid, userid, timemodified
- filename, filesize, filearea, fileitemid
- source_type (local/webdav), external_url
- fastapi_video_id (bridge to SQLite)
```

**2. `local_videoelicit_annotations`** (18 fields):
```sql
- id, videoid, userid, timemodified
- starttime, endtime, transcription
- fastapi_annotation_id (bridge to SQLite)
```

**3. `local_videoelicit_usage`** (9 fields):
```sql
- id, userid, operation, tokens_used, cost, timemodified
```

#### SQLite Tables (`/opt/video_elicitation_annotation_tool/backend/models.py`)

**1. `projects`** - Dataset organization
**2. `videos`** - Video metadata with source type
**3. `video_segments`** - Time-based video segments (NEW, Feb 2026)
**4. `annotations`** - Full AI pipeline results (transcription, judge, tagging, review, detected_task)
**5. `tags`** - Tag taxonomy with usage counts
**6. `tasks`** - Task taxonomy per craft domain

---

## Migration Strategy: Phase-by-Phase Plan

### Phase 1: Extend Moodle Schema (Weeks 1-2)

**Goal**: Add missing tables to Moodle database to match SQLite schema

**Actions**:
1. **Create Moodle migration** in `/var/www/html/public/local/videoelicit/db/upgrade.php`:
   - Add `local_videoelicit_projects` table
   - Add `local_videoelicit_video_segments` table
   - Extend `local_videoelicit_annotations` with AI pipeline fields:
     - `judge_status`, `judge_decision` (TEXT/JSON)
     - `tagging_status`, `tags` (TEXT/JSON)
     - `review_status`, `review_results` (TEXT/JSON)
     - `detected_task`, `task_detection_confidence`
     - `is_salient` (TINYINT/BOOLEAN)
   - Add `local_videoelicit_tags` table
   - Add `local_videoelicit_tasks` table

2. **Update `/var/www/html/public/local/videoelicit/db/install.xml`** with new schema definitions

3. **Increment version** in `/var/www/html/public/local/videoelicit/version.php`:
   ```php
   $plugin->version = 2026021901; // YYYYMMDDXX format
   ```

4. **Run Moodle upgrade**: Visit Site Administration > Notifications

**Example Schema Addition** (video_segments table):
```xml
<TABLE NAME="local_videoelicit_segments" COMMENT="Video segments for focused elicitation">
  <FIELDS>
    <FIELD NAME="id" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="true"/>
    <FIELD NAME="videoid" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
    <FIELD NAME="name" TYPE="char" LENGTH="255" NOTNULL="false" SEQUENCE="false"/>
    <FIELD NAME="starttime" TYPE="number" LENGTH="10" DECIMALS="3" NOTNULL="true" SEQUENCE="false"/>
    <FIELD NAME="endtime" TYPE="number" LENGTH="10" DECIMALS="3" NOTNULL="true" SEQUENCE="false"/>
    <FIELD NAME="thumbnailpath" TYPE="char" LENGTH="500" NOTNULL="false" SEQUENCE="false"/>
    <FIELD NAME="timecreated" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
    <FIELD NAME="timemodified" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
  </FIELDS>
  <KEYS>
    <KEY NAME="primary" TYPE="primary" FIELDS="id"/>
    <KEY NAME="videoid" TYPE="foreign" FIELDS="videoid" REFTABLE="local_videoelicit_videos" REFFIELDS="id"/>
  </KEYS>
</TABLE>
```

### Phase 2: Data Migration Script (Week 3)

**Goal**: Copy all existing SQLite data to Moodle database

**Actions**:
1. **Create migration script** `/opt/video_elicitation_annotation_tool/backend/migrate_to_moodle.py`:
   ```python
   """
   One-time migration: SQLite → Moodle DB
   Reads from SQLite, writes to Moodle via Moodle DB connection
   """
   
   import sqlite3
   import psycopg2  # or MySQLdb depending on Moodle DB type
   from config import MOODLE_DB_CONFIG
   
   # Configuration from environment
   MOODLE_DB_CONFIG = {
       'host': os.getenv('MOODLE_DB_HOST', 'localhost'),
       'database': os.getenv('MOODLE_DB_NAME', 'moodle'),
       'user': os.getenv('MOODLE_DB_USER', 'moodle'),
       'password': os.getenv('MOODLE_DB_PASSWORD', ''),
       'port': int(os.getenv('MOODLE_DB_PORT', '5432'))
   }
   
   def migrate_projects():
       """Migrate projects table"""
       pass
   
   def migrate_video_segments():
       """Migrate video_segments table"""
       pass
   
   def migrate_annotations():
       """Migrate annotation AI pipeline fields"""
       pass
   
   def migrate_tags():
       """Migrate tags taxonomy"""
       pass
   
   def migrate_tasks():
       """Migrate tasks taxonomy"""
       pass
   ```

2. **Backup existing databases** before migration:
   ```bash
   # Backup SQLite
   cp chroma_langchain_db/annotations.db annotations_backup_$(date +%Y%m%d).db
   
   # Backup Moodle DB (PostgreSQL example)
   pg_dump -h localhost -U moodle moodle > moodle_backup_$(date +%Y%m%d).sql
   ```

3. **Run migration** with dry-run option first:
   ```bash
   python backend/migrate_to_moodle.py --dry-run
   python backend/migrate_to_moodle.py --execute
   ```

4. **Validation**: Compare record counts between SQLite and Moodle after migration

### Phase 3: FastAPI Database Adapter (Weeks 4-5)

**Goal**: Create abstraction layer for FastAPI to interact with Moodle database

**Actions**:
1. **Create Moodle DB adapter** `/opt/video_elicitation_annotation_tool/backend/moodle_db.py`:
   ```python
   """
   Moodle Database Adapter for FastAPI
   Replaces SQLAlchemy SQLite with direct Moodle DB connections
   """
   
   import psycopg2.pool  # or MySQL equivalent
   from contextlib import asynccontextmanager
   from typing import Optional, List, Dict, Any
   
   class MoodleDBAdapter:
       """Async adapter for Moodle database operations"""
       
       def __init__(self, config: dict):
           self.pool = psycopg2.pool.SimpleConnectionPool(
               minconn=1,
               maxconn=20,
               **config
           )
       
       @asynccontextmanager
       async def get_connection(self):
           """Get connection from pool"""
           conn = self.pool.getconn()
           try:
               yield conn
           finally:
               self.pool.putconn(conn)
       
       async def get_video(self, video_id: int) -> Optional[Dict[str, Any]]:
           """Fetch video by ID from mdl_local_videoelicit_videos"""
           async with self.get_connection() as conn:
               cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
               cursor.execute(
                   "SELECT * FROM mdl_local_videoelicit_videos WHERE id = %s",
                   (video_id,)
               )
               return cursor.fetchone()
       
       async def create_annotation(self, data: Dict[str, Any]) -> int:
           """Insert annotation into Moodle DB"""
           async with self.get_connection() as conn:
               cursor = conn.cursor()
               cursor.execute("""
                   INSERT INTO mdl_local_videoelicit_annotations 
                   (videoid, userid, starttime, endtime, transcription, timemodified)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id
               """, (data['videoid'], data['userid'], data['starttime'], 
                     data['endtime'], data['transcription'], int(time.time())))
               return cursor.fetchone()[0]
       
       # ... additional CRUD methods for all tables
   ```

2. **Update FastAPI configuration** `/opt/video_elicitation_annotation_tool/backend/config.py`:
   ```python
   # Remove SQLite DATABASE_URL
   # Add Moodle DB configuration
   MOODLE_DB_CONFIG = {
       'host': os.getenv('MOODLE_DB_HOST', 'localhost'),
       'database': os.getenv('MOODLE_DB_NAME', 'moodle'),
       'user': os.getenv('MOODLE_DB_USER', 'moodle'),
       'password': os.getenv('MOODLE_DB_PASSWORD', ''),
       'port': int(os.getenv('MOODLE_DB_PORT', '5432')),
       'table_prefix': 'mdl_'  # Moodle table prefix
   }
   ```

3. **Replace database.py** operations:
   - Replace all `AsyncSessionLocal()` with `MoodleDBAdapter.get_connection()`
   - Replace SQLAlchemy queries with raw SQL parameterized queries
   - Maintain same function signatures for backward compatibility

### Phase 4: FastAPI Backend Refactor (Weeks 6-7)

**Goal**: Update all FastAPI endpoints to use Moodle DB adapter instead of SQLite

**Actions**:
1. **Update `/opt/video_elicitation_annotation_tool/backend/database.py`**:
   - Remove SQLAlchemy session management
   - Replace with MoodleDBAdapter calls
   - Keep function signatures identical for minimal disruption

2. **Update `/opt/video_elicitation_annotation_tool/backend/main.py`**:
   - Replace `Depends(get_session)` with `Depends(get_moodle_db)`
   - Update all CRUD operations to use adapter methods
   - Maintain same API contract (request/response models unchanged)

3. **Update background tasks**:
   - Replace `AsyncSessionLocal()` with `moodle_db.get_connection()`
   - Ensure atomic transactions for AI pipeline updates

4. **Testing each endpoint**:
   ```bash
   # Test video listing
   curl http://localhost:8005/api/videos
   
   # Test annotation creation
   curl -X POST http://localhost:8005/api/annotations \
     -F "video_id=1" -F "start_time=0" -F "end_time=10" \
     -F "audio_blob=@test.wav"
   
   # Test segment creation
   curl -X POST http://localhost:8005/api/segments \
     -H "Content-Type: application/json" \
     -d '{"parent_video_id":1,"name":"Test","start_time":0,"end_time":10}'
   ```

### Phase 5: Remove SQLite Dependencies (Week 8)

**Goal**: Clean up SQLite code and finalize migration

**Actions**:
1. **Remove SQLite files**:
   ```bash
   # Archive SQLite database for rollback safety
   tar -czf sqlite_archive_$(date +%Y%m%d).tar.gz \
     chroma_langchain_db/annotations.db backend/models.py backend/migration.py
   
   # Move to archive folder (don't delete immediately)
   mkdir -p archive/pre_moodle_migration
   mv sqlite_archive_*.tar.gz archive/pre_moodle_migration/
   ```

2. **Update requirements.txt**:
   - Remove: `aiosqlite`, `sqlalchemy`
   - Add: `psycopg2-binary` (or `mysqlclient` for MySQL)

3. **Update `.env.example`**:
   ```env
   # Moodle Database Connection (replaces SQLite)
   MOODLE_DB_HOST=localhost
   MOODLE_DB_PORT=5432
   MOODLE_DB_NAME=moodle
   MOODLE_DB_USER=moodle
   MOODLE_DB_PASSWORD=your_secure_password
   
   # Fireworks AI API (unchanged)
   FIREWORKS_API_KEY=your_api_key
   ```

4. **Update documentation**:
   - Update README.md to reflect Moodle DB requirement
   - Remove references to SQLite database
   - Add Moodle DB setup instructions

### Phase 6: Production Deployment (Week 9)

**Goal**: Deploy consolidated architecture to production

**Actions**:
1. **Pre-deployment checklist**:
   - [ ] Moodle database schema updated and validated
   - [ ] All SQLite data migrated to Moodle
   - [ ] FastAPI endpoints tested with Moodle DB
   - [ ] Backup of both databases taken
   - [ ] Rollback plan documented

2. **Deployment steps**:
   ```bash
   # 1. Put system in maintenance mode
   # (Add maintenance page or disable video upload button)
   
   # 2. Run final data sync (if any new records created during testing)
   python backend/migrate_to_moodle.py --incremental
   
   # 3. Stop FastAPI backend
   systemctl stop videoelicit-backend
   
   # 4. Update code
   git pull origin main
   
   # 5. Install new dependencies
   pip install -r requirements.txt
   
   # 6. Configure Moodle DB environment variables
   nano /etc/videoelicit-backend/.env
   
   # 7. Restart backend
   systemctl start videoelicit-backend
   
   # 8. Verify health endpoint
   curl http://localhost:8005/api/health
   
   # 9. Remove maintenance mode
   ```

3. **Post-deployment validation**:
   - Test video upload/listing
   - Test annotation creation and AI pipeline
   - Test segment creation and playback
   - Test project management
   - Monitor logs for database connection errors

4. **Performance monitoring**:
   - Database connection pool utilization
   - Query performance (add indexes if needed)
   - API response times (should be similar or better than SQLite)

---

## Technical Implementation Details

### Database Connection Pattern

**Recommended: Connection Pooling**
```python
# backend/moodle_db.py
from psycopg2 import pool
import os

class MoodleDB:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.pool = pool.ThreadedConnectionPool(
                minconn=5,
                maxconn=20,
                host=os.getenv('MOODLE_DB_HOST'),
                database=os.getenv('MOODLE_DB_NAME'),
                user=os.getenv('MOODLE_DB_USER'),
                password=os.getenv('MOODLE_DB_PASSWORD'),
                port=int(os.getenv('MOODLE_DB_PORT', 5432))
            )
        return cls._instance
    
    def get_connection(self):
        """Get connection from pool"""
        return self.pool.getconn()
    
    def return_connection(self, conn):
        """Return connection to pool"""
        self.pool.putconn(conn)

# Usage in endpoints
moodle_db = MoodleDB()

@app.post("/api/annotations")
async def create_annotation(data: AnnotationCreate):
    conn = moodle_db.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO mdl_local_videoelicit_annotations ...")
        conn.commit()
        return {"id": cursor.lastrowid}
    finally:
        moodle_db.return_connection(conn)
```

### Table Naming Convention

Moodle uses prefixed table names (default: `mdl_`). All queries must include prefix:
```sql
-- CORRECT
SELECT * FROM mdl_local_videoelicit_videos WHERE id = %s

-- WRONG
SELECT * FROM local_videoelicit_videos WHERE id = %s
```

Configuration should store prefix:
```python
TABLE_PREFIX = os.getenv('MOODLE_TABLE_PREFIX', 'mdl_')
table_name = f"{TABLE_PREFIX}local_videoelicit_videos"
```

### Field Name Mapping

SQLite uses `snake_case`, Moodle uses `lowercase` (no underscores):
```python
# SQLite → Moodle mapping
FIELD_MAP = {
    'start_time': 'starttime',
    'end_time': 'endtime',
    'file_size': 'filesize',
    'created_at': 'timecreated',
    'updated_at': 'timemodified',
    'parent_video_id': 'videoid',
    'user_id': 'userid'
}
```

### JSON Field Storage

Moodle stores JSON as TEXT fields. Serialize before insert, deserialize after fetch:
```python
import json

# Insert
judge_decision_json = json.dumps({"needs_review": True, "reasoning": "..."})
cursor.execute(
    "UPDATE mdl_local_videoelicit_annotations SET judgedecision = %s WHERE id = %s",
    (judge_decision_json, annotation_id)
)

# Fetch
cursor.execute("SELECT judgedecision FROM mdl_local_videoelicit_annotations WHERE id = %s", (id,))
judge_decision_str = cursor.fetchone()[0]
judge_decision = json.loads(judge_decision_str) if judge_decision_str else None
```

### Transaction Management

Use transactions for multi-step operations (e.g., annotation creation + AI pipeline trigger):
```python
conn = moodle_db.get_connection()
try:
    conn.autocommit = False
    cursor = conn.cursor()
    
    # Step 1: Insert annotation
    cursor.execute("INSERT INTO mdl_local_videoelicit_annotations ...")
    annotation_id = cursor.fetchone()[0]
    
    # Step 2: Update video annotation count
    cursor.execute("UPDATE mdl_local_videoelicit_videos SET annotationcount = annotationcount + 1 ...")
    
    conn.commit()
except Exception as e:
    conn.rollback()
    raise
finally:
    moodle_db.return_connection(conn)
```

---

## Rollback Plan

### If Issues Arise During Migration

**Phase 1-2 Issues** (Schema/Data Migration):
1. Restore Moodle DB from backup:
   ```bash
   psql -h localhost -U moodle moodle < moodle_backup_YYYYMMDD.sql
   ```
2. Continue using SQLite (no code changes yet)

**Phase 3-4 Issues** (FastAPI Refactor):
1. Git revert to pre-refactor commit:
   ```bash
   git revert HEAD~10..HEAD  # Revert last 10 commits
   git push origin main
   ```
2. Restart backend with old code
3. SQLite database still intact

**Phase 5-6 Issues** (Production):
1. Emergency rollback procedure:
   ```bash
   # 1. Stop backend
   systemctl stop videoelicit-backend
   
   # 2. Restore SQLite archive
   tar -xzf archive/pre_moodle_migration/sqlite_archive_YYYYMMDD.tar.gz
   
   # 3. Checkout previous version
   git checkout tags/v2.0-pre-moodle-migration
   
   # 4. Restart backend
   systemctl start videoelicit-backend
   ```

2. Data loss prevention:
   - Keep SQLite archive for 6 months post-migration
   - Moodle DB backups daily during transition period
   - Document any new records created in Moodle DB for manual sync if rollback needed

---

## Benefits & Trade-offs Analysis

### Benefits

✅ **Single Source of Truth**
- Eliminates data drift between Moodle and SQLite
- No more bridge field synchronization logic
- Consistent data across all interfaces

✅ **Unified Permissions**
- Moodle's capability system applies to all data
- Context-based access control enforced at DB level
- No separate permission checks in FastAPI

✅ **Simplified Deployment**
- One less database to manage
- Fewer environment variables
- Reduced storage requirements

✅ **Better Integration**
- Moodle reports can access all video/annotation data
- Gradebook integration becomes possible
- Course-level data organization

✅ **Scalability**
- Moodle DB (PostgreSQL/MySQL) more scalable than SQLite
- Better concurrent access handling
- Professional DB administration tools available

### Trade-offs

⚠️ **Tighter Coupling**
- FastAPI becomes Moodle-dependent
- Cannot run FastAPI standalone for development/testing
- Requires Moodle DB credentials in FastAPI environment

⚠️ **Development Complexity**
- Local development requires Moodle DB setup or Docker
- More complex test fixtures (need to mock Moodle DB)
- Debugging requires access to Moodle DB logs

⚠️ **Migration Risk**
- One-time migration must be perfect (data integrity)
- Downtime required for production migration
- Rollback complexity if issues arise

⚠️ **Performance Concerns**
- Network latency if Moodle DB on separate server
- Query optimization requires DBA knowledge
- Moodle table prefix adds slight query complexity

---

## Mitigations for Trade-offs

### Development Environment

**Solution**: Docker Compose with Moodle DB
```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  moodle-db:
    image: postgres:14
    environment:
      POSTGRES_DB: moodle
      POSTGRES_USER: moodle
      POSTGRES_PASSWORD: moodle
    ports:
      - "5432:5432"
    volumes:
      - ./moodle_schema.sql:/docker-entrypoint-initdb.d/schema.sql
  
  fastapi:
    build: .
    environment:
      MOODLE_DB_HOST: moodle-db
      MOODLE_DB_NAME: moodle
      MOODLE_DB_USER: moodle
      MOODLE_DB_PASSWORD: moodle
    depends_on:
      - moodle-db
```

Run locally:
```bash
docker-compose -f docker-compose.dev.yml up
```

### Testing Strategy

**Solution**: In-memory test database
```python
# tests/conftest.py
import pytest
from psycopg2 import pool

@pytest.fixture
def test_db():
    """Create temporary test database"""
    test_pool = pool.SimpleConnectionPool(
        minconn=1,
        maxconn=5,
        host='localhost',
        database='moodle_test',
        user='test',
        password='test'
    )
    yield test_pool
    test_pool.closeall()
```

### Performance Optimization

**Solution**: Add indexes to Moodle tables
```sql
-- Add after migration in Phase 1
CREATE INDEX idx_videoelicit_annotations_videoid 
  ON mdl_local_videoelicit_annotations(videoid);

CREATE INDEX idx_videoelicit_annotations_userid 
  ON mdl_local_videoelicit_annotations(userid);

CREATE INDEX idx_videoelicit_segments_videoid 
  ON mdl_local_videoelicit_segments(videoid);

CREATE INDEX idx_videoelicit_videos_sourcetype 
  ON mdl_local_videoelicit_videos(sourcetype);
```

---

## Success Metrics

### Migration Success Criteria

1. **Data Integrity**:
   - [ ] 100% of SQLite records migrated to Moodle
   - [ ] No data loss during migration
   - [ ] All relationships (foreign keys) maintained

2. **Functionality**:
   - [ ] All 40+ API endpoints working with Moodle DB
   - [ ] AI pipeline (transcription/judge/tagging/review) functioning
   - [ ] Video streaming working (local + WebDAV)
   - [ ] Segment creation and playback working

3. **Performance**:
   - [ ] API response times ≤ 10% slower than SQLite (acceptable trade-off)
   - [ ] Database connection pool stable (no connection exhaustion)
   - [ ] No database deadlocks during concurrent operations

4. **Stability**:
   - [ ] Zero database-related errors in first week post-migration
   - [ ] Background tasks (AI pipeline) completing successfully
   - [ ] WebSocket real-time updates working

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Extend Moodle Schema | 2 weeks | New tables in Moodle DB, schema validated |
| Phase 2: Data Migration Script | 1 week | All SQLite data copied to Moodle |
| Phase 3: FastAPI DB Adapter | 2 weeks | MoodleDBAdapter class, connection pooling |
| Phase 4: FastAPI Refactor | 2 weeks | All endpoints using Moodle DB |
| Phase 5: Remove SQLite | 1 week | Clean codebase, updated docs |
| Phase 6: Production Deployment | 1 week | System live with Moodle DB |
| **Total** | **9 weeks** | Fully consolidated system |

---

## Next Steps

1. **Get stakeholder approval** for Option A approach
2. **Provision development Moodle DB** for testing (Docker recommended)
3. **Create Phase 1 branch** and start Moodle schema extension
4. **Schedule migration window** for production (low-traffic period)
5. **Assign DBA resource** for query optimization and index tuning

---

## Questions & Decisions Log

| Date | Question | Decision | Rationale |
|------|----------|----------|-----------|
| Feb 19, 2026 | Which consolidation option? | Option A (Moodle as Source of Truth) | User preference, best long-term architecture |
| TBD | PostgreSQL or MySQL? | TBD | Depends on existing Moodle installation |
| TBD | Connection pool size? | TBD | Needs load testing to determine |
| TBD | Keep tags/tasks in SQLite? | TBD | May not need Moodle DB for static taxonomy |

---

## Additional Resources

- **Moodle DB Schema Documentation**: https://docs.moodle.org/dev/Database_schema
- **Moodle Plugin Development**: https://docs.moodle.org/dev/Plugin_files
- **PostgreSQL Connection Pooling**: https://www.psycopg.org/docs/pool.html
- **FastAPI Dependencies**: https://fastapi.tiangolo.com/tutorial/dependencies/

---

**Document Maintained By**: AI Development Team  
**Last Updated**: February 19, 2026  
**Review Frequency**: Weekly during migration, monthly post-migration
