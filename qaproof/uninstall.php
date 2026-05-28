<?php
/**
 * Plugin uninstall. Honors the per-site Data Cleanup preferences from
 * Settings → Data Cleanup; transients and cron hooks are always cleared.
 * Multisite: iterates every blog so no per-site state is left behind.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

function qaproof_uninstall_blog_cleanup() {
	global $wpdb;

	if ( get_option( 'qaproof_uninstall_delete_api_key', false ) ) {
		delete_option( 'qaproof_api_key' );
	}

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
			'qaproof_figma_api_usage',
			'qaproof_figma_rate_limit',
			// Cron-disabled notice dismissal — site-wide flag set when any
			// admin closes the "DISABLE_WP_CRON is on" warning on the
			// Monitors / Dashboard screen.
			'qaproof_dismiss_cron_notice',
			// Migration progress flag — without this entry it survives
			// uninstall and a future reinstall would skip the migration.
			'qaproof_monitors_api_migrated',
			// One-time flag guarding the orphaned-cron sweep in
			// class-database.php::maybe_upgrade(). Removing it lets a future
			// reinstall re-run the (idempotent) sweep.
			'qaproof_legacy_cron_cleared',
		];
		foreach ( $settings_options as $opt ) {
			delete_option( $opt );
		}
	}

	if ( get_option( 'qaproof_uninstall_delete_saved_designs', false ) ) {
		delete_option( 'qaproof_saved_designs' );
	}

	if ( get_option( 'qaproof_uninstall_delete_test_history', false ) ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- uninstall, plugin-controlled table.
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_test_history`" );
	}

	if ( get_option( 'qaproof_uninstall_delete_monitors', false ) ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- uninstall, plugin-controlled table.
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_results`" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- uninstall, plugin-controlled table.
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_monitor_results`" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- uninstall, plugin-controlled table.
		$wpdb->query( "DROP TABLE IF EXISTS `{$wpdb->prefix}qaproof_monitors`" );
	}

	delete_transient( 'qaproof_alert_count' );

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- transient sweep on uninstall.
	$wpdb->query( $wpdb->prepare(
		"DELETE FROM `{$wpdb->options}` WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( '_transient_qaproof_' ) . '%',
		$wpdb->esc_like( '_transient_timeout_qaproof_' ) . '%'
	) );

	$cron_hooks = [
		'qaproof_cron_daily',
		'qaproof_cron_weekly',
		'qaproof_cron_monthly',
		'qaproof_run_monitor',
	];
	foreach ( $cron_hooks as $hook ) {
		// wp_unschedule_hook drops ALL events for the hook regardless of args
		// (qaproof_run_monitor carried a monitor-id), unlike
		// wp_clear_scheduled_hook which only matches the empty-args set.
		wp_unschedule_hook( $hook );
	}

	delete_option( 'qaproof_uninstall_delete_api_key' );
	delete_option( 'qaproof_uninstall_delete_settings' );
	delete_option( 'qaproof_uninstall_delete_saved_designs' );
	delete_option( 'qaproof_uninstall_delete_test_history' );
	delete_option( 'qaproof_uninstall_delete_monitors' );
}

if ( is_multisite() ) {
	$qaproof_blog_ids = get_sites( [ 'fields' => 'ids', 'number' => 0 ] );
	foreach ( $qaproof_blog_ids as $qaproof_blog_id ) {
		switch_to_blog( $qaproof_blog_id );
		qaproof_uninstall_blog_cleanup();
		restore_current_blog();
	}
	delete_site_option( 'qaproof_db_version' );
} else {
	qaproof_uninstall_blog_cleanup();
}
