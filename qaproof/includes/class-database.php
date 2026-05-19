<?php
/**
 * Database management for QAProof monitors and results.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Database {

    /**
     * Check whether a column exists in a table. Request-scoped cache.
     *
     * @param  string $table  Full table name (already $wpdb->prefix-qualified).
     * @param  string $column Column to probe.
     * @return bool
     */
    public static function column_exists( $table, $column ) {
        static $cache = [];
        $key = $table . '.' . $column;
        if ( isset( $cache[ $key ] ) ) {
            return $cache[ $key ];
        }
        global $wpdb;
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $result = $wpdb->get_var( $wpdb->prepare( "SHOW COLUMNS FROM {$table} LIKE %s", $column ) );
        return $cache[ $key ] = ! empty( $result );
    }

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

        update_option( 'qaproof_db_version', '1.8.0' );
    }

    public static function maybe_upgrade() {
        $current = get_option( 'qaproof_db_version', '0' );
        if ( version_compare( $current, '1.8.0', '>=' ) ) {
            return;
        }
        self::create_tables();

        if ( version_compare( $current, '1.7.0', '<' ) ) {
            self::migrate_monitors_to_api();
        }
        if ( version_compare( $current, '1.8.0', '<' ) ) {
            self::strip_legacy_figma_tokens();
        }

        update_option( 'qaproof_db_version', '1.8.0' );
    }

    private static function strip_legacy_figma_tokens() {
        $designs = get_option( 'qaproof_saved_designs', array() );
        if ( ! is_array( $designs ) || empty( $designs ) ) {
            return;
        }
        $changed = false;
        foreach ( $designs as &$d ) {
            if ( isset( $d['figmaToken'] ) ) {
                unset( $d['figmaToken'] );
                $changed = true;
            }
        }
        unset( $d );
        if ( $changed ) {
            update_option( 'qaproof_saved_designs', $designs );
            qaproof_debug_log( '[QAProof] strip_legacy_figma_tokens: removed legacy figmaToken from ' . count( $designs ) . ' saved designs' );
        }
    }

    /** One-time copy of monitors from the legacy MySQL table to the SaaS API. */
    private static function migrate_monitors_to_api() {
        global $wpdb;

        if ( get_option( 'qaproof_monitors_api_migrated' ) ) {
            return;
        }

        // Mark done up-front so a partial failure doesn't trigger a re-migration.
        update_option( 'qaproof_monitors_api_migrated', 1 );

        $table = $wpdb->prefix . 'qaproof_monitors';

        if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
            return;
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- one-time migration, table name is plugin-controlled.
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
                qaproof_debug_log( '[QAProof] migrate_monitors_to_api: failed to create monitor for ' . $m['page_url'] . ' — ' . $result->get_error_message() );
                continue;
            }

            $migrated++;

            if ( ! empty( $m['baseline_key'] ) && ! empty( $m['has_baseline'] ) ) {
                QAProof_API_Client::monitors_update( $result['id'], array(
                    'baseline_key' => $m['baseline_key'],
                    'has_baseline' => 1,
                ) );
            }
        }

        qaproof_debug_log( sprintf(
            '[QAProof] migrate_monitors_to_api: migrated %d/%d monitors to SaaS API (%d failed)',
            $migrated, count( $monitors ), $failed
        ) );
    }

    public static function drop_tables() {
        global $wpdb;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_test_history" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_results" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_monitors" );
        // phpcs:enable
        delete_option( 'qaproof_db_version' );
    }
}
