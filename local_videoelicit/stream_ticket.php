<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Stream ticket issuer for local_videoelicit
 *
 * Exchanges a valid JWT (or an existing Moodle session) for a short-lived opaque
 * stream ticket. FastAPI calls this endpoint server-to-server before redirecting
 * the browser to stream.php, so the full JWT never appears in browser URLs or
 * Apache access logs.
 *
 * Request: POST with JSON body {"videoid": <int>}
 *          Authorization: Bearer <jwt>   (or an existing Moodle session cookie)
 * Response: {"ticket": "<64-hex-char opaque token>"}
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/classes/jwt_helper.php');

use local_videoelicit\jwt_helper;

global $DB, $USER;

header('Content-Type: application/json');

// Only POST is accepted.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// --- Authentication ---
// Prefer an existing Moodle session; fall back to JWT in Authorization header.
// The SPA on /videoelicit-ui/ has no session cookie, so JWT is the expected path.
$userid = 0;

if (isloggedin()) {
    require_login();
    $userid = (int) $USER->id;
} else {
    // Read Authorization: Bearer <token> from request headers.
    // apache_request_headers() is not always available; check both sources.
    $auth_header = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth_header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $auth_header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    $jwt = '';
    if (preg_match('/^Bearer\s+([A-Za-z0-9\-_\.]+)$/i', trim($auth_header), $m)) {
        $jwt = $m[1];
    }

    if (empty($jwt)) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }

    $payload = jwt_helper::verify_token($jwt);
    if ($payload === false) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }

    $userid = (int) $payload['userid'];
    // Set the session user so capability checks work normally below.
    $user = $DB->get_record('user', ['id' => $userid, 'deleted' => 0], '*', IGNORE_MISSING);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'User not found']);
        exit;
    }
    \core\session\manager::set_user($user);
}

// --- Parse request body ---
$body = json_decode(file_get_contents('php://input'), true);
$videoid = isset($body['videoid']) ? (int) $body['videoid'] : 0;

if ($videoid <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'videoid is required']);
    exit;
}

// --- Authorisation: user must be able to view this specific video ---
$video = $DB->get_record('local_videoelicit_videos', ['id' => $videoid], '*', IGNORE_MISSING);
if (!$video) {
    http_response_code(404);
    echo json_encode(['error' => 'Video not found']);
    exit;
}

$context = context::instance_by_id($video->contextid);
if (!has_capability('local/videoelicit:view', $context)) {
    http_response_code(403);
    echo json_encode(['error' => 'Access denied']);
    exit;
}

// --- Issue ticket ---
// 32 bytes of CSPRNG → 64 hex chars. Opaque; contains no user or resource claims.
$ticket = bin2hex(random_bytes(32));

$cache = cache::make('local_videoelicit', 'streamtickets');
$cache->set($ticket, [
    'userid'  => $userid,
    'videoid' => $videoid,
    'expires' => time() + 14400, // belt-and-suspenders alongside cache TTL
]);

echo json_encode(['ticket' => $ticket]);
exit;
