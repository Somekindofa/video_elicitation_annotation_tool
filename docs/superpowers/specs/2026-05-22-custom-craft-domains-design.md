# Custom Craft Domains — Design Spec

**Date:** 2026-05-22
**Status:** Approved

## Summary

Allow users to add their own craft/domain names to the `craftSelector` dropdown. Custom domains are persisted per-user in the database and loaded at startup. They are invisible to other users.

## Database

New table: `mdl_local_videoelicit_crafts`

MySQL:
```sql
CREATE TABLE IF NOT EXISTS mdl_local_videoelicit_crafts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  userid      VARCHAR(255) NOT NULL,
  craft_key   VARCHAR(100) NOT NULL,
  craft_label VARCHAR(255) NOT NULL,
  timecreated INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user_craft (userid, craft_key)
);
```

PostgreSQL:
```sql
CREATE TABLE IF NOT EXISTS mdl_local_videoelicit_crafts (
  id          SERIAL PRIMARY KEY,
  userid      VARCHAR(255) NOT NULL,
  craft_key   VARCHAR(100) NOT NULL,
  craft_label VARCHAR(255) NOT NULL,
  timecreated INT NOT NULL DEFAULT 0,
  UNIQUE (userid, craft_key)
);
```

- `userid` — Moodle `current_user.userid` (string)
- `craft_key` — URL-safe slug auto-derived from `craft_label` (e.g. "My Woodworking" → "my_woodworking")
- `craft_label` — Display name as typed by the user
- `timecreated` — Unix timestamp set at insert

Table is created via `CREATE TABLE IF NOT EXISTS` in a new `ensure_crafts_table_sync` method called at app startup, consistent with how other ad-hoc tables in this codebase are handled.

## Backend

### New DB methods (`moodle_db.py`)

Following the existing sync/async executor pattern:

- `ensure_crafts_table_sync()` — `CREATE TABLE IF NOT EXISTS`, called once at startup
- `get_custom_crafts_by_user_sync(userid)` / `get_custom_crafts_by_user(userid)` — returns `[{craft_key, craft_label}]` for the given user, ordered by `timecreated`
- `create_custom_craft_sync(data)` / `create_custom_craft(data)` — inserts a row; raises on duplicate `(userid, craft_key)`

### New API endpoints (`main.py`)

Both require `verify_moodle_jwt`.

**`GET /api/crafts`**
- Returns `[{craft_key: str, craft_label: str}]` for the authenticated user
- Returns `[]` if no custom crafts exist

**`POST /api/crafts`**
- Body: `{craft_label: str}`
- Slugifies `craft_label` → `craft_key` (lowercase, spaces/special chars → `_`, strip leading/trailing `_`)
- Inserts row with `userid = current_user.userid`, `timecreated = now()`
- Returns `201` with `{craft_key, craft_label}`
- Returns `409` if `(userid, craft_key)` already exists

No delete endpoint in this iteration.

## Frontend (`js/app.js`)

### `createElicitControlsUI()` changes

After building the hardcoded `craftSelect` options and setting its value:

1. Call `loadCustomCrafts(craftSelect)` (async, non-blocking)
2. Append a small `+` button (`addCraftBtn`) immediately after `craftSelect` in the wrapper

### New function: `loadCustomCrafts(selectEl)`

- `GET /api/crafts`
- On success: for each `{craft_key, craft_label}`, append an `<option value={craft_key}>` to `selectEl`; if `state.craft` matches one of the returned keys, set `selectEl.value` to it
- On error (network, 401, etc.): hide `addCraftBtn` silently — graceful degradation

### New function: `showAddCraftInput(wrapperEl, selectEl)`

Triggered by clicking `addCraftBtn`. Replaces the button with:
- A small `<input type="text" placeholder="New domain name">` (same height as the select)
- An "Add" confirm button
- An "×" cancel button that restores the `+` button

On confirm:
1. Trim and validate the label (non-empty, max 100 chars)
2. `POST /api/crafts` with `{craft_label}`
3. On success: append new `<option>` to `selectEl`, set `selectEl.value = craft_key`, update `state.craft`, hide input, restore `+` button
4. On `409`: show inline "Already exists" message
5. On other error: show inline "Could not save" message

### Slugify helper (client-side)

Used only for optimistic duplicate detection — the canonical slug is always what the server returns.

```js
function slugifyCraft(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
```

## Error handling

- If `window.USER_ID` is null (no Moodle auth), `loadCustomCrafts` skips the fetch and hides `addCraftBtn`
- Network errors on load are silent; network errors on save show an inline message
- Duplicate craft: `409` → "Already exists" inline message, input stays open

## Out of scope

- Deleting custom crafts
- Renaming custom crafts
- Sharing crafts across users
- Custom crafts in export/LLM prompt customization (craft is passed as-is; LLM prompts will fall back to generic behavior for unknown craft keys)
