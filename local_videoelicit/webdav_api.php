<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * WebDAV/OwnCloud API endpoints for Video Elicitation Tool
 * Provides directory browsing and video linking functionality
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

// Require login
require_login();

// Set content type to JSON
header('Content-Type: application/json');

// Add CORS headers for iframe communication
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Handle JSON POST data
if ($_SERVER['REQUEST_METHOD'] === 'POST' && 
    isset($_SERVER['CONTENT_TYPE']) && 
    strpos($_SERVER['CONTENT_TYPE'], 'application/json') !== false) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    if ($json_data && is_array($json_data)) {
        $_POST = array_merge($_POST, $json_data);
    }
}

// Get parameters
$action = required_param('action', PARAM_ALPHA);
$path = optional_param('path', '/', PARAM_RAW);
$contextid = optional_param('contextid', 0, PARAM_INT);

// Set content type to JSON
header('Content-Type: application/json');

// Get context
if ($contextid) {
    $context = context::instance_by_id($contextid);
} else {
    $context = context_system::instance();
}

// Check capability
require_capability('local/videoelicit:view', $context);

// Handle actions
switch ($action) {
    
    case 'checkconfig':
        handle_check_config();
        break;
        
    case 'browse':
        handle_browse($path);
        break;

    case 'sync':
        // Allow any logged-in user to sync their accessible WebDAV files into Moodle DB
        handle_sync($path);
        break;
        
    case 'link':
        require_capability('local/videoelicit:manage', $context);
        handle_link();
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
}

/**
 * Check if WebDAV is configured
 */
function handle_check_config() {
    $base_url = get_config('local_videoelicit', 'webdav_base_url');
    $username = get_config('local_videoelicit', 'webdav_username');
    $password = get_config('local_videoelicit', 'webdav_password');
    $user_id = get_config('local_videoelicit', 'webdav_user_id');
    
    $configured = !empty($base_url) && !empty($username) && !empty($password) && !empty($user_id);
    
    echo json_encode([
        'configured' => $configured,
        'base_url' => $configured ? $base_url : null,
    ]);
    exit;
}

/**
 * Browse WebDAV directory
 * 
 * @param string $path Directory path to browse
 */
function handle_browse($path) {
    try {
        $items = get_webdav_items($path);
        echo json_encode(['items' => $items]);
        exit;
    } catch (Exception $e) {
        error_log('WebDAV browse error: ' . $e->getMessage() . ' ' . $e->getTraceAsString());
        http_response_code(500);
        echo json_encode(['error' => 'Error browsing WebDAV: ' . $e->getMessage()]);
        exit;
    }
}

/**
 * Parse WebDAV PROPFIND XML response
 * 
 * @param string $xml_response XML response from server
 * @param string $base_webdav_url Base WebDAV URL (includes trailing slash)
 * @return array Array of directory items
 */
