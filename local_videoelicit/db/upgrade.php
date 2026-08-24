<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Upgrade script for local_videoelicit plugin
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Upgrade function for local_videoelicit
 * @param int $oldversion The old version of the plugin
 * @return bool
 */
function xmldb_local_videoelicit_upgrade($oldversion) {
    global $DB;
    $dbman = $DB->get_manager();

    // Add WebDAV fields to videos table (2026-02-16).
    if ($oldversion < 2026021600) {
        $table = new xmldb_table('local_videoelicit_videos');

        // Add source_type field.
        $field = new xmldb_field('source_type', XMLDB_TYPE_CHAR, '20', null, XMLDB_NOTNULL, null, 'local', 'fastapi_video_id');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Add external_url field.
        $field = new xmldb_field('external_url', XMLDB_TYPE_TEXT, null, null, null, null, null, 'source_type');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        upgrade_plugin_savepoint(true, 2026021600, 'local', 'videoelicit');
    }

    // DATABASE CONSOLIDATION - Phase 1: Add missing tables and fields (2026-02-19)
    // ROLLBACK: If issues arise, restore from backup before running this upgrade
    if ($oldversion < 2026021902) {
        
        // 1. Add AI pipeline fields to annotations table (Moodle naming convention: lowercase, no underscores)
        $table = new xmldb_table('local_videoelicit_annotations');
        
        $fields_to_add = [
            ['judgestatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['judgedecision', XMLDB_TYPE_TEXT, null, null, null, null, null],
            ['taggingstatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['tags', XMLDB_TYPE_TEXT, null, null, null, null, null],
            ['reviewstatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['reviewresults', XMLDB_TYPE_TEXT, null, null, null, null, null],
            ['reviewattempts', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, 0],
            ['detectedtask', XMLDB_TYPE_CHAR, '255', null, null, null, null],
            ['issalient', XMLDB_TYPE_INTEGER, '1', null, null, null, 0],
            ['craft', XMLDB_TYPE_CHAR, '100', null, null, null, null],
            ['task', XMLDB_TYPE_CHAR, '255', null, null, null, null],
            ['feedback', XMLDB_TYPE_INTEGER, '1', null, null, null, null],
            ['feedbackchoices', XMLDB_TYPE_TEXT, null, null, null, null, null],
        ];
        
        foreach ($fields_to_add as list($name, $type, $length, $unsigned, $notnull, $sequence, $default)) {
            $field = new xmldb_field($name, $type, $length, $unsigned, $notnull, $sequence, $default, 'transcriptionstatus');
            if (!$dbman->field_exists($table, $field)) {
                $dbman->add_field($table, $field);
            }
        }
        
        // 2. Create segments table
        $table = new xmldb_table('local_videoelicit_segments');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('videoid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('name', XMLDB_TYPE_CHAR, '255', null, null, null, null);
            $table->add_field('starttime', XMLDB_TYPE_NUMBER, '10, 3', null, XMLDB_NOTNULL, null, null);
            $table->add_field('endtime', XMLDB_TYPE_NUMBER, '10, 3', null, XMLDB_NOTNULL, null, null);
            $table->add_field('thumbnailpath', XMLDB_TYPE_CHAR, '500', null, null, null, null);
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_key('videoid', XMLDB_KEY_FOREIGN, ['videoid'], 'local_videoelicit_videos', ['id']);
            
            $dbman->create_table($table);
        }
        
        // 3. Create projects table
        $table = new xmldb_table('local_videoelicit_projects');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('name', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, null);
            $table->add_field('description', XMLDB_TYPE_TEXT, null, null, null, null, null);
            $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            
            $dbman->create_table($table);
        }
        
        // 4. Add project reference to videos table
        $table = new xmldb_table('local_videoelicit_videos');
        $field = new xmldb_field('projectid', XMLDB_TYPE_INTEGER, '10', null, null, null, null);
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        
        // 5. Create tags table
        $table = new xmldb_table('local_videoelicit_tags');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('name', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL, null, null);
            $table->add_field('category', XMLDB_TYPE_CHAR, '50', null, XMLDB_NOTNULL, null, null);
            $table->add_field('usagecount', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, 0);
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_index('name_category', XMLDB_INDEX_UNIQUE, ['name', 'category']);
            
            $dbman->create_table($table);
        }
        
        // 6. Create tasks table
        $table = new xmldb_table('local_videoelicit_tasks');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('name', XMLDB_TYPE_CHAR, '200', null, XMLDB_NOTNULL, null, null); // Reduced from 255
            $table->add_field('craft', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL, null, null);
            $table->add_field('description', XMLDB_TYPE_TEXT, null, null, null, null, null);
            $table->add_field('ispublished', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, 1);
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_index('name_craft', XMLDB_INDEX_UNIQUE, ['name', 'craft']); // Total: 300 chars (within 333 limit)
            
            $dbman->create_table($table);
        }
        
        upgrade_plugin_savepoint(true, 2026021902, 'local', 'videoelicit');
    }

    // 2026-02-19 v03: Storage layout refactor
    // - Shared library is now at {storage_root}/{shared_folder}/ (configurable)
    // - User folders are now at {storage_root}/Users/{userid}/ (was user_{userid}/)
    // - webdav_storage_path and webdav_shared_folder settings added
    // No schema changes — only set default config values if not already set.
    if ($oldversion < 2026021903) {
        if (!get_config('local_videoelicit', 'webdav_storage_path')) {
            set_config('webdav_storage_path', 'Moodle_OwnCloud_Storage', 'local_videoelicit');
        }
        if (!get_config('local_videoelicit', 'webdav_shared_folder')) {
            set_config('webdav_shared_folder', 'Shared', 'local_videoelicit');
        }
        upgrade_plugin_savepoint(true, 2026021903, 'local', 'videoelicit');
    }

    // Multilingual elicitation pipeline (2026-08-19).
    // - Adds the 'language' field (ISO 639-1 code, detected by Whisper per recording).
    // - Also backfills annotations fields from the 2026021902 upgrade that were
    //   never added to install.xml, so fresh installs match upgraded ones.
    if ($oldversion < 2026081900) {
        $table = new xmldb_table('local_videoelicit_annotations');

        $field = new xmldb_field('language', XMLDB_TYPE_CHAR, '10', null, null, null, null, 'transcriptionstatus');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $fields_to_add = [
            ['judgestatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['judgedecision', XMLDB_TYPE_TEXT, null, null, null, null, null],
            ['taggingstatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['reviewstatus', XMLDB_TYPE_CHAR, '20', null, null, null, 'pending'],
            ['reviewresults', XMLDB_TYPE_TEXT, null, null, null, null, null],
            ['reviewattempts', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, 0],
            ['detectedtask', XMLDB_TYPE_CHAR, '255', null, null, null, null],
            ['issalient', XMLDB_TYPE_INTEGER, '1', null, null, null, 0],
            ['feedback', XMLDB_TYPE_INTEGER, '1', null, null, null, null],
            ['feedbackchoices', XMLDB_TYPE_TEXT, null, null, null, null, null],
        ];

        foreach ($fields_to_add as list($name, $type, $length, $unsigned, $notnull, $sequence, $default)) {
            $field = new xmldb_field($name, $type, $length, $unsigned, $notnull, $sequence, $default, 'language');
            if (!$dbman->field_exists($table, $field)) {
                $dbman->add_field($table, $field);
            }
        }

        upgrade_plugin_savepoint(true, 2026081900, 'local', 'videoelicit');
    }

    return true;
}
