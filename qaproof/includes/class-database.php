<?php
/**
 * Database management for QAProof.
 *
 * The plugin used to create three custom tables (monitors, results,
 * test_history) and store everything locally. Since the migration to the
 * QAProof SaaS API (v0.9 onward) all of that data lives on the server,
 * scoped to the workspace. Fresh installs no longer create any custom
 * tables; this class exists to:
 *
 *   1. Run one-time legacy data migrations for users upgrading from a
 *      pre-SaaS version (monitor rows → API, legacy figma tokens stripped).
 *   2. Drop any leftover legacy tables on uninstall so we leave no orphans.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Database {

    /**
     * Run any one-time legacy migrations needed on upgrade.
     *
     * For brand-new installs this is a no-op (no `qaproof_db_version` option,
     * no local tables). For users upgrading from a pre-SaaS version it
     * pushes their local monitor rows up to the SaaS API exactly once.
     */
    public static function maybe_upgrade() {
        $current = get_option( 'qaproof_db_version', '0' );
        if ( version_compare( $current, '1.8.0', '>=' ) ) {
            return;
        }

        if ( version_compare( $current, '1.7.0', '<' ) ) {
            self::migrate_monitors_to_api();
            // If the monitor migration didn't complete (API outage, etc.)
            // we keep db_version where it is so the next request retries.
            // Without this gate a partial migration would mark db_version
            // 1.8.0 and never re-run.
            if ( ! get_option( 'qaproof_monitors_api_migrated' ) ) {
                return;
            }
        }
        if ( version_compare( $current, '1.8.0', '<' ) ) {
            self::strip_legacy_figma_tokens();
        }

        update_option( 'qaproof_db_version', '1.8.0' );
    }

    /**
     * Remove the legacy `figmaToken` field from saved-design entries.
     * Pre-1.8.0 stored per-design Figma PATs alongside the URL; OAuth /
     * the service account replaced that flow. Safe-fails on empty input.
     */
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

    /**
     * One-time copy of monitors from the legacy MySQL `{prefix}qaproof_monitors`
     * table to the SaaS API. Runs once on upgrade for users coming from a
     * pre-1.7.0 install; brand-new installs skip this entirely because the
     * table never existed.
     */
    private static function migrate_monitors_to_api() {
        global $wpdb;

        if ( get_option( 'qaproof_monitors_api_migrated' ) ) {
            return;
        }

        // We do NOT pre-stamp the migrated flag — the original implementation
        // did, and one partial-success run silently flagged "done" while
        // leaving 15 of 20 monitors un-migrated. Set the flag ONLY when the
        // run completes without ANY failures (see post-loop check below).

        $table = $wpdb->prefix . 'qaproof_monitors';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter -- existence probe for a legacy table; SHOW TABLES is a schema query, not a data read.
        if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
            return;
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- one-time legacy-data migration; table name is plugin-controlled, runs at most once per install.
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

        // Only mark migrated if every row landed. A retry on the next page
        // load will pick up the rows that failed (e.g. API blip). Without
        // this gate, one partial-success run permanently strands data.
        if ( $failed === 0 && $migrated === count( $monitors ) ) {
            update_option( 'qaproof_monitors_api_migrated', 1 );
            // Drop the now-empty legacy table so we don't leave ghost rows
            // sitting in MySQL forever after a successful migration. Table
            // name is constructed from `$wpdb->prefix` + a plugin-controlled
            // literal ('qaproof_monitors') — no user input — so the
            // interpolation is safe. Plugin Check still flags it; we add the
            // PluginCheck rule to the ignore list alongside the WPCS rules.
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- safe: $table is plugin-controlled literal.
            $wpdb->query( "DROP TABLE IF EXISTS {$table}" );
            qaproof_debug_log( '[QAProof] migrate_monitors_to_api: marked done + dropped legacy table.' );
        }
    }

    /**
     * Drop any leftover legacy tables (test_history, results, monitors) on
     * uninstall. New installs never have them; old installs need the sweep
     * to avoid leaving orphan tables in the WP DB after the plugin is
     * removed.
     */
    public static function drop_tables() {
        global $wpdb;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- legacy uninstall sweep; table names are plugin-controlled literals.
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_test_history" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_results" );
        $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}qaproof_monitors" );
        // phpcs:enable
        delete_option( 'qaproof_db_version' );
    }
}
