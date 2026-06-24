<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Video Elicitation Tool main page
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/classes/jwt_helper.php');

use local_videoelicit\jwt_helper;

// Get context parameter (defaults to user context)
$contextid = optional_param('contextid', 0, PARAM_INT);

// Require login
require_login();

if ($contextid) {
    $context = context::instance_by_id($contextid);
} else {
    // Default to user context
    $context = context_user::instance($USER->id);
}

// Check capability
require_capability('local/videoelicit:view', $context);

// Set up page
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/videoelicit/index.php', array('contextid' => $context->id)));
$PAGE->set_pagelayout('embedded');
$PAGE->set_title(get_string('pluginname', 'local_videoelicit'));
$PAGE->set_heading(get_string('videoelicit', 'local_videoelicit'));

// Generate JWT token for API calls
$roles = jwt_helper::get_user_roles($USER->id, $context);
$silo_contact_email = get_config('local_videoelicit', 'silo_contact_email') ?: '';
$jwt_token = jwt_helper::create_token($USER->id, $USER->username, $context->id, $roles, 60, $silo_contact_email);

// Build iframe URL with JWT token
// Pass WebDAV configuration to iframe
$owncloud_url = get_config('local_videoelicit', 'webdav_base_url');
$owncloud_user_id = get_config('local_videoelicit', 'webdav_user_id');

$iframeurl = new moodle_url('/videoelicit-ui/', array(
    'token' => $jwt_token,
    'owncloud_base_url' => $owncloud_url,
    'owncloud_user_id' => $owncloud_user_id,
    'webdav_api_url' => $CFG->wwwroot . '/local/videoelicit/webdav_api.php',
));

// Output header
echo $OUTPUT->header();

// Full-bleed iframe styling for embedded layout
echo html_writer::tag('style',
    'html, body, #page, #page-content, .region-main {height: 100%;}' .
    '.videoelicit-iframe {width: 100%; height: 100vh; border: 0; display: block;}'
);

// Render iframe container
echo html_writer::tag('iframe', '', array(
    'src' => $iframeurl->out(false),
    'class' => 'videoelicit-iframe',
    'allow' => 'microphone',
));

// Output footer
echo $OUTPUT->footer();


