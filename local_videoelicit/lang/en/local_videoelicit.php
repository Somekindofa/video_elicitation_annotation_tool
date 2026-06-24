<?php
// This file is part of Moodle - http://moodle.org/

/**
 * English language strings for local_videoelicit
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['pluginname'] = 'Video Elicitation Tool';
$string['videoelicit'] = 'Video Elicitation';
$string['videoelicit:view'] = 'View videos and annotations';
$string['videoelicit:annotate'] = 'Create annotations';
$string['videoelicit:manage'] = 'Upload and delete videos';
$string['videoelicit:viewall'] = 'View all users\' annotations';

// Settings
$string['settings_jwt_secret'] = 'JWT Secret Key';
$string['settings_jwt_secret_desc'] = 'Shared secret key for authenticating with FastAPI backend. Must match MOODLE_JWT_SECRET in backend .env file.';
$string['settings_backend_url'] = 'FastAPI Backend URL';
$string['settings_backend_url_desc'] = 'URL of the FastAPI backend server (e.g., http://localhost:8006)';
$string['settings_token_quota'] = 'Token Quota per User';
$string['settings_token_quota_desc'] = 'Maximum LLM tokens per user (0 = unlimited)';

// WebDAV/OwnCloud settings
$string['settings_webdav_header'] = 'OwnCloud/WebDAV Configuration';
$string['settings_webdav_header_desc'] = 'Configure institutional OwnCloud server for streaming videos without uploading copies to Moodle.';
$string['settings_webdav_base_url'] = 'OwnCloud Base URL';
$string['settings_webdav_base_url_desc'] = 'Full HTTPS URL of OwnCloud server (e.g., https://cloud.minesparis.psl.eu). Leave blank to disable WebDAV video linking.';
$string['settings_webdav_username'] = 'Service Account Username';
$string['settings_webdav_username_desc'] = 'Username for service account used to authenticate with OwnCloud. This account must have read access to video files.';
$string['settings_webdav_password'] = 'Service Account Password';
$string['settings_webdav_password_desc'] = 'Password for service account (encrypted in database).';
$string['settings_webdav_user_id'] = 'Service Account UUID';
$string['settings_webdav_user_id_desc'] = 'The UUID of the OwnCloud service account. Found in the WebDAV URL: /remote.php/dav/files/{UUID}/. Example: aadda5c2-2019-103f-8e2d-bb8e1f6141ce';
$string['settings_webdav_storage_path'] = 'Storage Root Folder';
$string['settings_webdav_storage_path_desc'] = 'Folder name inside the service account that acts as the root for all plugin storage. Default: Moodle_OwnCloud_Storage';
$string['settings_webdav_shared_folder'] = 'Shared Library Subfolder';
$string['settings_webdav_shared_folder_desc'] = 'Subfolder inside the Storage Root that contains admin-curated shared videos (e.g. Apprenties/, Expertes/). All users can browse this read-only. Default: Shared';

// UI strings
$string['upload_video'] = 'Upload Video';
$string['link_owncloud_video'] = 'Link OwnCloud Video';
$string['browse_owncloud'] = 'Browse OwnCloud Videos';
$string['no_videos'] = 'No videos available';
$string['recording'] = 'Recording...';
$string['transcribing'] = 'Transcribing...';
$string['annotations'] = 'Annotations';
$string['start_time'] = 'Start Time';
$string['end_time'] = 'End Time';
$string['transcription'] = 'Transcription';
$string['delete'] = 'Delete';
$string['export'] = 'Export Annotations';

// Scheduled tasks
$string['task_init_user_folders'] = 'Pre-create personal OwnCloud folders for all users';

// Errors
$string['error_upload'] = 'Error uploading video';
$string['error_stream'] = 'Error streaming video';
$string['error_permission'] = 'You do not have permission to access this resource';
$string['error_backend'] = 'Backend communication error';
$string['error_token_quota'] = 'You have exceeded your token quota';
$string['error_webdav_config'] = 'WebDAV/OwnCloud not configured by administrator';
$string['error_webdav_connect'] = 'Failed to connect to OwnCloud server';
$string['error_webdav_browse'] = 'Error browsing OwnCloud directory';
$string['error_webdav_link'] = 'Error linking OwnCloud video';

// Knowledge Silo settings
$string['settings_silo_header'] = 'Knowledge Silo';
$string['settings_silo_header_desc'] = 'Controls who can see elicitation content in the CraftPilot RAG.';
$string['settings_silo_contact_email'] = 'Silo contact email';
$string['settings_silo_contact_email_desc'] = 'Displayed to experts who have no cohort assigned. Leave blank to show "your Moodle administrator".';
