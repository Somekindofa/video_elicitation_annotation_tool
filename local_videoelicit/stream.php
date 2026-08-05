<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Video streaming proxy with HTTP Range request support
 * 
 * This file streams video files from Moodle's file API with support for
 * byte-range requests, enabling seeking in HTML5 video players.
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/filelib.php');
require_once(__DIR__ . '/classes/jwt_helper.php');

// Get parameters
$videoid = required_param('videoid', PARAM_INT);
// Opaque stream ticket (preferred over raw JWT — does not expose user claims in logs).
// Only hex characters are valid; anything else is stripped defensively.
$ticket = optional_param('ticket', '', PARAM_ALPHANUMEXT);
// Legacy JWT fallback: stripped to base64url + '.' characters to block header injection.
$token = optional_param('token', '', PARAM_RAW);
if ($token !== '') {
    $token = preg_replace('/[^A-Za-z0-9\-_\.]/', '', $token);
}
global $DB, $USER;

// Authenticate: prefer existing Moodle session, then opaque ticket, then legacy JWT.
// The SPA runs on a different origin (/videoelicit-ui/) and has no Moodle session
// cookie, so range requests arrive with a ?ticket= parameter issued by stream_ticket.php.
if (!isloggedin()) {
    if (!empty($ticket)) {
        // Validate the opaque stream ticket from cache.
        $cache = cache::make('local_videoelicit', 'streamtickets');
        $ticket_data = $cache->get($ticket);
        if (!$ticket_data
                || (int) $ticket_data['videoid'] !== (int) $videoid
                || $ticket_data['expires'] < time()) {
            header('HTTP/1.1 401 Unauthorized');
            die('Invalid or expired stream ticket');
        }
        $userid = (int) $ticket_data['userid'];
        $user = $DB->get_record('user', ['id' => $userid, 'deleted' => 0], '*', MUST_EXIST);
        \core\session\manager::set_user($user);
    } elseif (!empty($token)) {
        // Legacy fallback: raw JWT in URL (less secure; kept for backward compatibility).
        $payload = \local_videoelicit\jwt_helper::verify_token($token);
        if ($payload === false) {
            header('HTTP/1.1 401 Unauthorized');
            die('Invalid or expired token');
        }
        $userid = (int) $payload['userid'];
        $user = $DB->get_record('user', ['id' => $userid, 'deleted' => 0], '*', MUST_EXIST);
        \core\session\manager::set_user($user);
    } else {
        header('HTTP/1.1 401 Unauthorized');
        die('Authentication required');
    }
} else {
    require_login();
}

// Get video record
$video = $DB->get_record('local_videoelicit_videos', array('id' => $videoid), '*', MUST_EXIST);

// Check permissions
$context = context::instance_by_id($video->contextid);
require_capability('local/videoelicit:view', $context);

// Flush all Moodle/PHP output buffers before streaming binary data.
// Moodle's bootstrap (config.php) activates output buffering. If we don't
// clear it here, PHP will try to buffer the entire video in memory, which
// exhausts PHP-FPM worker RAM on large files and causes AH01075 errors and
// NS_ERROR_DOM_MEDIA_METADATA_ERR in the browser.
while (ob_get_level() > 0) {
    ob_end_clean();
}

// Release the Moodle session lock before streaming.
// stream.php is called multiple times in parallel (one per Range request) by the
// browser. PHP/Moodle holds the session write-lock for the entire request. Without
// this, all range requests are serialized — each blocks waiting for the previous
// streaming request to finish, causing the player to buffer instead of seeking.
\core\session\manager::write_close();

// Stream from Moodle File API
stream_local_video($video);

/**
 * Stream video from Moodle File API
 * 
 * @param object $video Video record from database
 */
function stream_local_video($video) {
    global $DB;
    
    $fs = get_file_storage();
    $file = $fs->get_file(
        $video->contextid,
        'local_videoelicit',
        $video->filearea,
        $video->fileitemid,
        $video->filepath,
        $video->filename
    );

    if (!$file) {
        header('HTTP/1.1 404 Not Found');
        die('Video file not found');
    }

    stream_file_with_range_support($file->get_content_file_handle(), 
                                   $file->get_filesize(), 
                                   $file->get_mimetype(), 
                                   $file->get_filename());
}

/**
 * Stream file from file handle with HTTP Range request support
 * 
 * @param resource $handle File handle from Moodle File API
 * @param int $filesize Total file size in bytes
 * @param string $mimetype MIME type of file
 * @param string $filename Display filename
 */
function stream_file_with_range_support($handle, $filesize, $mimetype, $filename) {
    if ($handle === false) {
        die('Error opening file');
    }
    
    // Handle Range requests for video seeking
    $range = isset($_SERVER['HTTP_RANGE']) ? $_SERVER['HTTP_RANGE'] : '';

    if (!empty($range)) {
        // Parse range header (e.g., "bytes=0-1023")
        if (preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
            $start = intval($matches[1]);
            $end = !empty($matches[2]) ? intval($matches[2]) : $filesize - 1;
            
            // Ensure valid range
            if ($start >= $filesize || $end >= $filesize || $start > $end) {
                header('HTTP/1.1 416 Range Not Satisfiable');
                header("Content-Range: bytes */$filesize");
                fclose($handle);
                die();
            }
            
            $length = $end - $start + 1;
            
            // Send partial content headers
            header('HTTP/1.1 206 Partial Content');
            header("Content-Range: bytes $start-$end/$filesize");
            header('Accept-Ranges: bytes');
            header("Content-Length: $length");
            header("Content-Type: $mimetype");
            header('Content-Disposition: inline; filename="' . $filename . '"');
            
            // Stream the requested chunk
            fseek($handle, $start);
            $remaining = $length;
            
            while ($remaining > 0 && !feof($handle)) {
                $chunk_size = min(1048576, $remaining);
                $data = fread($handle, $chunk_size);
                if ($data === false) {
                    break;
                }
                echo $data;
                $remaining -= strlen($data);
                flush();
            }
            
            fclose($handle);
            exit;
        }
    }

    // No range request - stream entire file
    header('HTTP/1.1 200 OK');
    header('Accept-Ranges: bytes');
    header("Content-Length: $filesize");
    header("Content-Type: $mimetype");
    header('Content-Disposition: inline; filename="' . $filename . '"');
    header('Cache-Control: public, max-age=3600');

    // Stream full file
    while (!feof($handle)) {
        $data = fread($handle, 1048576);
        if ($data === false) {
            break;
        }
        echo $data;
        flush();
    }
    
    fclose($handle);
}
