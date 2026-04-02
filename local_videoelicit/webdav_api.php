<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * WebDAV/OwnCloud API endpoints for Video Elicitation Tool
 * Provides directory browsing, upload proxying, and video linking functionality.
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

// Require login
require_login();

// CORS headers for iframe / same-site fetch
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// proxyupload streams raw bytes — no JSON header for that action.
$action = required_param('action', PARAM_ALPHANUMEXT);

if ($action !== 'proxyupload') {
    header('Content-Type: application/json');
}

$path      = optional_param('path',      '/', PARAM_RAW);
$contextid = optional_param('contextid', 0,   PARAM_INT);

// Resolve context
if ($contextid) {
    $context = context::instance_by_id($contextid);
} else {
    $context = context_system::instance();
}

require_capability('local/videoelicit:view', $context);

// ===========================================================================
// Action router
// ===========================================================================
switch ($action) {

    case 'checkconfig':
        handle_check_config();
        break;

    case 'browse':
        handle_browse($path);
        break;

    case 'ensureuserfolder':
        handle_ensure_user_folder();
        break;

    case 'getuploadurl':
        handle_get_upload_url();
        break;

    case 'proxyupload':
        // Streams multipart POST file body to OwnCloud via HTTP/1.1 curl.
        // No JSON content-type — response is JSON but only after streaming.
        handle_proxy_upload();
        break;

    case 'registerupload':
        handle_register_upload();
        break;

    case 'link':
        handle_link_video();
        break;

    case 'delete':
        handle_delete();
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action: ' . $action]);
        exit;
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Return [base_webdav_url, username, password, user_uuid, base_folder].
 * Falls back to plugin settings, then .env-style constants if set.
 */
function webdav_credentials(): array {
    // Try Moodle plugin settings first
    $base_url   = get_config('local_videoelicit', 'webdav_base_url')    ?: '';
    $username   = get_config('local_videoelicit', 'webdav_username')    ?: '';
    $password   = get_config('local_videoelicit', 'webdav_password')    ?: '';
    $user_uuid  = get_config('local_videoelicit', 'webdav_user_id')     ?: '';
    $base_folder= get_config('local_videoelicit', 'webdav_shared_folder') ?: '';

    // Hard-coded fallback (matches backend/.env)
    if (empty($base_url))    $base_url    = 'https://cloud.minesparis.psl.eu';
    if (empty($username))    $username    = 'theo.akbas';
    if (empty($password))    $password    = 'minesparistechTetonet90!';
    if (empty($user_uuid))   $user_uuid   = 'aadda5c2-2019-103f-8e2d-bb8e1f6141ce';
    if (empty($base_folder)) $base_folder = 'craftpilot_shared';

    // Sanitize base_folder: strip a leading user UUID (avoid duplicated UUID in URLs)
    $base_folder = trim($base_folder, "/ ");
    if (!empty($user_uuid)) {
        $base_folder = preg_replace('#^' . preg_quote($user_uuid, '#') . '/?#', '', $base_folder);
    }

    return [$base_url, $username, $password, $user_uuid, $base_folder];
}

/** Base WebDAV URL for the service account (files/ namespace). */
function webdav_root_url(): string {
    [$base_url, , , $user_uuid] = webdav_credentials();
    return rtrim($base_url, '/') . '/remote.php/dav/files/' . $user_uuid . '/';
}

/** Path to the per-user upload folder (relative, no leading slash). */
function user_folder_path(int $userid): string {
    return 'Moodle_OwnCloud_Storage/Users/' . $userid;
}

/**
 * Encode a file path for use in a WebDAV URL, preserving forward slashes.
 */
function rawurlencode_path(string $path): string {
    return implode('/', array_map('rawurlencode', explode('/', $path)));
}

/** Register a video URL into the Moodle DB (idempotent). */
function register_video_in_moodle(string $url, string $filename, int $filesize = 0): ?stdClass {
    global $DB, $USER;

    $userid = (int) $USER->id;

    $existing = $DB->get_record('local_videoelicit_videos', [
        'external_url' => $url,
        'userid'       => $userid,
    ]);
    if ($existing) {
        return $existing;
    }

    $context = context_user::instance($userid);

    $video               = new stdClass();
    $video->contextid    = $context->id;
    $video->userid       = $userid;
    $video->filename     = $filename;
    $video->fileitemid   = 0;
    $video->filearea     = 'videos';
    $video->filepath     = '/';
    $video->filesize     = $filesize;
    $video->mimetype     = 'video/mp4';
    $video->duration     = 0;
    $video->source_type  = 'webdav';
    $video->external_url = $url;
    $video->timecreated  = time();
    $video->timemodified = time();

    $video->id = $DB->insert_record('local_videoelicit_videos', $video);
    return $video;
}

// ===========================================================================
// Action: checkconfig
// ===========================================================================
function handle_check_config(): void {
    [$base_url, $username, $password, $user_uuid] = webdav_credentials();
    $configured = !empty($base_url) && !empty($username) && !empty($password) && !empty($user_uuid);
    echo json_encode(['configured' => $configured]);
    exit;
}

// ===========================================================================
// Action: browse
// ===========================================================================
function handle_browse(string $path): void {
    [$base_url, $username, $password, $user_uuid, $base_folder] = webdav_credentials();

    // Log key inputs for debug (DO NOT log password)
    error_log("local_videoelicit: handle_browse invoked - user_id=" . (isset($USER) ? $USER->id : 'unknown') . ", path='{$path}', base_url='{$base_url}', user_uuid='{$user_uuid}', base_folder='{$base_folder}'");

    // Build WebDAV URL candidates and try them in order until one succeeds
    // Important: if the incoming $path already references the storage root (e.g. starts with
    // 'Moodle_OwnCloud_Storage' or with the configured base_folder) we MUST NOT prefix the
    // configured `base_folder` again — that was causing lookups like
    // 'craftpilot_shared/Moodle_OwnCloud_Storage/Users/280' which do not exist.
    $rawpath = ltrim($path, '/');
    $candidates = [];

    if ($rawpath === '' || $rawpath === '.') {
        // Root: prefer configured base folder (if any), but also allow plain root as fallback
        if (!empty($base_folder)) {
            $candidates[] = webdav_root_url() . rawurlencode_path($base_folder) . '/';
        }
        $candidates[] = webdav_root_url();
    } else {
        // If caller already passed a path that appears to be an absolute storage path
        // or already includes the configured base_folder, treat it as a full relative path
        $normalizedBaseFolder = trim((string)$base_folder, '/');
        $startsWithBaseFolder = $normalizedBaseFolder !== '' && (strpos($rawpath, $normalizedBaseFolder) === 0);
        $startsWithStorageRoot = (strpos($rawpath, 'Moodle_OwnCloud_Storage') === 0);

        if ($startsWithBaseFolder || $startsWithStorageRoot) {
            // Do not prefix base_folder — the client passed an absolute relative path already
            $candidates[] = webdav_root_url() . rawurlencode_path($rawpath) . '/';
        } else {
            // Try base_folder-prefixed first (common deployment), then the plain path
            if (!empty($base_folder)) {
                $candidates[] = webdav_root_url() . rawurlencode_path($base_folder) . '/' . rawurlencode_path($rawpath) . '/';
            }
            $candidates[] = webdav_root_url() . rawurlencode_path($rawpath) . '/';
        }
    }

    // Remove duplicates while preserving order
    $candidates = array_values(array_unique($candidates));

    $last_response = null;
    $last_code = 0;
    foreach ($candidates as $webdav_url) {
        error_log("local_videoelicit: attempting PROPFIND webdav_url='{$webdav_url}' for path='{$path}'");

        $ch = curl_init($webdav_url);
        curl_setopt_array($ch, [
            CURLOPT_USERPWD        => "$username:$password",
            CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
            CURLOPT_HTTPHEADER     => ['Depth: 1'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        ]);

        $response  = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_err  = curl_error($ch);
        curl_close($ch);

        $last_response = $response;
        $last_code = $http_code;

        if ($http_code === 207 || $http_code === 200) {
            // Success — return parsed items and the resolved URL for client visibility
            $items = parse_webdav_response($response, $webdav_url);
            echo json_encode(['items' => $items, 'resolved_path' => $webdav_url]);
            exit;
        }

        // If response was 404, try next candidate; otherwise stop and report
        if ($http_code !== 404) {
            break;
        }
    }

    error_log("local_videoelicit: webdav PROPFIND failed after trying candidates - last_http={$last_code}; body='" . substr((string)$last_response, 0, 2000) . "'");
    http_response_code(502);
    echo json_encode([
        'error' => "PROPFIND failed (HTTP {$last_code})",
        'remote_http_code' => $last_code,
        'remote_body' => substr((string)$last_response, 0, 2000),
        'tried_urls' => $candidates,
    ]);
    exit;
}

// ===========================================================================
// Action: ensureuserfolder
// Create the user's folder (and missing parent folders) if necessary and return
// the *relative* path that should be used for subsequent PROPFIND/PUT calls.
// ===========================================================================
function handle_ensure_user_folder(): void {
    global $USER;
    [$base_url, $username, $password, $user_uuid, $base_folder] = webdav_credentials();

    $userid      = (int) $USER->id;
    $wanted_rel  = user_folder_path($userid); // e.g. "Moodle_OwnCloud_Storage/Users/280"

    // Helper: perform MKCOL on a single relative path (relative to webdav_root_url())
    $mkcol_once = function(string $rel) use ($username, $password) : array {
        $url = webdav_root_url() . rawurlencode_path($rel);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_USERPWD        => "$username:$password",
            CURLOPT_CUSTOMREQUEST  => 'MKCOL',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $body = curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD) ? curl_exec($ch) : '';
        curl_close($ch);
        return ['code' => $code, 'url' => $url];
    };

    // Helper: ensure each segment in the relative path exists (iterative MKCOL)
    $ensure_rel_path = function(string $rel) use ($mkcol_once) : bool {
        $parts = array_filter(explode('/', $rel), 'strlen');
        $prefix = '';
        foreach ($parts as $p) {
            $prefix = ($prefix === '') ? $p : ($prefix . '/' . $p);
            $res = $mkcol_once($prefix);
            // 201 = created, 405 = already exists — treat both as success
            if (!in_array($res['code'], [201, 405], true)) {
                // failure for this prefix
                error_log("local_videoelicit: MKCOL failed for prefix='" . $prefix . "' code=" . $res['code']);
                return false;
            }
        }
        return true;
    };

    // Try to ensure the canonical path first (relative to webdav root)
    if ($ensure_rel_path($wanted_rel)) {
        $folder_rel = $wanted_rel;
        $folder_url = webdav_root_url() . rawurlencode_path($folder_rel);
        echo json_encode(['success' => true, 'folder_url' => $folder_url, 'folder_path' => $folder_rel]);
        exit;
    }

    // If that failed, try prefixing the configured base_folder (if set) and ensure it
    if (!empty($base_folder)) {
        $candidate = rtrim($base_folder, '/') . '/' . ltrim($wanted_rel, '/');
        if ($ensure_rel_path($candidate)) {
            $folder_rel = $candidate;
            $folder_url = webdav_root_url() . rawurlencode_path($folder_rel);
            echo json_encode(['success' => true, 'folder_url' => $folder_url, 'folder_path' => $folder_rel]);
            exit;
        }
    }

    // Last resort: return an error so the frontend can fall back gracefully
    http_response_code(500);
    echo json_encode(['error' => 'Failed to ensure user folder on OwnCloud/WebDAV (MKCOL failure)']);
    exit;
}

// ===========================================================================
// Action: getuploadurl
// ===========================================================================
function handle_get_upload_url(): void {
    global $USER;
    [$base_url, $username, $password] = webdav_credentials();

    $filename = required_param('filename', PARAM_FILE);
    $userid   = (int) $USER->id;

    $folder_path = user_folder_path($userid);
    $file_rel    = $folder_path . '/' . $filename;
    $file_url    = webdav_root_url() . rawurlencode_path($file_rel);
    $auth_b64    = base64_encode("$username:$password");

    echo json_encode([
        'put_url'   => $file_url,
        'file_path' => $file_rel,
        'auth'      => $auth_b64,
    ]);
    exit;
}

// ===========================================================================
// Action: proxyupload
// Streams the browser-submitted file body to OwnCloud via HTTP/1.1 curl.
// Avoids HTTP/2 ERR_HTTP2_PROTOCOL_ERROR on large files.
// ===========================================================================
function handle_proxy_upload(): void {
    global $USER;

    header('Content-Type: application/json');

    [$base_url, $username, $password] = webdav_credentials();

    $filename = required_param('filename', PARAM_FILE);
    $userid   = (int) $USER->id;

    // Validate uploaded file
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $err = $_FILES['file']['error'] ?? 'no file';
        http_response_code(400);
        echo json_encode(['error' => "Upload error: $err"]);
        exit;
    }

    $tmp_path   = $_FILES['file']['tmp_name'];
    $filesize   = (int) $_FILES['file']['size'];
    $folder_path= user_folder_path($userid);
    $file_rel   = $folder_path . '/' . $filename;
    $file_url   = webdav_root_url() . rawurlencode_path($file_rel);

    // Open file handle for streaming (avoid loading into memory)
    $fh = fopen($tmp_path, 'rb');
    if (!$fh) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot open temp file']);
        exit;
    }

    // Stream PUT to OwnCloud over HTTP/1.1
    $ch = curl_init($file_url);
    curl_setopt_array($ch, [
        CURLOPT_USERPWD        => "$username:$password",
        CURLOPT_PUT            => true,
        CURLOPT_INFILE         => $fh,
        CURLOPT_INFILESIZE     => $filesize,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 0,        // No timeout — large files
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/octet-stream',
            'Expect:',              // Disable 100-continue to avoid hangs
        ],
    ]);

    curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_err  = curl_error($ch);
    curl_close($ch);
    fclose($fh);

    if ($http_code === 201 || $http_code === 204 || $http_code === 200) {
        echo json_encode([
            'success'   => true,
            'file_path' => $file_rel,
            'file_url'  => $file_url,
            'filesize'  => $filesize,
        ]);
    } else {
        http_response_code(502);
        echo json_encode(['error' => "OwnCloud returned HTTP $http_code: $curl_err"]);
    }
    exit;
}

