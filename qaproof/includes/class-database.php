<?php
/**
 * Database management for QAProof monitors and results.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Database {

    /**
     * Create or update plugin database tables.
     * Called on plugin activation.
     */
    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();

        $monitors_table     = $wpdb->prefix . 'qaproof_monitors';
        $results_table      = $wpdb->prefix . 'qaproof_results';
        $test_history_table = $wpdb->prefix . 'qaproof_test_history';

        $sql = "CREATE TABLE {$monitors_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            page_url varchar(2048) NOT NULL,
            baseline_key varchar(16) DEFAULT '' NOT NULL,
            schedule varchar(20) DEFAULT 'daily' NOT NULL,
            is_enabled tinyint(1) DEFAULT 1 NOT NULL,
            notify_email tinyint(1) DEFAULT 1 NOT NULL,
            notify_admin tinyint(1) DEFAULT 1 NOT NULL,
            threshold_score int(3) DEFAULT 90 NOT NULL,
            scheduled_at datetime DEFAULT NULL,
            last_run_at datetime DEFAULT NULL,
            last_score int(3) DEFAULT NULL,
            has_baseline tinyint(1) DEFAULT 0 NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            KEY baseline_key (baseline_key),
            KEY is_enabled (is_enabled)
        ) {$charset_collate};

        CREATE TABLE {$results_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            monitor_id bigint(20) unsigned NOT NULL,
            run_date datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            score int(3) DEFAULT NULL,
            has_changes tinyint(1) DEFAULT 0 NOT NULL,
            summary text DEFAULT NULL,
            categories_json longtext DEFAULT NULL,
            differences_json longtext DEFAULT NULL,
            recommendations_json longtext DEFAULT NULL,
            screenshots_json longtext DEFAULT NULL,
            status varchar(20) DEFAULT 'completed' NOT NULL,
            error_message text DEFAULT NULL,
            PRIMARY KEY  (id),
            KEY monitor_id (monitor_id),
            KEY run_date (run_date),
            KEY status (status)
        ) {$charset_collate};

        CREATE TABLE {$test_history_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            test_type varchar(20) NOT NULL,
            page_url varchar(2048) NOT NULL,
            score int(3) DEFAULT NULL,
            summary text DEFAULT NULL,
            categories_json longtext DEFAULT NULL,
            differences_json longtext DEFAULT NULL,
            recommendations_json longtext DEFAULT NULL,
            screenshots_json longtext DEFAULT NULL,
            extracted_data_json longtext DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            KEY test_type (test_type),
            KEY created_at (created_at)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );

        update_option( 'qaproof_db_version', '1.3.0' );
    }

    /**
     * Drop plugin tables.
     * Called on plugin uninstall.
     */
    public static function drop_tables() {
        global $wpdb;
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_test_history" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_results" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_monitors" );
        delete_option( 'qaproof_db_version' );
    }
}