function parse_webdav_response($xml_response, $base_webdav_url) {
    $items = [];
    // DEBUG: Log the raw XML response for troubleshooting
    error_log('WebDAV: RAW XML RESPONSE START');
    error_log($xml_response);
    error_log('WebDAV: RAW XML RESPONSE END');
    
    try {
        // Check if response is empty
        if (empty($xml_response)) {
            error_log('WebDAV XML response is empty');
            return [];
        }
        
        // Suppress XML errors temporarily
        $use_errors = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xml_response);
        
        if ($xml === false) {
            $errors = libxml_get_errors();
            foreach ($errors as $error) {
                error_log('XML parse error: ' . $error->message . ' (Line: ' . $error->line . ')');
            }
            libxml_clear_errors();
            libxml_use_internal_errors($use_errors);
            return [];
        }
        
        libxml_use_internal_errors($use_errors);
        
        // Get the base path for self-reference filtering
        $base_url_parts = parse_url($base_webdav_url);
        $base_path_normalized = rtrim($base_url_parts['path'] ?: '/', '/');
        
        // Declare namespaces we'll use
        $namespaces = $xml->getNamespaces(true);
        $dav_ns = isset($namespaces['d']) ? $namespaces['d'] : 'DAV:';
        
        error_log('WebDAV: Namespaces found: ' . json_encode($namespaces));
        error_log('WebDAV: Using DAV namespace: ' . $dav_ns);
        error_log('WebDAV: Base path normalized: ' . $base_path_normalized);

        // DEBUG: show root element and number of children in DAV namespace
        error_log('WebDAV: XML root name: ' . $xml->getName());
        $dav_children = $xml->children($dav_ns);
        error_log('WebDAV: DAV-children count: ' . count($dav_children));
        
        // Iterate all children in the DAV namespace and check local name for 'response'
        foreach ($dav_children as $response) {
            error_log('WebDAV: loop response local name: ' . $response->getName());
            if ($response->getName() !== 'response') continue;
            try {
                $href = (string) $response->children('DAV:')->href;
                if (empty($href)) continue;
                $href_parts = parse_url($href);
                $href_path = rtrim($href_parts['path'] ?: '/', '/');
                if ($href_path === $base_path_normalized) continue;

                $propstat = $response->children('DAV:')->propstat;
                if (!$propstat) continue;
                $prop = $propstat->children('DAV:')->prop;
                if (!$prop) continue;

                $resourcetype = $prop->children('DAV:')->resourcetype;
                $is_collection = false;
                if ($resourcetype && isset($resourcetype->collection)) {
                    $is_collection = true;
                }

                $displayname = (string) $prop->children('DAV:')->displayname;
                $contentlength = (string) $prop->children('DAV:')->getcontentlength;
                $contenttype = (string) $prop->children('DAV:')->getcontenttype;
                $name = !empty($displayname) ? $displayname : urldecode(basename(rtrim($href, '/')));

                // DEBUG: log each candidate href and properties
                error_log('WebDAV: Candidate href="' . $href . '" name="' . $name . '" is_collection=' . ($is_collection ? '1' : '0') . ' contentlength=' . $contentlength);

                $item = [
                    'name' => $name,
                    'path' => $href,
                    'url' => $href,
                    'type' => $is_collection ? 'dir' : 'file',
                    'size' => $is_collection ? 0 : (int) $contentlength,
                    'mimetype' => $is_collection ? 'inode/directory' : $contenttype,
                ];
                $items[] = $item;
                error_log('WebDAV: Added item: ' . $name);
            } catch (Exception $e) {
                error_log('WebDAV: Error: ' . $e->getMessage());
                continue;
            }
        }
        
    } catch (Exception $e) {
        error_log('WebDAV XML parse exception: ' . $e->getMessage());
        return [];
    }
    
    // Sort: directories first, then files, alphabetically
    usort($items, function($a, $b) {
        if ($a['type'] !== $b['type']) {
            return $a['type'] === 'dir' ? -1 : 1;
        }
        return strcasecmp($a['name'], $b['name']);
    });
    
    return $items;
}

/**
 * Helper: perform PROPFIND and return parsed items for a path
 */
function get_webdav_items($path = '/') {
    // URL-decode
    $path = urldecode($path);

    // Get WebDAV credentials
    $base_url = get_config('local_videoelicit', 'webdav_base_url');
    $username = get_config('local_videoelicit', 'webdav_username');
    $password = get_config('local_videoelicit', 'webdav_password');
    $user_id = get_config('local_videoelicit', 'webdav_user_id');

    if (empty($base_url) || empty($username) || empty($password) || empty($user_id)) {
        throw new Exception('WebDAV credentials not configured');
    }

    $path = trim($path, '/');
    $webdav_url = rtrim($base_url, '/') . '/remote.php/dav/files/' . $user_id . '/';
    if (!empty($path) && $path !== '.') {
        $webdav_url .= rawurlencode($path) . '/';
    }

    // Make PROPFIND request
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $webdav_url);
    curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Depth: 1'));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($http_code !== 207 && $http_code !== 200) {
        throw new Exception('Failed to access WebDAV: ' . $error . ' (HTTP ' . $http_code . ')');
    }

    return parse_webdav_response($response, $webdav_url);
}

/**
 * Helper: idempotently register a WebDAV video into Moodle DB and FastAPI
 */
