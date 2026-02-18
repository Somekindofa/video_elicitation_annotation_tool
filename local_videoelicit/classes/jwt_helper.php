<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Helper class for JWT token generation and management
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_videoelicit;

defined('MOODLE_INTERNAL') || die();

class jwt_helper {
    
    /**
     * Generate JWT token for FastAPI authentication
     *
     * @param int $userid Moodle user ID
     * @param string $username Moodle username
     * @param int $contextid Moodle context ID
     * @param array $roles Array of role shortnames
     * @param int $expires_minutes Token expiration in minutes (default: 60)
     * @return string JWT token
     */
    public static function create_token($userid, $username, $contextid, $roles, $expires_minutes = 60) {
        $config = get_config('local_videoelicit');
        $secret = $config->jwt_secret ?? 'change-this-secret-key';
        
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $header = self::base64url_encode($header);
        
        $payload = json_encode([
            'userid' => $userid,
            'username' => $username,
            'contextid' => $contextid,
            'roles' => $roles,
            'exp' => time() + ($expires_minutes * 60),
            'iat' => time(),
        ]);
        $payload = self::base64url_encode($payload);
        
        $signature = hash_hmac('sha256', "$header.$payload", $secret, true);
        $signature = self::base64url_encode($signature);
        
        return "$header.$payload.$signature";
    }
    
    /**
     * Get user's role shortnames in a context
     *
     * @param int $userid User ID
     * @param \context $context Context
     * @return array Array of role shortnames
     */
    public static function get_user_roles($userid, $context) {
        $roles = get_user_roles($context, $userid, false);
        $roleshortnames = array();
        
        foreach ($roles as $role) {
            $roleshortnames[] = $role->shortname;
        }
        
        // Add special roles
        if (is_siteadmin($userid)) {
            $roleshortnames[] = 'admin';
        }
        
        return array_unique($roleshortnames);
    }
    
    /**
     * Base64url encode
     */
    private static function base64url_encode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    /**
     * Base64url decode
     */
    private static function base64url_decode($data) {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
