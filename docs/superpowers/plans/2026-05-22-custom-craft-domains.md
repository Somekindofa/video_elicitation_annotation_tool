# Custom Craft Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users add personal craft/domain names that persist in the database and appear only in their dropdown.

**Architecture:** New `mdl_local_videoelicit_crafts` table created at startup; two API endpoints (`GET/POST /api/crafts`) protected by Moodle JWT; frontend `+` button beside the craftSelector triggers inline input, POSTs to API, and appends the new option.

**Tech Stack:** FastAPI, pymysql/psycopg2 (MySQL+PostgreSQL dual-dialect), Pydantic v2, Vanilla JS

---

## File Map

| File | Change |
|---|---|
| `backend/moodle_db.py` | Add `ensure_crafts_table_sync`, `get_custom_crafts_by_user_sync/async`, `create_custom_craft_sync/async` |
| `backend/models.py` | Add `CustomCraftCreate` and `CustomCraftResponse` Pydantic models |
| `backend/database_compat.py` | Add `get_custom_crafts_by_user` and `create_custom_craft` wrappers |
| `backend/main.py` | Add `GET /api/crafts`, `POST /api/crafts`; call ensure in startup |
| `js/app.js` | Add `slugifyCraft`, `loadCustomCrafts`, `showAddCraftInput`; modify `createElicitControlsUI` |

---

## Task 1: DB layer — table creation + read

**Files:**
- Modify: `backend/moodle_db.py` (near line 129, after `init_db_sync`)

- [ ] **Step 1: Write a unit test for `ensure_crafts_table_sync` and `get_custom_crafts_by_user_sync`**

Create `backend/test_crafts_db.py`:

```python
"""Unit tests for custom crafts DB layer (run from backend/ directory)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

# Patch env before importing moodle_db
os.environ.setdefault('MOODLE_DB_TYPE', 'postgresql')
os.environ.setdefault('MOODLE_DB_HOST', 'localhost')
os.environ.setdefault('MOODLE_DB_NAME', 'test')
os.environ.setdefault('MOODLE_DB_USER', 'test')
os.environ.setdefault('MOODLE_DB_PASSWORD', 'test')
os.environ.setdefault('MOODLE_TABLE_PREFIX', 'mdl_')

import pytest
from unittest.mock import MagicMock, patch


def make_mock_conn(rows=None):
    """Return a mock connection + cursor that replays rows on fetchall."""
    cursor = MagicMock()
    cursor.fetchall.return_value = rows or []
    cursor.fetchone.return_value = (1,)
    cursor.lastrowid = 1
    cursor.description = [('id',), ('userid',), ('craft_key',), ('craft_label',), ('timecreated',)]
    conn = MagicMock()
    conn.cursor.return_value = cursor
    conn.__enter__ = lambda s: conn
    conn.__exit__ = MagicMock(return_value=False)
    return conn, cursor


def test_ensure_crafts_table_executes_create():
    from moodle_db import MoodleDB
    db = MoodleDB.__new__(MoodleDB)
    db.table_prefix = 'mdl_'
    conn, cursor = make_mock_conn()
    with patch.object(db, 'get_connection', return_value=conn):
        db.ensure_crafts_table_sync()
    sql_called = cursor.execute.call_args[0][0]
    assert 'CREATE TABLE IF NOT EXISTS' in sql_called
    assert 'mdl_local_videoelicit_crafts' in sql_called


def test_get_custom_crafts_by_user_returns_list():
    from moodle_db import MoodleDB
    db = MoodleDB.__new__(MoodleDB)
    db.table_prefix = 'mdl_'
    rows = [
        {'id': 1, 'userid': 'u1', 'craft_key': 'woodworking',
         'craft_label': 'Woodworking', 'timecreated': 0},
    ]
    conn, cursor = make_mock_conn(rows)
    with patch.object(db, 'get_connection', return_value=conn):
        result = db.get_custom_crafts_by_user_sync('u1')
    assert result == rows
    sql = cursor.execute.call_args[0][0]
    assert 'userid' in sql
    assert cursor.execute.call_args[0][1] == ('u1',)
```

- [ ] **Step 2: Run test — expect AttributeError (method not yet defined)**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m pytest test_crafts_db.py::test_ensure_crafts_table_executes_create -v 2>&1 | tail -20
```

Expected: FAILED with `AttributeError: 'MoodleDB' object has no attribute 'ensure_crafts_table_sync'`

- [ ] **Step 3: Add `ensure_crafts_table_sync` and `get_custom_crafts_by_user_sync/async` to `moodle_db.py`**

Find the `# ==================== INIT ====================` section (line ~127). After `init_db_sync` (line ~131), add:

