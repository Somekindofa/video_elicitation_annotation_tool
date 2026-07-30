<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Cache definitions for local_videoelicit
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$definitions = [
    // Short-lived opaque tokens used by stream.php to authenticate video range requests
    // without exposing the full JWT in server access logs or browser history.
    // Each ticket is bound to a (userid, videoid) pair and expires after 4 hours.
    'streamtickets' => [
        'mode'       => cache_store::MODE_APPLICATION,
        'simplekeys' => true,
        'ttl'        => 14400, // 4 hours — covers a long annotation session with seeking
    ],
];
