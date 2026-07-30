<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Scheduled task: ensure every Moodle user has a personal OwnCloud folder.
 *
 * This is a safety net. On-demand creation (ensureuserfolder action) is the
 * primary mechanism — it runs synchronously before any upload. This task
 * runs nightly and pre-creates folders for users who have never opened the
 * plugin, so they never encounter a delay on first use.
 *
 * Schedule: daily at 02:00 (configurable in Site Admin → Server → Scheduled tasks)
 * Default: disabled — enable it if you want proactive pre-creation.
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_videoelicit\task;

defined('MOODLE_INTERNAL') || die();

class init_user_folders extends \core\task\scheduled_task {

    public function get_name(): string {
        return get_string('task_init_user_folders', 'local_videoelicit');
    }

    public function execute(): void {
        global $DB;

        $base_url    = get_config('local_videoelicit', 'webdav_base_url');
        $username    = get_config('local_videoelicit', 'webdav_username');
        $password    = get_config('local_videoelicit', 'webdav_password');
        $user_id     = get_config('local_videoelicit', 'webdav_user_id');
        $storage     = trim(get_config('local_videoelicit', 'webdav_storage_path') ?: 'Moodle_OwnCloud_Storage', '/');

        if (empty($base_url) || empty($username) || empty($password) || empty($user_id)) {
            mtrace('local_videoelicit: WebDAV not configured, skipping init_user_folders task.');
            return;
        }

        $root_url = rtrim($base_url, '/') . '/remote.php/dav/files/' . $user_id . '/';

        // Ensure Users/ container
        $this->mkcol_if_missing($root_url . $storage . '/Users/', $username, $password);

        $users = $DB->get_records_select(
            'user',
            'deleted = 0 AND id != 1 AND username != ?',
            ['guest'],
            'id ASC',
            'id'
        );

        $created = 0;
        $skipped = 0;
        $failed  = 0;

        foreach ($users as $user) {
            $folder_url = $root_url . $storage . '/Users/' . $user->id . '/';
            try {
                $result = $this->mkcol_if_missing($folder_url, $username, $password);
                if ($result === 'created') {
                    $created++;
                    mtrace("  Created folder for user {$user->id}");
                } else {
                    $skipped++;
                }
            } catch (\RuntimeException $e) {
                $failed++;
                mtrace("  FAILED for user {$user->id}: " . $e->getMessage());
            }
        }

        mtrace("local_videoelicit init_user_folders: {$created} created, {$skipped} already existed, {$failed} failed.");
    }

    /**
     * PROPFIND to check existence, then MKCOL if missing.
     * Returns 'created' | 'existed'.
     */
    private function mkcol_if_missing(string $url, string $username, string $password): string {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
            CURLOPT_USERPWD        => "$username:$password",
            CURLOPT_HTTPHEADER     => ['Depth: 0'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 207 || $code === 200) return 'existed';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => 'MKCOL',
            CURLOPT_USERPWD        => "$username:$password",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 201 || $code === 200) return 'created';

        throw new \RuntimeException("MKCOL failed HTTP $code for $url");
    }
}