// ===========================================================================
// Action: registerupload
// Verify file exists on OwnCloud (PROPFIND), then create Moodle DB record.
// ===========================================================================
function handle_register_upload(): void {
    global $DB, $USER;

    $filename  = required_param('filename',  PARAM_FILE);
    $file_path = required_param('file_path', PARAM_TEXT);
    $filesize  = optional_param('filesize',  0, PARAM_INT);

    [$base_url, $username, $password] = webdav_credentials();
    $absolute = webdav_root_url() . ltrim(rawurlencode_path($file_path), '/');

    // Server-side PROPFIND to confirm the file landed on OwnCloud.
    $ch = curl_init($absolute);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'PROPFIND',
        CURLOPT_USERPWD        => "$username:$password",
        CURLOPT_HTTPHEADER     => ['Depth: 0'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
    ]);
    curl_exec($ch);
    $propfind_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($propfind_code !== 207 && $propfind_code !== 200) {
        http_response_code(422);
        echo json_encode(['error' => "File not found on OwnCloud (PROPFIND: $propfind_code)"]);
        exit;
    }

    $video = register_video_in_moodle($absolute, $filename, $filesize);

    echo json_encode([
        'success'   => true,
        'file_name' => $filename,
        'file_path' => $file_path,
        'file_url'  => $absolute,
        'moodle_id' => $video ? (int) $video->id : null,
    ]);
    exit;
}

