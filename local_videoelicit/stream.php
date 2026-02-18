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

// Get parameters
$videoid = required_param('videoid', PARAM_INT);
$token = optional_param('token', '', PARAM_RAW);

// Require login
require_login();

global $DB, $USER;

// Get video record
$video = $DB->get_record('local_videoelicit_videos', array('id' => $videoid), '*', MUST_EXIST);

// Check permissions
$context = context::instance_by_id($video->contextid);
require_capability('local/videoelicit:view', $context);

// Optionally verify JWT token for extra security
if (!empty($token)) {
    // Token verification logic here if needed
}

// Route to appropriate streaming handler based on source type
$source_type = $video->source_type ?? 'local';

if ($source_type === 'webdav') {
    // Stream from WebDAV/OwnCloud
    stream_webdav_video($video);
} else {
    // Stream from Moodle File API (default)
    stream_local_video($video);
}

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
 * Stream video from WebDAV/OwnCloud server
 * 
 * This function proxies streaming requests to an external WebDAV server (typically OwnCloud/Nextcloud)
 * while preserving HTTP Range request support for video seeking.
 * 
 * @param object $video Video record with external_url field populated
 */
function stream_webdav_video($video) {
    global $CFG;
    
    // Get WebDAV credentials from plugin settings
    $webdav_username = get_config('local_videoelicit', 'webdav_username');
    $webdav_password = get_config('local_videoelicit', 'webdav_password');
    
    if (empty($webdav_username) || empty($webdav_password)) {
        header('HTTP/1.1 500 Internal Server Error');
        die('WebDAV credentials not configured');
    }
    
    $external_url = $video->external_url;
    
    if (empty($external_url)) {
        header('HTTP/1.1 500 Internal Server Error');
        die('WebDAV video URL not configured');
    }
    
    // Parse range header if present
    $range = isset($_SERVER['HTTP_RANGE']) ? $_SERVER['HTTP_RANGE'] : '';
    
    // Initialize cURL for HEAD request to get file metadata
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $external_url);
    curl_setopt($ch, CURLOPT_USERPWD, "$webdav_username:$webdav_password");
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'HEAD');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true); // Enable SSL verification
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $content_length = curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    $content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    
    if ($http_code !== 200) {
        curl_close($ch);
        header('HTTP/1.1 404 Not Found');
        die('Remote video file not found');
    }
    
    curl_close($ch);
    
    $filesize = (int) $content_length;
    $mimetype = !empty($content_type) ? $content_type : 'video/mp4';
    $filename = basename(parse_url($external_url, PHP_URL_PATH));
    
    // Handle range requests
    if (!empty($range) && preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
        $start = intval($matches[1]);
        $end = !empty($matches[2]) ? intval($matches[2]) : $filesize - 1;
        
        // Validate range
        if ($start >= $filesize || $end >= $filesize || $start > $end) {
            header('HTTP/1.1 416 Range Not Satisfiable');
            header("Content-Range: bytes */$filesize");
            die();
        }
        
        $length = $end - $start + 1;
        
        // Send 206 Partial Content headers
        header('HTTP/1.1 206 Partial Content');
        header("Content-Range: bytes $start-$end/$filesize");
        header('Accept-Ranges: bytes');
        header("Content-Length: $length");
        header("Content-Type: $mimetype");
        header('Content-Disposition: inline; filename="' . $filename . '"');
        
        // cURL request with Range header
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $external_url);
        curl_setopt($ch, CURLOPT_USERPWD, "$webdav_username:$webdav_password");
        curl_setopt($ch, CURLOPT_HTTPHEADER, array("Range: bytes=$start-$end"));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // Output directly
        curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300); // 5 minutes for video streaming
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) {
            echo $data;
            return strlen($data);
        });
        
        curl_exec($ch);
        curl_close($ch);
        exit;
        
    } else {
        // No range request - stream entire file
        header('HTTP/1.1 200 OK');
        header('Accept-Ranges: bytes');
        header("Content-Length: $filesize");
        header("Content-Type: $mimetype");
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Cache-Control: public, max-age=3600');
        
        // cURL request for full file
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $external_url);
        curl_setopt($ch, CURLOPT_USERPWD, "$webdav_username:$webdav_password");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // Output directly
        curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300); // 5 minutes for video streaming
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) {
            echo $data;
            return strlen($data);
        });
        
        curl_exec($ch);
        curl_close($ch);
        exit;
    }
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
                $chunk_size = min(8192, $remaining);
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
        $data = fread($handle, 8192);
        if ($data === false) {
            break;
        }
        echo $data;
        flush();
    }
    
    fclose($handle);
}

fclose($handle);
exit;