```python
    def ensure_crafts_table_sync(self):
        """Create the custom crafts table if it doesn't exist yet."""
        table = self._table('crafts')
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if DB_TYPE == 'postgresql':
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id          SERIAL PRIMARY KEY,
                        userid      VARCHAR(255) NOT NULL,
                        craft_key   VARCHAR(100) NOT NULL,
                        craft_label VARCHAR(255) NOT NULL,
                        timecreated INT NOT NULL DEFAULT 0,
                        UNIQUE (userid, craft_key)
                    )
                """)
            else:
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id          INT AUTO_INCREMENT PRIMARY KEY,
                        userid      VARCHAR(255) NOT NULL,
                        craft_key   VARCHAR(100) NOT NULL,
                        craft_label VARCHAR(255) NOT NULL,
                        timecreated INT NOT NULL DEFAULT 0,
                        UNIQUE KEY uq_user_craft (userid, craft_key)
                    )
                """)
            conn.commit()

    async def ensure_crafts_table(self):
        return await self._run_in_executor(self.ensure_crafts_table_sync)

    # ==================== CUSTOM CRAFTS ====================

    def get_custom_crafts_by_user_sync(self, userid: str) -> List[Dict[str, Any]]:
        """Return all custom crafts for a user, ordered by creation time."""
        with self.get_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor if DB_TYPE == 'postgresql' else None)
            cursor.execute(
                f"SELECT id, userid, craft_key, craft_label, timecreated"
                f" FROM {self._table('crafts')} WHERE userid = %s ORDER BY timecreated ASC",
                (userid,)
            )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_custom_crafts_by_user(self, userid: str) -> List[Dict[str, Any]]:
        return await self._run_in_executor(self.get_custom_crafts_by_user_sync, userid)
```

- [ ] **Step 4: Run tests — expect both to pass**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m pytest test_crafts_db.py::test_ensure_crafts_table_executes_create test_crafts_db.py::test_get_custom_crafts_by_user_returns_list -v 2>&1 | tail -20
```

Expected: 2 passed

---

## Task 2: DB layer — create custom craft

**Files:**
- Modify: `backend/moodle_db.py` (continue after Task 1 additions)
- Modify: `backend/test_crafts_db.py`

- [ ] **Step 1: Add test for `create_custom_craft_sync`**

Append to `backend/test_crafts_db.py`:

```python
def test_create_custom_craft_inserts_row():
    from moodle_db import MoodleDB
    db = MoodleDB.__new__(MoodleDB)
    db.table_prefix = 'mdl_'
    inserted_row = {'id': 1, 'userid': 'u1', 'craft_key': 'woodworking',
                    'craft_label': 'Woodworking', 'timecreated': 0}
    conn, cursor = make_mock_conn([inserted_row])
    cursor.fetchone.return_value = inserted_row
    with patch.object(db, 'get_connection', return_value=conn):
        with patch.object(db, '_insert', return_value=1):
            result = db.create_custom_craft_sync({
                'userid': 'u1',
                'craft_key': 'woodworking',
                'craft_label': 'Woodworking',
            })
    assert result['craft_key'] == 'woodworking'
    assert result['userid'] == 'u1'
```

- [ ] **Step 2: Run test — expect AttributeError**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m pytest test_crafts_db.py::test_create_custom_craft_inserts_row -v 2>&1 | tail -10
```

- [ ] **Step 3: Add `create_custom_craft_sync/async` to `moodle_db.py`** (after `get_custom_crafts_by_user`)

```python
    def create_custom_craft_sync(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a new custom craft row. Raises IntegrityError on duplicate (userid, craft_key)."""
        table = self._table('crafts')
        with self.get_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor if DB_TYPE == 'postgresql' else None)
            now = int(datetime.now(timezone.utc).timestamp())
            query = f"""
                INSERT INTO {table} (userid, craft_key, craft_label, timecreated)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """
            row_id = self._insert(cursor, query, (
                data['userid'],
                data['craft_key'],
                data['craft_label'],
                now,
            ))
            conn.commit()
            cursor.execute(
                f"SELECT id, userid, craft_key, craft_label, timecreated FROM {table} WHERE id = %s",
                (row_id,)
            )
            row = cursor.fetchone()
            return dict(row)

    async def create_custom_craft(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._run_in_executor(self.create_custom_craft_sync, data)
```

