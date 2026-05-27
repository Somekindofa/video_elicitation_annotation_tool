"""Unit tests for custom crafts DB layer (run from backend/ directory)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault('MOODLE_DB_TYPE', 'postgresql')
os.environ.setdefault('MOODLE_DB_HOST', 'localhost')
os.environ.setdefault('MOODLE_DB_NAME', 'test')
os.environ.setdefault('MOODLE_DB_USER', 'test')
os.environ.setdefault('MOODLE_DB_PASSWORD', 'test')
os.environ.setdefault('MOODLE_TABLE_PREFIX', 'mdl_')

import pytest
from unittest.mock import MagicMock, patch


def make_mock_conn(rows=None):
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
