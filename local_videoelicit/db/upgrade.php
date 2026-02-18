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

    return true;
}