- [ ] **Step 4: Run all three craft DB tests**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m pytest test_crafts_db.py -v 2>&1 | tail -15
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/moodle_db.py backend/test_crafts_db.py
git commit -m "feat: add custom crafts DB layer (ensure table, get, create)"
```

---

## Task 3: Pydantic models + compat layer

**Files:**
- Modify: `backend/models.py` (append at end)
- Modify: `backend/database_compat.py` (append at end)

- [ ] **Step 1: Check which Pydantic validators are already imported**

```bash
grep "field_validator\|BaseModel\|from pydantic" /opt/video_elicitation_annotation_tool/backend/models.py | head -5
```

If `field_validator` is not in the import line, add it.

- [ ] **Step 2: Add Pydantic models to `models.py`**

Append after the last class in `backend/models.py`:

```python

class CustomCraftCreate(BaseModel):
    """Input schema for creating a custom craft domain."""
    craft_label: str

    @field_validator('craft_label')
    @classmethod
    def validate_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('craft_label must not be empty')
        if len(v) > 100:
            raise ValueError('craft_label must be 100 characters or fewer')
        return v


class CustomCraftResponse(BaseModel):
    """Output schema for a custom craft domain."""
    craft_key: str
    craft_label: str

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Add compat wrappers to `database_compat.py`**

Append to the end of `backend/database_compat.py`:

```python

async def get_custom_crafts_by_user(userid: str) -> list:
    """Return custom crafts for a user as dicts with craft_key and craft_label."""
    rows = await moodle_db.get_custom_crafts_by_user(userid)
    return [{'craft_key': r['craft_key'], 'craft_label': r['craft_label']} for r in rows]


async def create_custom_craft(userid: str, craft_label: str) -> dict:
    """Slugify label, insert row, return {craft_key, craft_label}.

    Security: craft_key is derived entirely server-side from the label;
    the client never supplies a raw key.
    """
    import re
    craft_key = re.sub(r'[^a-z0-9]+', '_', craft_label.lower()).strip('_')
    if not craft_key:
        raise ValueError('craft_label produces an empty key after slugification')
    row = await moodle_db.create_custom_craft({
        'userid': userid,
        'craft_key': craft_key,
        'craft_label': craft_label,
    })
    return {'craft_key': row['craft_key'], 'craft_label': row['craft_label']}
```

- [ ] **Step 4: Verify models and compat import cleanly**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -c "from models import CustomCraftCreate, CustomCraftResponse; print('models OK')"
python -c "from database_compat import get_custom_crafts_by_user, create_custom_craft; print('compat OK')"
```

Expected: `models OK` then `compat OK`

- [ ] **Step 5: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/models.py backend/database_compat.py
git commit -m "feat: add CustomCraft Pydantic models and database_compat wrappers"
```

---

## Task 4: API endpoints + startup hook

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Check if `moodle_db` is directly imported in `main.py`**

```bash
grep "^from moodle_db\|^import moodle_db" /opt/video_elicitation_annotation_tool/backend/main.py
```

If not present, add this import near the top of `main.py` alongside other imports:

```python
from moodle_db import moodle_db
```

- [ ] **Step 2: Wire `ensure_crafts_table` into startup**

In `backend/main.py`, find `startup_event` (line ~163). After `await db.init_db()`, add:

```python
    await moodle_db.ensure_crafts_table()
    logger.info("Custom crafts table verified")
```

- [ ] **Step 3: Add `GET /api/crafts` endpoint**

Find the tasks endpoints section (after the `delete_task` endpoint, around line 1080). Add:

```python

@app.get("/api/crafts", response_model=List[models.CustomCraftResponse])
async def list_custom_crafts(
    current_user: MoodleUser = Depends(verify_moodle_jwt),
):
    """Return the authenticated user's custom craft domains."""
    try:
        crafts = await db.get_custom_crafts_by_user(str(current_user.userid))
        return [models.CustomCraftResponse(**c) for c in crafts]
    except Exception as e:
        logger.error(f"Error listing custom crafts: {e}")
        raise HTTPException(status_code=500, detail="Could not load custom crafts")
```

- [ ] **Step 4: Add `POST /api/crafts` endpoint**

Directly after the `GET /api/crafts` endpoint:

```python

@app.post("/api/crafts", response_model=models.CustomCraftResponse, status_code=201)
async def create_custom_craft_endpoint(
    payload: models.CustomCraftCreate,
    current_user: MoodleUser = Depends(verify_moodle_jwt),
):
    """Create a new personal craft domain for the authenticated user.

    Security: user_id is taken exclusively from the verified JWT — never from
    the request body — so one user cannot create crafts on behalf of another.
    """
    try:
        craft = await db.create_custom_craft(str(current_user.userid), payload.craft_label)
        return models.CustomCraftResponse(**craft)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="This craft domain already exists")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating custom craft: {e}")
        raise HTTPException(status_code=500, detail="Could not save custom craft")
```

