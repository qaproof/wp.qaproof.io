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

        if ( $has_job_id_col && $job_id ) {
            $row = array_merge( [ 'job_id' => $job_id ], $row );
        }

        if ( self::column_exists( 'api_key_hash' ) ) {
            $row['api_key_hash'] = QAProof_Settings::get_api_key_hash();
        }

        $formats = $has_job_id_col && $job_id ? [ '%s', '%s', '%s' ] : [ '%s', '%s' ];
        $formats[] = $row['score'] !== null ? '%d' : '%s';
        $extra = [ '%s', '%s', '%s', '%s', '%s', '%s' ];
        if ( isset( $row['api_key_hash'] ) ) {
            $extra[] = '%s';
        }
        $formats = array_merge( $formats, $extra );

        $result = $wpdb->insert( self::table_name(), $row, $formats );

        if ( $result === false ) {
            // 1062 = duplicate key — same job_id saved twice.
            if ( ! empty( $job_id ) && strpos( $wpdb->last_error, '1062' ) !== false ) {
                qaproof_debug_log( '[QAProof] test_history: duplicate job_id blocked by DB constraint — jobId=' . $job_id );
                return 0;
            }
            qaproof_debug_log( '[QAProof] test_history insert failed: ' . $wpdb->last_error );
            return 0;
        }

        return $wpdb->insert_id;
    }

    private static function column_exists( $column ) {
        return QAProof_Database::column_exists( self::table_name(), $column );
    }

    public static function get_all( $args = [] ) {
        global $wpdb;
        $table    = self::table_name();
        $defaults = [ 'limit' => 50, 'offset' => 0, 'test_type' => '', 'exclude_type' => '' ];
        $args     = wp_parse_args( $args, $defaults );

        $where  = [ '1=1' ];
        $values = [];

        if ( self::column_exists( 'api_key_hash' ) ) {
            $hash = QAProof_Settings::get_api_key_hash();
            if ( $hash !== '' ) {
                $where[]  = 'api_key_hash = %s';
                $values[] = $hash;
            }
        }

        if ( ! empty( $args['test_type'] ) ) {
            $where[]  = 'test_type = %s';
            $values[] = sanitize_text_field( $args['test_type'] );
        } elseif ( ! empty( $args['exclude_type'] ) ) {
            $where[]  = 'test_type != %s';
            $values[] = sanitize_text_field( $args['exclude_type'] );
        }

        $values[] = (int) $args['limit'];
        $values[] = (int) $args['offset'];

        $where_sql = implode( ' AND ', $where );
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC LIMIT %d OFFSET %d",
                ...$values
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
        $table  = self::table_name();
        $where  = [ '1=1' ];
        $values = [];

        if ( self::column_exists( 'api_key_hash' ) ) {
            $hash = QAProof_Settings::get_api_key_hash();
            if ( $hash !== '' ) {
                $where[]  = 'api_key_hash = %s';
                $values[] = $hash;
            }
        }

        if ( ! empty( $test_type ) ) {
            $where[]  = 'test_type = %s';
            $values[] = sanitize_text_field( $test_type );
        } elseif ( ! empty( $exclude_type ) ) {
            $where[]  = 'test_type != %s';
            $values[] = sanitize_text_field( $exclude_type );
        }

        $where_sql = implode( ' AND ', $where );
        if ( ! empty( $values ) ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", ...$values ) );
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
        if ( isset( $data['targetWcagLevel'] ) && in_array( $data['targetWcagLevel'], [ 'A', 'AA', 'AAA' ], true ) ) {
            $extracted['wcagLevel'] = sanitize_text_field( $data['targetWcagLevel'] );
        }

        return ! empty( $extracted ) ? wp_json_encode( $extracted ) : null;
    }

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
