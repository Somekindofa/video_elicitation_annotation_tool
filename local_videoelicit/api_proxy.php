<?php
// This file is part of Moodle - http://moodle.org/

/**
 * API proxy to FastAPI backend
 * 
 * Routes authenticated requests from Moodle frontend to FastAPI backend,
 * injecting user context and handling responses.
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/classes/jwt_helper.php');

use local_videoelicit\jwt_helper;

// Require login
require_login();

global $USER, $DB;

// Get request parameters
$endpoint = required_param('endpoint', PARAM_PATH);
$contextid = required_param('contextid', PARAM_INT);

// Verify context exists and user has access
$context = context::instance_by_id($contextid);
require_capability('local/videoelicit:view', $context);

// Get backend URL from config
$config = get_config('local_videoelicit');
$backend_url = $config->backend_url ?? 'http://localhost:8006';

// Get user roles in context
$roles = jwt_helper::get_user_roles($USER->id, $context);

// Generate JWT token
$token = jwt_helper::create_token($USER->id, $USER->username, $contextid, $roles);

// Build full API URL
$api_url = rtrim($backend_url, '/') . '/api/' . ltrim($endpoint, '/');

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Initialize cURL
$ch = curl_init();

// Set URL
curl_setopt($ch, CURLOPT_URL, $api_url);

// Set method-specific options
switch ($method) {
    case 'GET':
        // Add query parameters if any
        if (!empty($_GET)) {
            $query_params = $_GET;
            unset($query_params['endpoint']);
            unset($query_params['contextid']);
            if (!empty($query_params)) {
                $api_url .= '?' . http_build_query($query_params);
                curl_setopt($ch, CURLOPT_URL, $api_url);
            }
        }
        break;
        
    case 'POST':
    case 'PUT':
    case 'DELETE':
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        
        // Handle JSON or multipart data
        $content_type = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (strpos($content_type, 'multipart/form-data') !== false) {
            // Handle file uploads
            $post_data = array();
            foreach ($_POST as $key => $value) {
                if ($key !== 'endpoint' && $key !== 'contextid') {
                    $post_data[$key] = $value;
                }
            }
            
            // Add files
            foreach ($_FILES as $key => $file) {
                if ($file['error'] === UPLOAD_ERR_OK) {
                    $post_data[$key] = new \CURLFile($file['tmp_name'], $file['type'], $file['name']);
                }
            }
            
            curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
        } else {
            // Handle JSON data
            $json_data = file_get_contents('php://input');
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json_data);
            curl_setopt($ch, CURLOPT_HTTPHEADER, array(
                'Content-Type: application/json',
                'Content-Length: ' . strlen($json_data)
            ));
        }
        break;
}

// Set common options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 300); // 5 minutes for transcription tasks
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'Authorization: Bearer ' . $token,
    'X-Moodle-User: ' . $USER->id,
    'X-Moodle-Context: ' . $contextid,
));

// Execute request
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

// Check for errors
if (curl_errno($ch)) {
    $error = curl_error($ch);
    curl_close($ch);
    header('HTTP/1.1 502 Bad Gateway');
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Backend communication error',
        'detail' => $error
    ]);
    exit;
}

curl_close($ch);

// Forward response
header('HTTP/1.1 ' . $http_code);
header('Content-Type: ' . $content_type);
echo $response;
exit;
