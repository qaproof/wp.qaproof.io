<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Test_History {

    public static function table_name() {
        global $wpdb;
        return $wpdb->prefix . 'qaproof_test_history';
    }

    public static function save( $data ) {
        global $wpdb;

        $job_id         = ! empty( $data['job_id'] ) ? sanitize_text_field( $data['job_id'] ) : null;
        $has_job_id_col = self::column_exists( 'job_id' );

        $row = [
            'test_type'            => sanitize_text_field( $data['test_type'] ?? '' ),
            'page_url'             => sanitize_url( $data['page_url'] ?? '' ),
            'score'                => isset( $data['score'] ) ? (int) $data['score'] : null,
            'summary'              => isset( $data['summary'] ) ? sanitize_text_field( $data['summary'] ) : null,
            'categories_json'      => isset( $data['categories'] ) ? wp_json_encode( $data['categories'] ) : null,
            'differences_json'     => isset( $data['differences'] ) ? wp_json_encode( $data['differences'] ) : null,
            'recommendations_json' => isset( $data['recommendations'] ) ? wp_json_encode( $data['recommendations'] ) : null,
            'screenshots_json'     => isset( $data['screenshots'] ) ? wp_json_encode( $data['screenshots'] ) : null,
            'extracted_data_json'  => self::build_extracted_data( $data ),
        ];

        // Only include job_id if the column exists (safe during DB migration).
        if ( $has_job_id_col && $job_id ) {
            $row = array_merge( [ 'job_id' => $job_id ], $row );
        }

        $formats = $has_job_id_col && $job_id ? [ '%s', '%s', '%s' ] : [ '%s', '%s' ];
        $formats[] = $row['score'] !== null ? '%d' : '%s';
        $formats = array_merge( $formats, [ '%s', '%s', '%s', '%s', '%s', '%s' ] );

        $result = $wpdb->insert( self::table_name(), $row, $formats );

        if ( $result === false ) {
            // Error code 1062 = duplicate key — expected when same job_id is saved twice.
            if ( ! empty( $job_id ) && strpos( $wpdb->last_error, '1062' ) !== false ) {
                error_log( '[QAProof] test_history: duplicate job_id blocked by DB constraint — jobId=' . $job_id );
                return 0;
            }
            error_log( '[QAProof] test_history insert failed: ' . $wpdb->last_error );
            return 0;
        }

        return $wpdb->insert_id;
    }

    /**
     * Check if a column exists in the test_history table.
     * Result is cached in a static variable to avoid repeated SHOW COLUMNS queries.
     */
    private static function column_exists( $column ) {
        static $cache = [];
        if ( isset( $cache[ $column ] ) ) {
            return $cache[ $column ];
        }
        global $wpdb;
        $table  = self::table_name();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $result = $wpdb->get_var( $wpdb->prepare( "SHOW COLUMNS FROM {$table} LIKE %s", $column ) );
        $cache[ $column ] = ! empty( $result );
        return $cache[ $column ];
    }

    public static function get_all( $args = [] ) {
        global $wpdb;
        $table    = self::table_name();
        $defaults = [ 'limit' => 50, 'offset' => 0, 'test_type' => '', 'exclude_type' => '' ];
        $args     = wp_parse_args( $args, $defaults );

        if ( ! empty( $args['test_type'] ) ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            return $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE test_type = %s ORDER BY created_at DESC LIMIT %d OFFSET %d",
                    sanitize_text_field( $args['test_type'] ),
                    $args['limit'],
                    $args['offset']
                ),
                ARRAY_A
            );
        }

        if ( ! empty( $args['exclude_type'] ) ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            return $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE test_type != %s ORDER BY created_at DESC LIMIT %d OFFSET %d",
                    sanitize_text_field( $args['exclude_type'] ),
                    $args['limit'],
                    $args['offset']
                ),
                ARRAY_A
            );
        }

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $args['limit'],
                $args['offset']
            ),
            ARRAY_A
        );
    }

    public static function get( $id ) {
        global $wpdb;
        $table = self::table_name();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return $wpdb->get_row(
            $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ),
            ARRAY_A
        );
    }

    public static function delete( $id ) {
        global $wpdb;
        return $wpdb->delete( self::table_name(), [ 'id' => $id ], [ '%d' ] );
    }

    public static function count( $test_type = '', $exclude_type = '' ) {
        global $wpdb;
        $table = self::table_name();

        if ( ! empty( $test_type ) ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            return (int) $wpdb->get_var(
                $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE test_type = %s", sanitize_text_field( $test_type ) )
            );
        }

        if ( ! empty( $exclude_type ) ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            return (int) $wpdb->get_var(
                $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE test_type != %s", sanitize_text_field( $exclude_type ) )
            );
        }

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
    }

    public static function get_stats( $threshold = 70 ) {
        global $wpdb;
        $table = self::table_name();

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $totals = $wpdb->get_row(
            "SELECT COUNT(*) AS total, AVG(score) AS avg_score FROM {$table} WHERE score IS NOT NULL",
            ARRAY_A
        );

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $by_type = $wpdb->get_results(
            "SELECT test_type, COUNT(*) AS cnt, AVG(score) AS avg FROM {$table} WHERE score IS NOT NULL GROUP BY test_type ORDER BY cnt DESC",
            ARRAY_A
        );

        $below = (int) $wpdb->get_var(
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE score IS NOT NULL AND score < %d",
                $threshold
            )
        );

        return [
            'total'           => (int) ( $totals['total'] ?? 0 ),
            'avg_score'       => $totals['avg_score'] !== null ? round( (float) $totals['avg_score'] ) : null,
            'below_threshold' => $below,
            'by_type'         => $by_type ?: [],
        ];
    }

    /**
     * Build extracted_data_json from a result data array.
     * Captures designSystem, components, and designDebtScore for design-audit history.
     *
     * @param array $data Raw result data.
     * @return string|null JSON string or null.
     */
    private static function build_extracted_data( $data ) {
        $extracted = [];

        if ( isset( $data['designSystem'] ) ) {
            $extracted['designSystem'] = $data['designSystem'];
        }
        if ( isset( $data['components'] ) ) {
            $extracted['components'] = $data['components'];
        }
        if ( isset( $data['designDebtScore'] ) ) {
            $extracted['designDebtScore'] = $data['designDebtScore'];
        }
        // Persist the user-selected WCAG conformance level (A/AA/AAA) so PDF
        // reports loaded from history always show the correct target level.
        if ( isset( $data['targetWcagLevel'] ) && in_array( $data['targetWcagLevel'], [ 'A', 'AA', 'AAA' ], true ) ) {
            $extracted['wcagLevel'] = sanitize_text_field( $data['targetWcagLevel'] );
        }

        return ! empty( $extracted ) ? wp_json_encode( $extracted ) : null;
    }

    /**
     * Update the screenshots_json column for an existing history record.
     * Called after a server-side screenshots fetch to store full-quality images.
     *
     * @param int    $id              History record ID.
     * @param string $screenshots_json JSON-encoded screenshots map.
     * @return bool True on success.
     */
    public static function update_screenshots( $id, $screenshots_json ) {
        global $wpdb;
        return (bool) $wpdb->update(
            self::table_name(),
            [ 'screenshots_json' => $screenshots_json ],
            [ 'id' => (int) $id ],
            [ '%s' ],
            [ '%d' ]
        );
    }

    public static function purge_old( $keep = 100 ) {
        global $wpdb;
        $table = self::table_name();
        $count = self::count();
        if ( $count <= $keep ) return 0;
        $delete_count = $count - $keep;
        return $wpdb->query(
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $wpdb->prepare(
                "DELETE FROM {$table} ORDER BY created_at ASC LIMIT %d",
                $delete_count
            )
        );
    }
}
