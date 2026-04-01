<?php
/**
 * Fired when the plugin is uninstalled (deleted via WP admin).
 * Cleans up all plugin options from the database.
 */

// Abort if not called by WordPress.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove options
delete_option( 'qaproof_api_key' );
delete_option( 'qaproof_notify_email' );
delete_option( 'qaproof_notify_email_enabled' );
delete_option( 'qaproof_notify_admin_enabled' );
delete_option( 'qaproof_default_threshold' );
delete_option( 'qaproof_db_version' );

// Remove transients
delete_transient( 'qaproof_alert_count' );

// Drop database tables
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_test_history" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_results" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_monitors" );