- [ ] **Step 5: Verify backend syntax**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m py_compile main.py && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 6: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add backend/main.py
git commit -m "feat: add GET/POST /api/crafts endpoints with JWT auth"
```

---

## Task 5: Frontend — helper + load on init

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Find the raw JWT variable name**

```bash
grep -n "_RAW_JWT\|rawJwt\|raw_jwt\|window\._JWT\|window\.JWT" /opt/video_elicitation_annotation_tool/js/app.js | head -10
```

Note the variable name. If `_RAW_JWT` does not exist, find where the JWT string is stored near line 588 where `window.USER_ID` is set, and use that variable name in steps below.

- [ ] **Step 2: Add `slugifyCraft` helper just above `createElicitControlsUI` (line ~759)**

```javascript
function slugifyCraft(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
```

- [ ] **Step 3: Add `loadCustomCrafts` directly after `slugifyCraft`**

Replace `_RAW_JWT` below with the actual variable name found in Step 1.

```javascript
async function loadCustomCrafts(selectEl, addBtn) {
    if (!window.USER_ID) {
        if (addBtn) addBtn.style.display = 'none';
        return;
    }
    try {
        const resp = await fetch(`${API_BASE}/api/crafts`, {
            headers: { 'Authorization': `Bearer ${window._RAW_JWT || ''}` }
        });
        if (!resp.ok) {
            if (addBtn) addBtn.style.display = 'none';
            return;
        }
        const crafts = await resp.json();
        crafts.forEach(({ craft_key, craft_label }) => {
            const safeKey = String(craft_key).replace(/"/g, '');
            if (!selectEl.querySelector(`option[value="${safeKey}"]`)) {
                const opt = document.createElement('option');
                opt.value = craft_key;
                opt.textContent = craft_label;
                opt.setAttribute('data-custom', '1');
                selectEl.appendChild(opt);
            }
        });
        if (state.craft && selectEl.querySelector(`option[value="${CSS.escape(state.craft)}"]`)) {
            selectEl.value = state.craft;
        }
    } catch (_) {
        if (addBtn) addBtn.style.display = 'none';
    }
}
```

- [ ] **Step 4: Check JS syntax with node**

```bash
node --check /opt/video_elicitation_annotation_tool/js/app.js && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 5: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add js/app.js
git commit -m "feat: add slugifyCraft and loadCustomCrafts frontend helpers"
```

---

## Task 6: Frontend — `+` button and inline input

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `showAddCraftInput` after `loadCustomCrafts`**

Replace `_RAW_JWT` with the actual variable name found in Task 5 Step 1.

```javascript
function showAddCraftInput(wrapperEl, selectEl, addBtn) {
    addBtn.style.display = 'none';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:4px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('addCraftPlaceholder') || 'New domain name';
    input.maxLength = 100;
    input.style.cssText = 'padding:4px 6px;border-radius:4px;border:1px solid #ccc;font-size:0.85rem;width:160px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = t('addCraftConfirm') || 'Add';
    confirmBtn.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #aaa;cursor:pointer;font-size:0.85rem;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '×';
    cancelBtn.style.cssText = 'padding:4px 7px;border-radius:4px;border:1px solid #aaa;cursor:pointer;font-size:0.85rem;';

    const msgEl = document.createElement('span');
    msgEl.style.cssText = 'font-size:0.8rem;color:#c00;margin-left:4px;';

    const restore = () => {
        inputRow.remove();
        addBtn.style.display = '';
    };

    cancelBtn.addEventListener('click', restore);

    confirmBtn.addEventListener('click', async () => {
        const label = input.value.trim();
        if (!label) { msgEl.textContent = t('addCraftEmpty') || 'Enter a name'; return; }
        if (label.length > 100) { msgEl.textContent = t('addCraftTooLong') || 'Max 100 chars'; return; }
        if (!slugifyCraft(label)) { msgEl.textContent = t('addCraftInvalid') || 'Invalid name'; return; }

        confirmBtn.disabled = true;
        msgEl.textContent = '';
        try {
            const resp = await fetch(`${API_BASE}/api/crafts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window._RAW_JWT || ''}`
                },
                body: JSON.stringify({ craft_label: label })
            });
            if (resp.status === 409) {
                msgEl.textContent = t('addCraftDuplicate') || 'Already exists';
                confirmBtn.disabled = false;
                return;
            }
            if (!resp.ok) throw new Error('Server error');
            const { craft_key, craft_label } = await resp.json();
            const opt = document.createElement('option');
            opt.value = craft_key;
            opt.textContent = craft_label;
            opt.setAttribute('data-custom', '1');
            selectEl.appendChild(opt);
            selectEl.value = craft_key;
            state.craft = craft_key;
            try { localStorage.setItem('craft', craft_key); } catch (_) {}
            restore();
        } catch (_) {
            msgEl.textContent = t('addCraftError') || 'Could not save';
            confirmBtn.disabled = false;
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') restore();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(confirmBtn);
    inputRow.appendChild(cancelBtn);
    inputRow.appendChild(msgEl);
    wrapperEl.appendChild(inputRow);
    input.focus();
}
```

- [ ] **Step 2: Modify `createElicitControlsUI` to add `+` button and call `loadCustomCrafts`**

Find these two lines (around line 800):

```javascript
        wrapper.appendChild(craftLabel);
        wrapper.appendChild(craftSelect);
```

Replace with:

```javascript
        const addCraftBtn = document.createElement('button');
        addCraftBtn.textContent = '+';
        addCraftBtn.title = t('addCraftTitle') || 'Add custom domain';
        addCraftBtn.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-size:0.85rem;margin-left:6px;vertical-align:middle;';
        addCraftBtn.addEventListener('click', () => showAddCraftInput(wrapper, craftSelect, addCraftBtn));

        wrapper.appendChild(craftLabel);

        const craftRow = document.createElement('div');
        craftRow.style.cssText = 'display:flex;align-items:center;';
        craftRow.appendChild(craftSelect);
        craftRow.appendChild(addCraftBtn);
        wrapper.appendChild(craftRow);

        loadCustomCrafts(craftSelect, addCraftBtn);
```

- [ ] **Step 3: Verify JS syntax**

```bash
node --check /opt/video_elicitation_annotation_tool/js/app.js && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 4: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add js/app.js
git commit -m "feat: add custom craft domain UI — + button with inline input"
```

---

## Task 7: i18n keys

**Files:**
- Modify: `js/app.js` (translation objects)

- [ ] **Step 1: Find the translation objects**

```bash
grep -n "addCraftPlaceholder\|craftDomainLabel\|'en'\s*:\|\"en\"\s*:" /opt/video_elicitation_annotation_tool/js/app.js | head -10
```

Identify the `en` and `fr` translation object locations.

- [ ] **Step 2: Add missing keys to the `en` translation object**

```javascript
addCraftPlaceholder: 'New domain name',
addCraftConfirm: 'Add',
addCraftTitle: 'Add custom domain',
addCraftEmpty: 'Enter a name',
addCraftTooLong: 'Max 100 characters',
addCraftInvalid: 'Invalid name (use letters and numbers)',
addCraftDuplicate: 'This domain already exists',
addCraftError: 'Could not save, please try again',
```

- [ ] **Step 3: Add missing keys to the `fr` translation object**

```javascript
addCraftPlaceholder: 'Nouveau domaine',
addCraftConfirm: 'Ajouter',
addCraftTitle: 'Ajouter un domaine personnalisé',
addCraftEmpty: 'Saisissez un nom',
addCraftTooLong: 'Maximum 100 caractères',
addCraftInvalid: 'Nom invalide (lettres et chiffres uniquement)',
addCraftDuplicate: 'Ce domaine existe déjà',
addCraftError: 'Impossible de sauvegarder, réessayez',
```

- [ ] **Step 4: Verify syntax**

```bash
node --check /opt/video_elicitation_annotation_tool/js/app.js && echo "Syntax OK"
```

- [ ] **Step 5: Commit**

```bash
cd /opt/video_elicitation_annotation_tool
git add js/app.js
git commit -m "feat: add i18n keys for custom craft UI (en + fr)"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Confirm backend is running**

```bash
curl -s http://localhost:8005/api/health | python3 -m json.tool 2>&1 | head -5
```

Expected: JSON with `status` field.

- [ ] **Step 2: Test `GET /api/crafts` without auth — must return 401/403**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8005/api/crafts
```

Expected: `401` or `403` — confirms endpoint is auth-gated.

- [ ] **Step 3: Test `POST /api/crafts` without auth — must return 401/403**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"craft_label":"test"}' \
  http://localhost:8005/api/crafts
```

Expected: `401` or `403`

- [ ] **Step 4: Run DB unit tests one final time**

```bash
cd /opt/video_elicitation_annotation_tool/backend
python -m pytest test_crafts_db.py -v 2>&1 | tail -10
```

Expected: 3 passed, 0 failed

- [ ] **Step 5: Final commit (if any loose changes)**

```bash
cd /opt/video_elicitation_annotation_tool
git status
```

If clean, done.