function register_webdav_video_record($url, $filename, $filesize = 0, $contextid = 0, $userid = 0) {
    global $DB, $USER;

    if (!$userid) {
        $userid = $USER->id;
    }

    if (!$contextid) {
        $contextid = optional_param('contextid', 0, PARAM_INT);
        if (!$contextid) {
            $context = context_user::instance($userid);
            $contextid = $context->id;
        }
    }

    // Check for existing registration for this user + URL
    $existing = $DB->get_record('local_videoelicit_videos', array('external_url' => $url, 'userid' => $userid));

    // Compute metadata (estimate duration) and prepare FastAPI payload
    $duration = extract_video_metadata($url);
    $base_url = get_config('local_videoelicit', 'webdav_base_url');
    $webdav_path = ltrim(str_replace($base_url, '', $url), '/');

    $fastapi_data = array(
        'filename' => $filename,
        'filepath' => $webdav_path,
        'url' => $url,
        'filesize' => $filesize,
        'duration' => $duration,
    );

    // Best-effort: ensure FastAPI has a corresponding record even if Moodle already has one
    $backend_url = get_config('local_videoelicit', 'backend_url') ?: 'http://localhost:8006';
    require_once(__DIR__ . '/classes/jwt_helper.php');
    $ctx = context::instance_by_id($contextid);
    $roles = \local_videoelicit\jwt_helper::get_user_roles($userid, $ctx);
    $jwt = \local_videoelicit\jwt_helper::create_token($userid, 'moodle_user', $contextid, $roles);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $backend_url . '/api/videos/webdav/register');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fastapi_data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json', 'Authorization: Bearer ' . $jwt));
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $fastapi_ok = ($http_code === 200 || $http_code === 201 || $http_code === 409);
    $fastapi_resp = null;
    if ($response) {
        $decoded = json_decode($response, true);
        $fastapi_resp = $decoded === null ? $response : $decoded;
    }

    if (!$fastapi_ok) {
        // 409 is OK (duplicate in FastAPI) — anything else is noteworthy
        error_log("Failed to register WebDAV video in FastAPI backend: HTTP $http_code - $response");
    }

    if ($existing) {
        // Attach FastAPI status to existing record for caller visibility
        $existing->fastapi_status = $http_code;
        $existing->fastapi_ok = $fastapi_ok;
        if (!$fastapi_ok) {
            $existing->fastapi_response = $fastapi_resp;
        }

        // Already in Moodle DB — return it (FastAPI was ensured above)
        return $existing;
    }

    // Not existing -> insert into Moodle DB now
    $video = new stdClass();
    $video->contextid = $contextid;
    $video->userid = $userid;
    $video->filename = $filename;
    $video->fileitemid = 0;
    $video->filearea = 'videos';
    $video->filepath = '/';
    $video->filesize = $filesize;
    $video->mimetype = 'video/mp4';
    $video->duration = $duration;
    $video->source_type = 'webdav';
    $video->external_url = $url;
    $video->timecreated = time();
    $video->timemodified = time();

    $video->id = $DB->insert_record('local_videoelicit_videos', $video);

    // Attach FastAPI registration metadata for caller
    $video->fastapi_status = $http_code;
    $video->fastapi_ok = $fastapi_ok;
    if (!$fastapi_ok) {
        $video->fastapi_response = $fastapi_resp;
    }

    return $video;
}

/**
 * Handle sync: register all accessible WebDAV files for the current user in Moodle DB
 */