// ===========================================================================
// Action: link
// Register any existing OwnCloud file for the current user (idempotent).
// ===========================================================================
function handle_link_video(): void {
    global $DB, $USER;

    $url      = required_param('url',      PARAM_RAW);   // OwnCloud WebDAV URL
    $filename = required_param('filename', PARAM_TEXT);
    $filesize = optional_param('filesize', 0, PARAM_INT);

    $video = register_video_in_moodle($url, $filename, $filesize);

    if ($video) {
        echo json_encode(['success' => true, 'video' => ['id' => (int)$video->id, 'filename' => $video->filename]]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Could not register video']);
    }
    exit;
}

// ===========================================================================
// Shared: parse WebDAV PROPFIND XML response
// ===========================================================================
function parse_webdav_response(string $xml_response, string $base_webdav_url): array {
    $items = [];

    try {
        $xml = new SimpleXMLElement($xml_response);
        $ns  = $xml->getNamespaces(true);
        $d   = isset($ns['d']) ? $ns['d'] : 'DAV:';

        foreach ($xml->children($d) as $response) {
            $href = (string) $response->children($d)->href;

            // Decode for comparison with base URL
            $decoded_href = rawurldecode($href);
            $parsed_base  = parse_url($base_webdav_url, PHP_URL_PATH);
            $parsed_href  = parse_url($decoded_href,    PHP_URL_PATH);

            if (rtrim($parsed_href, '/') === rtrim($parsed_base, '/')) continue;

            $propstat = $response->children($d)->propstat;
            $prop     = $propstat->children($d)->prop;

            $resourcetype  = $prop->children($d)->resourcetype;
            // only mark as collection if a <collection/> element actually exists
            $is_collection = false;
            if ($resourcetype) {
                $coll = $resourcetype->children($d)->collection;
                if ($coll && count($coll) > 0) {
                    $is_collection = true;
                }
            }

            $displayname   = (string) $prop->children($d)->displayname;
            // OwnCloud/CalDAV responses use getcontentlength/getcontenttype for files
            $contentlength = (string) $prop->children($d)->getcontentlength ?: (string) $prop->children($d)->getrescontentlength;
            $contenttype   = (string) $prop->children($d)->getcontenttype ?: (string) $prop->children($d)->getrescontenttype;

            $name = !empty($displayname) ? $displayname : basename(rawurldecode(rtrim($href, '/')));

            $items[] = [
                'name'     => $name,
                'path'     => rawurldecode($href),
                'url'      => rawurldecode($href),
                'type'     => $is_collection ? 'folder' : 'file',
                'size'     => $is_collection ? 0 : (int) $contentlength,
                'mimetype' => $is_collection ? 'inode/directory' : $contenttype,
            ];
        }
    } catch (Exception $e) {
        return [];
    }

    usort($items, function ($a, $b) {
        if ($a['type'] !== $b['type']) return $a['type'] === 'folder' ? -1 : 1;
        return strcasecmp($a['name'], $b['name']);
    });

    return $items;
}
