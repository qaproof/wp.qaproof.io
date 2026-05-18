<?php
/**
 * Fired when the plugin is uninstalled (deleted via WP admin).
 *
 * Cleanup respects the admin's Data Cleanup preferences from
 * Settings → Data Cleanup. Each category is only deleted if the toggle
 * is enabled. Cron events and transients are always cleared (defensive —
 * leaving them behind would create stale work for cron after the plugin
 * is gone).
 *
 * Multisite: when uninstalled network-wide, iterate over every site so we
 * don't leak per-site options/tables on the other blogs.
 */

// Abort if not called by WordPress.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Clean up everything the plugin stored on a single blog.
 * Reads the per-blog cleanup-preference options before deciding what to drop.
 */
function qaproof_uninstall_blog_cleanup() {
	global $wpdb;

	// 1. API Key
	if ( get_option( 'qaproof_uninstall_delete_api_key', false ) ) {
		delete_option( 'qaproof_api_key' );
	}

	// 2. Plugin Settings (notifications, thresholds, viewports, test config)
	if ( get_option( 'qaproof_uninstall_delete_settings', false ) ) {
		$settings_options = [
			'qaproof_notify_email',
			'qaproof_notify_email_enabled',
			'qaproof_notify_admin_enabled',
			'qaproof_default_threshold',
			'qaproof_default_test_type',
			'qaproof_auto_save_history',
			'qaproof_max_history',
			'qaproof_viewport_desktop',
			'qaproof_viewport_tablet',
			'qaproof_viewport_mobile',
			'qaproof_wcag_level',
			'qaproof_fidelity_ignore_text',
			'qaproof_db_version',
			'qaproof_api_endpoint',
			'qaproof_cron_hour',
			'qaproof_feedback_log',
			'qaproof_figma_api_usage',
			'qaproof_figma_rate_limit',  // legacy, cleaned for older installs
		];
		foreach ( $settings_options as $opt ) {
			delete_option( $opt );
		}
	}

	// 3. Saved Designs (including cached images and element data)
	if ( get_option( 'qaproof_uninstall_delete_saved_designs', false ) ) {
		delete_option( 'qaproof_saved_designs' );
	}

	// 4. Test History (database table)
	if ( get_option( 'qaproof_uninstall_delete_test_history', false ) ) {
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_test_history`" );
	}

	// 5. Monitors & Results (database tables, both schema versions)
	if ( get_option( 'qaproof_uninstall_delete_monitors', false ) ) {
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_results`" );
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_monitor_results`" );
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_monitors`" );
	}

	// Always-cleared: transients (badge counter, dedup keys), cron hooks,
	// per-fileKey rate-limit caches. Leaving cron events scheduled after
	// uninstall would cause WP to fire qaproof_run_monitor hooks that no
	// longer have a listener — harmless but spammy in cron-debug tools.
	delete_transient( 'qaproof_alert_count' );

	// Sweep any qaproof_saved_job_* transients (jobId dedup keys).
	$transient_prefix      = '_transient_qaproof_';
	$transient_timeout_prefix = '_transient_timeout_qaproof_';
	$wpdb->query( $wpdb->prepare(
		"DELETE FROM `{$wpdb->options}` WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( $transient_prefix ) . '%',
		$wpdb->esc_like( $transient_timeout_prefix ) . '%'
	) );

	// Unschedule all cron events the plugin owns.
	$cron_hooks = [
		'qaproof_cron_daily',
		'qaproof_cron_weekly',
		'qaproof_cron_monthly',
		'qaproof_run_monitor',
	];
	foreach ( $cron_hooks as $hook ) {
		wp_clear_scheduled_hook( $hook );
	}

	// The uninstall preference options themselves — drop unconditionally,
	// they have no purpose after the plugin is gone.
	delete_option( 'qaproof_uninstall_delete_api_key' );
	delete_option( 'qaproof_uninstall_delete_settings' );
	delete_option( 'qaproof_uninstall_delete_saved_designs' );
	delete_option( 'qaproof_uninstall_delete_test_history' );
	delete_option( 'qaproof_uninstall_delete_monitors' );
}

// On multisite, iterate every blog so we don't leak per-site state.
// On a single-site WordPress, just run the cleanup once.
if ( is_multisite() ) {
	$blog_ids = get_sites( [ 'fields' => 'ids', 'number' => 0 ] );
	foreach ( $blog_ids as $blog_id ) {
		switch_to_blog( $blog_id );
		qaproof_uninstall_blog_cleanup();
		restore_current_blog();
	}
	// Network-level options (none currently, but defensive sweep).
	delete_site_option( 'qaproof_db_version' );
} else {
	qaproof_uninstall_blog_cleanup();
}
