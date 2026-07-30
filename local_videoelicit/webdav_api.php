<?php
/**
 * WebDAV/OwnCloud API — removed
 *
 * The OwnCloud integration has been removed. Videos are now stored and served
 * directly from the local server. This endpoint returns 410 Gone for all requests.
 *
 * @package    local_videoelicit
 */

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
require_login();

header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
    'error' => 'OwnCloud integration has been removed. Videos are now stored and served locally.',
]);
exit;
