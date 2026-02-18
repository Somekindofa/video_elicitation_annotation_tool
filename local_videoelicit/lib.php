<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Library functions for local_videoelicit plugin
 *
 * @package    local_videoelicit
 * @copyright  2026 Video Elicitation Tool
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Extends the global navigation tree by adding Video Elicitation Tool link
 *
 * @param global_navigation $navigation An object representing the navigation tree
 */
function local_videoelicit_extend_navigation(global_navigation $navigation) {
    global $PAGE, $USER;
    
    // Only add navigation item for logged-in users
    if (!isloggedin() || isguestuser()) {
        return;
    }
    
    // Create the navigation node
    $node = $navigation->add(
        get_string('pluginname', 'local_videoelicit'),
        new moodle_url('/local/videoelicit/index.php'),
        navigation_node::TYPE_CUSTOM,
        null,
        'videoelicit',
        new pix_icon('i/video', get_string('pluginname', 'local_videoelicit'))
    );
    
    // Make it visible in the primary navigation bar
    $node->showinflatnavigation = true;
    $node->showinprimarynavigation = true;

    // Ensure the primary navigation includes the link in Boost
    if (isset($PAGE) && !empty($PAGE->primarynav)) {
        $primarynode = $PAGE->primarynav->find('videoelicit', navigation_node::TYPE_CUSTOM);
        if (!$primarynode) {
            $primarynode = $PAGE->primarynav->add(
                get_string('pluginname', 'local_videoelicit'),
                new moodle_url('/local/videoelicit/index.php'),
                navigation_node::TYPE_CUSTOM,
                null,
                'videoelicit',
                new pix_icon('i/video', get_string('pluginname', 'local_videoelicit'))
            );
        }
        $primarynode->showinprimarynavigation = true;
    }
}

/**
 * Extends the settings navigation with the Video Elicitation Tool settings
 *
 * @param settings_navigation $settingsnav The settings navigation object
 * @param context $context The context of the page
 */
function local_videoelicit_extend_settings_navigation(settings_navigation $settingsnav, context $context) {
    global $PAGE;
    
    // Only add to course contexts
    if ($context->contextlevel != CONTEXT_COURSE) {
        return;
    }
    
    // Check if user has capability to view
    if (has_capability('local/videoelicit:view', $context)) {
        $node = navigation_node::create(
            get_string('pluginname', 'local_videoelicit'),
            new moodle_url('/local/videoelicit/index.php', array('contextid' => $context->id)),
            navigation_node::TYPE_SETTING,
            null,
            'videoelicit',
            new pix_icon('i/video', get_string('pluginname', 'local_videoelicit'))
        );
        
        if ($PAGE->url->compare(new moodle_url('/local/videoelicit/index.php'), URL_MATCH_BASE)) {
            $node->make_active();
        }
        
        $settingsnav->add_node($node);
    }
}
