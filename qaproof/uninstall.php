<?php
/**
 * Fired when the plugin is uninstalled (deleted via WP admin).
 * Respects the admin's Data Cleanup preferences from Settings → Data Cleanup.
 * Each data category is only deleted if the corresponding toggle is enabled.
 */

// Abort if not called by WordPress.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// ============================
// 1. API Key
// ============================
if ( get_option( 'qaproof_uninstall_delete_api_key', true ) ) {
	delete_option( 'qaproof_api_key' );
}

// ============================
// 2. Plugin Settings (notifications, thresholds, viewports, test config)
// ============================
if ( get_option( 'qaproof_uninstall_delete_settings', true ) ) {
	delete_option( 'qaproof_notify_email' );
	delete_option( 'qaproof_notify_email_enabled' );
	delete_option( 'qaproof_notify_admin_enabled' );
	delete_option( 'qaproof_default_threshold' );
	delete_option( 'qaproof_default_test_type' );
	delete_option( 'qaproof_auto_save_history' );
	delete_option( 'qaproof_max_history' );
	delete_option( 'qaproof_viewport_desktop' );
	delete_option( 'qaproof_viewport_tablet' );
	delete_option( 'qaproof_viewport_mobile' );
	delete_option( 'qaproof_wcag_level' );
	delete_option( 'qaproof_fidelity_ignore_text' );
	delete_option( 'qaproof_db_version' );
}

// ============================
// 3. Saved Designs (including cached images and element data)
// ============================
if ( get_option( 'qaproof_uninstall_delete_saved_designs', true ) ) {
	delete_option( 'qaproof_saved_designs' );
}

// ============================
// 4. Test History (database table)
// ============================
if ( get_option( 'qaproof_uninstall_delete_test_history', true ) ) {
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_test_history" );
}

// ============================
// 5. Monitors & Results (database tables)
// ============================
if ( get_option( 'qaproof_uninstall_delete_monitors', true ) ) {
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_results" );
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_monitors" );
}

// ============================
// Always clean up: transients and uninstall preferences themselves
// ============================
delete_transient( 'qaproof_alert_count' );

// Remove the uninstall preference options (they have no use after uninstall)
delete_option( 'qaproof_uninstall_delete_api_key' );
delete_option( 'qaproof_uninstall_delete_settings' );
delete_option( 'qaproof_uninstall_delete_saved_designs' );
delete_option( 'qaproof_uninstall_delete_test_history' );
delete_option( 'qaproof_uninstall_delete_monitors' );