function handle_sync($path = '/') {
    global $USER;

    // Safety limits to avoid extremely large crawls
    $MAX_DEPTH = 8;
    $MAX_FILES = 2000;

    try {
        $startPath = urldecode($path);
        $registered = array();
        $fileCount = 0;

        // Breadth-first traversal queue
        $queue = array($startPath);
        $depthMap = array($startPath => 0);

        while (!empty($queue)) {
            $current = array_shift($queue);
            $depth = isset($depthMap[$current]) ? $depthMap[$current] : 0;

            if ($depth > $MAX_DEPTH) {
                error_log("WebDAV sync: reached max depth for path={$current}");
                continue;
            }

            $items = array();
            try {
                $items = get_webdav_items($current);
            } catch (Exception $e) {
                error_log('WebDAV sync: failed to list ' . $current . ' - ' . $e->getMessage());
                continue;
            }

            foreach ($items as $item) {
                if ($item['type'] === 'dir') {
                    // enqueue subdirectory for traversal
                    $subpath = trim(str_replace(rtrim(get_config('local_videoelicit', 'webdav_base_url'), '/'), '', $item['path']), '/');
                    // normalize to leading slash format used by get_webdav_items
                    $subpath = '/' . ltrim($subpath, '/');
                    if (!isset($depthMap[$subpath])) {
                        $depthMap[$subpath] = $depth + 1;
                        $queue[] = $subpath;
                    }
                    continue;
                }

                // file
                if (!preg_match('/\.(mp4|m4v|webm|mov|avi|mkv|flv|mpg|mpeg)$/i', $item['name'])) {
                    continue;
                }

                if ($fileCount >= $MAX_FILES) {
                    error_log('WebDAV sync: reached maximum file count, stopping further registrations');
                    break 2; // exit both loops
                }

                // Register and count
                $video = register_webdav_video_record($item['url'], $item['name'], isset($item['size']) ? (int)$item['size'] : 0, 0, $USER->id);
                if ($video) {
                        $registered[] = array(
                            'id' => $video->id,
                            'filename' => $video->filename,
                            'external_url' => $video->external_url,
                            'filesize' => $video->filesize,
                            'fastapi_status' => isset($video->fastapi_status) ? $video->fastapi_status : null,
                            'fastapi_ok' => isset($video->fastapi_ok) ? (bool)$video->fastapi_ok : true,
                            'fastapi_response' => isset($video->fastapi_response) ? $video->fastapi_response : null,
                        );
                        $fileCount++;
                    }
            }
        }

        echo json_encode(array('registered' => $registered, 'files_registered' => $fileCount));
        exit;
    } catch (Exception $e) {
        error_log('WebDAV sync error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(array('error' => 'WebDAV sync failed: ' . $e->getMessage()));
        exit;
    }
}

/**
 * Link a WebDAV video to the plugin
 */
function handle_link() {
    global $DB, $USER;
    
    $url = required_param('url', PARAM_URL);
    $filename = required_param('filename', PARAM_TEXT);
    $filesize = optional_param('filesize', 0, PARAM_INT);
    $contextid = optional_param('contextid', 0, PARAM_INT);
    
    if (!$contextid) {
        $context = context_system::instance();
        $contextid = $context->id;
    }
    
    // Check capability
    require_capability('local/videoelicit:manage', context::instance_by_id($contextid));
    
    // Extract metadata from WebDAV video
    // For now, we'll just store basic info
    $duration = extract_video_metadata($url);
    
    // Create video record
    $video = new stdClass();
    $video->contextid = $contextid;
    $video->userid = $USER->id;
    $video->filename = $filename;
    $video->fileitemid = 0;  // Not applicable for WebDAV
    $video->filearea = 'videos';
    $video->filepath = '/';
    $video->filesize = $filesize;
    $video->mimetype = 'video/mp4';
    $video->duration = $duration;
    $video->source_type = 'webdav';
    $video->external_url = $url;
    $video->timecreated = time();
    $video->timemodified = time();
    
    // Insert into Moodle database
    $video->id = $DB->insert_record('local_videoelicit_videos', $video);
    
    // Also register in FastAPI backend database
    $backend_url = get_config('local_videoelicit', 'backend_url');
    if (empty($backend_url)) {
        $backend_url = 'http://localhost:8006';
    }
    
    // Generate JWT for FastAPI authentication
    require_once(__DIR__ . '/classes/jwt_helper.php');
    $context_obj = context::instance_by_id($contextid);
    $roles = \local_videoelicit\jwt_helper::get_user_roles($USER->id, $context_obj);
    $jwt = \local_videoelicit\jwt_helper::create_token($USER->id, $USER->username, $contextid, $roles);
    
    // Extract relative filepath from WebDAV URL (remove base URL)
    $base_url = get_config('local_videoelicit', 'webdav_base_url');
    $user_id = get_config('local_videoelicit', 'webdav_user_id');
    $webdav_path = str_replace($base_url, '', $url);
    // Remove leading slash if present
    $webdav_path = ltrim($webdav_path, '/');
    
    // Prepare data for FastAPI
    $fastapi_data = [
        'filename' => $filename,
        'filepath' => $webdav_path,  // Relative path on WebDAV server
        'url' => $url,  // Full WebDAV URL
        'filesize' => $filesize,
        'duration' => $duration,
    ];
    
    // Call FastAPI backend to register the video
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $backend_url . '/api/videos/webdav/register');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fastapi_data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $jwt,
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code !== 200 && $http_code !== 201) {
        error_log("Failed to register WebDAV video in FastAPI backend: HTTP $http_code - $response");
        // Continue anyway - video is registered in Moodle database
    }
    
    echo json_encode([
        'success' => true,
        'fastapi_status' => $http_code,
        'fastapi_ok' => ($http_code === 200 || $http_code === 201 || $http_code === 409),
        'fastapi_response' => (!$fastapi_ok ? $fastapi_resp : null),
        'video' => [
            'id' => $video->id,
            'filename' => $video->filename,
            'duration' => $video->duration,
            'source_type' => 'webdav',
        ],
    ]);
    exit;
}

/**
 * Extract video metadata from WebDAV
 * 
 * @param string $url WebDAV video URL
 * @return float Video duration in seconds (estimated)
 */
function extract_video_metadata($url) {
    // Get WebDAV credentials
    $username = get_config('local_videoelicit', 'webdav_username');
    $password = get_config('local_videoelicit', 'webdav_password');
    
    // Try to get file info via WebDAV HEAD request
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'HEAD');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    curl_exec($ch);
    $content_length = curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    curl_close($ch);
    
    // Estimate duration based on file size (rough approximation)
    // Assuming ~500KB per second for typical compressed video
    if ($content_length > 0) {
        $duration = $content_length / 500000;
        return round($duration, 2);
    }
    
    // Default to 0 if unable to determine
    return 0;
}
