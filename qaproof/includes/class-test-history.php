<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Test_History {

    public static function table_name() {
        global $wpdb;
        return $wpdb->prefix . 'qaproof_test_history';
    }

    public static function save( $data ) {
        global $wpdb;

        $row = [
            'test_type'            => sanitize_text_field( $data['test_type'] ?? '' ),
            'page_url'             => sanitize_url( $data['page_url'] ?? '' ),
            'score'                => isset( $data['score'] ) ? (int) $data['score'] : null,
            'summary'              => isset( $data['summary'] ) ? sanitize_text_field( $data['summary'] ) : null,
            'categories_json'      => isset( $data['categories'] ) ? wp_json_encode( $data['categories'] ) : null,
            'differences_json'     => isset( $data['differences'] ) ? wp_json_encode( $data['differences'] ) : null,
            'recommendations_json' => isset( $data['recommendations'] ) ? wp_json_encode( $data['recommendations'] ) : null,
            'screenshots_json'     => isset( $data['screenshots'] ) ? wp_json_encode( $data['screenshots'] ) : null,
        ];

        // Use %s for score when null, %d when set
        $formats = [ '%s', '%s' ];
        $formats[] = $row['score'] !== null ? '%d' : '%s';
        $formats = array_merge( $formats, [ '%s', '%s', '%s', '%s', '%s' ] );

        $result = $wpdb->insert( self::table_name(), $row, $formats );

        if ( $result === false ) {
            error_log( '[QAProof] test_history insert failed: ' . $wpdb->last_error );
            error_log( '[QAProof] table: ' . self::table_name() );
        }

        return $wpdb->insert_id;
    }

    public static function get_all( $args = [] ) {
        global $wpdb;
        $defaults = [ 'limit' => 50, 'offset' => 0, 'test_type' => '', 'exclude_type' => '' ];
        $args = wp_parse_args( $args, $defaults );

        $where = '';
        if ( ! empty( $args['test_type'] ) ) {
            $where = $wpdb->prepare( ' WHERE test_type = %s', $args['test_type'] );
        } elseif ( ! empty( $args['exclude_type'] ) ) {
            $where = $wpdb->prepare( ' WHERE test_type != %s', $args['exclude_type'] );
        }

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM " . self::table_name() . $where . " ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $args['limit'],
                $args['offset']
            ),
            ARRAY_A
        );
    }

    public static function get( $id ) {
        global $wpdb;
        return $wpdb->get_row(
            $wpdb->prepare( "SELECT * FROM " . self::table_name() . " WHERE id = %d", $id ),
            ARRAY_A
        );
    }

    public static function delete( $id ) {
        global $wpdb;
        return $wpdb->delete( self::table_name(), [ 'id' => $id ], [ '%d' ] );
    }

    public static function count( $test_type = '', $exclude_type = '' ) {
        global $wpdb;
        $where = '';
        if ( ! empty( $test_type ) ) {
            $where = $wpdb->prepare( ' WHERE test_type = %s', $test_type );
        } elseif ( ! empty( $exclude_type ) ) {
            $where = $wpdb->prepare( ' WHERE test_type != %s', $exclude_type );
        }
        return (int) $wpdb->get_var( "SELECT COUNT(*) FROM " . self::table_name() . $where );
    }

    /**
     * Get dashboard statistics from test history.
     * Returns total tests, average score, count per type, and recent failures (score < threshold).
     */
    public static function get_stats( $threshold = 70 ) {
        global $wpdb;
        $table = self::table_name();

        $totals = $wpdb->get_row(
            "SELECT COUNT(*) AS total, AVG(score) AS avg_score FROM {$table} WHERE score IS NOT NULL",
            ARRAY_A
        );

        $by_type = $wpdb->get_results(
            "SELECT test_type, COUNT(*) AS cnt, AVG(score) AS avg FROM {$table} WHERE score IS NOT NULL GROUP BY test_type ORDER BY cnt DESC",
            ARRAY_A
        );

        $below = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE score IS NOT NULL AND score < %d",
                $threshold
            )
        );

        return [
            'total'       => (int) ( $totals['total'] ?? 0 ),
            'avg_score'   => $totals['avg_score'] !== null ? round( (float) $totals['avg_score'] ) : null,
            'below_threshold' => $below,
            'by_type'     => $by_type ?: [],
        ];
    }

    public static function purge_old( $keep = 100 ) {
        global $wpdb;
        $table = self::table_name();
        $count = self::count();
        if ( $count <= $keep ) return 0;
        $delete_count = $count - $keep;
        return $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} ORDER BY created_at ASC LIMIT %d",
                $delete_count
            )
        );
    }
}
