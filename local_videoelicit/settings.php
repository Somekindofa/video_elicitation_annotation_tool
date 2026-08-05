<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Settings for local_videoelicit plugin
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_videoelicit', get_string('pluginname', 'local_videoelicit'));

    // JWT Secret Key
    $settings->add(new admin_setting_configpasswordunmask(
        'local_videoelicit/jwt_secret',
        get_string('settings_jwt_secret', 'local_videoelicit'),
        get_string('settings_jwt_secret_desc', 'local_videoelicit'),
        'change-this-secret-key'
    ));

    // FastAPI Backend URL
    $settings->add(new admin_setting_configtext(
        'local_videoelicit/backend_url',
        get_string('settings_backend_url', 'local_videoelicit'),
        get_string('settings_backend_url_desc', 'local_videoelicit'),
        'http://localhost:8006',
        PARAM_URL
    ));

    // Token Quota
    $settings->add(new admin_setting_configtext(
        'local_videoelicit/token_quota',
        get_string('settings_token_quota', 'local_videoelicit'),
        get_string('settings_token_quota_desc', 'local_videoelicit'),
        '0',
        PARAM_INT
    ));

    // WebDAV Configuration Section
    $settings->add(new admin_setting_heading(
        'local_videoelicit/webdav_header',
        get_string('settings_webdav_header', 'local_videoelicit'),
        get_string('settings_webdav_header_desc', 'local_videoelicit')
    ));

    // WebDAV Base URL
    $settings->add(new admin_setting_configtext(
        'local_videoelicit/webdav_base_url',
        get_string('settings_webdav_base_url', 'local_videoelicit'),
        get_string('settings_webdav_base_url_desc', 'local_videoelicit'),
        'https://cloud.minesparis.psl.eu',
        PARAM_URL
    ));

    // WebDAV Service Account UUID (path segment in the WebDAV URL)
    $settings->add(new admin_setting_configtext(
        'local_videoelicit/webdav_user_id',
        get_string('settings_webdav_user_id', 'local_videoelicit'),
        get_string('settings_webdav_user_id_desc', 'local_videoelicit'),
        'aadda5c2-2019-103f-8e2d-bb8e1f6141ce',
        PARAM_TEXT
    ));

    // Shared library subfolder (read-only, browsable by all users)
    $settings->add(new admin_setting_configtext(
        'local_videoelicit/webdav_shared_folder',
        get_string('settings_webdav_shared_folder', 'local_videoelicit'),
        get_string('settings_webdav_shared_folder_desc', 'local_videoelicit'),
        'Shared',
        PARAM_TEXT
    ));

    // Knowledge Silo section
    $settings->add(new admin_setting_heading(
        'local_videoelicit/silo_header',
        get_string('settings_silo_header', 'local_videoelicit'),
        get_string('settings_silo_header_desc', 'local_videoelicit')
    ));

    $settings->add(new admin_setting_configtext(
        'local_videoelicit/silo_contact_email',
        get_string('settings_silo_contact_email', 'local_videoelicit'),
        get_string('settings_silo_contact_email_desc', 'local_videoelicit'),
        '',
        PARAM_EMAIL
    ));

    $ADMIN->add('localplugins', $settings);
}
