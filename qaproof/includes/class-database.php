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
            notify_on varchar(10) DEFAULT 'failures' NOT NULL,
            threshold_score int(3) DEFAULT 90 NOT NULL,
            scheduled_at datetime DEFAULT NULL,
            last_run_at datetime DEFAULT NULL,
            last_score int(3) DEFAULT NULL,
            has_baseline tinyint(1) DEFAULT 0 NOT NULL,
            api_key_hash varchar(16) DEFAULT '' NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            KEY baseline_key (baseline_key),
            KEY is_enabled (is_enabled),
            KEY api_key_hash (api_key_hash)
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
            job_id varchar(64) DEFAULT NULL,
            test_type varchar(20) NOT NULL,
            page_url varchar(2048) NOT NULL,
            score int(3) DEFAULT NULL,
            summary text DEFAULT NULL,
            categories_json longtext DEFAULT NULL,
            differences_json longtext DEFAULT NULL,
            recommendations_json longtext DEFAULT NULL,
            screenshots_json longtext DEFAULT NULL,
            extracted_data_json longtext DEFAULT NULL,
            api_key_hash varchar(16) DEFAULT '' NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY job_id (job_id),
            KEY test_type (test_type),
            KEY created_at (created_at),
            KEY api_key_hash (api_key_hash)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );

        update_option( 'qaproof_db_version', '1.7.0' );
    }

    /**
     * Run incremental DB migrations.
     * Safe to call on every plugin load — checks version before acting.
     */
    public static function maybe_upgrade() {
        $current = get_option( 'qaproof_db_version', '0' );
        if ( version_compare( $current, '1.7.0', '>=' ) ) {
            return;
        }
        // Re-run create_tables() — dbDelta() handles ADD COLUMN / ADD KEY safely.
        self::create_tables();

        // v1.7.0: One-time migration — copy monitors from WP MySQL → SaaS API.
        // Monitors moved to PostgreSQL; any monitors created before this version
        // are still in the local MySQL table and need to be pushed to the API.
        self::migrate_monitors_to_api();
    }

    /**
     * Copy monitors from the legacy WP MySQL table to the SaaS API (one-time).
     * Guarded by a WP option so it never runs more than once.
     */
    private static function migrate_monitors_to_api() {
        global $wpdb;

        if ( get_option( 'qaproof_monitors_api_migrated' ) ) {
            return;
        }

        // Mark as done immediately — prevents re-runs even if individual creates fail.
        update_option( 'qaproof_monitors_api_migrated', 1 );

        $table = $wpdb->prefix . 'qaproof_monitors';

        // Table may not exist on fresh installs — skip silently.
        if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
            return;
        }

        $monitors = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY id ASC", ARRAY_A );
        if ( empty( $monitors ) ) {
            return;
        }

        $migrated = 0;
        $failed   = 0;

        foreach ( $monitors as $m ) {
            $create_data = array(
                'page_url'        => $m['page_url'],
                'schedule'        => ! empty( $m['schedule'] ) ? $m['schedule'] : 'daily',
                'is_enabled'      => (int) $m['is_enabled'],
                'notify_email'    => (int) $m['notify_email'],
                'notify_admin'    => (int) $m['notify_admin'],
                'notify_on'       => ! empty( $m['notify_on'] ) ? $m['notify_on'] : 'failures',
                'threshold_score' => (int) $m['threshold_score'],
            );

            $result = QAProof_API_Client::monitors_create( $create_data );

            if ( is_wp_error( $result ) ) {
                $failed++;
                error_log( '[QAProof] migrate_monitors_to_api: failed to create monitor for ' . $m['page_url'] . ' — ' . $result->get_error_message() );
                continue;
            }

            $migrated++;

            // Restore baseline_key + has_baseline if the monitor had a baseline.
            if ( ! empty( $m['baseline_key'] ) && ! empty( $m['has_baseline'] ) ) {
                QAProof_API_Client::monitors_update( $result['id'], array(
                    'baseline_key' => $m['baseline_key'],
                    'has_baseline' => 1,
                ) );
            }
        }

        error_log( sprintf(
            '[QAProof] migrate_monitors_to_api: migrated %d/%d monitors to SaaS API (%d failed)',
            $migrated, count( $monitors ), $failed
        ) );
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
