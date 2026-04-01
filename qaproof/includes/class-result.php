<?php
/**
 * Result model — CRUD operations for monitor run results.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Result {

    const MAX_RESULTS_PER_MONITOR = 50;

    /**
     * Get results for a monitor.
     *
     * @param int   $monitor_id
     * @param array $args Optional. 'limit', 'offset', 'status'.
     * @return array
     */
    public static function get_for_monitor( $monitor_id, $args = array() ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';

        $limit  = isset( $args['limit'] ) ? (int) $args['limit'] : 20;
        $offset = isset( $args['offset'] ) ? (int) $args['offset'] : 0;

        $where = array( 'monitor_id = %d' );
        $values = array( $monitor_id );

        if ( isset( $args['status'] ) ) {
            $where[] = 'status = %s';
            $values[] = $args['status'];
        }

        $sql = $wpdb->prepare(
            "SELECT * FROM {$table} WHERE " . implode( ' AND ', $where )
            . " ORDER BY run_date DESC LIMIT %d OFFSET %d",
            array_merge( $values, array( $limit, $offset ) )
        );

        return $wpdb->get_results( $sql, ARRAY_A );
    }

    /**
     * Get a single result by ID.
     *
     * @param int $id
     * @return array|null
     */
    public static function get( $id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';
        return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
    }

    /**
     * Get the latest result for a monitor.
     *
     * @param int $monitor_id
     * @return array|null
     */
    public static function get_latest( $monitor_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';
        return $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE monitor_id = %d ORDER BY run_date DESC LIMIT 1",
                $monitor_id
            ),
            ARRAY_A
        );
    }

    /**
     * Create a new result.
     *
     * @param array $data {
     *     @type int    $monitor_id          Required.
     *     @type int    $score               Optional.
     *     @type bool   $has_changes         Optional.
     *     @type string $summary             Optional.
     *     @type array  $categories          Optional. Will be JSON-encoded.
     *     @type array  $differences         Optional. Will be JSON-encoded.
     *     @type array  $recommendations     Optional. Will be JSON-encoded.
     *     @type array  $screenshots         Optional. Will be JSON-encoded.
     *     @type string $status              Optional. 'completed', 'failed', 'approved'.
     *     @type string $error_message       Optional.
     * }
     * @return int|false Insert ID or false on failure.
     */
    public static function create( $data ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';

        $insert = array(
            'monitor_id'           => (int) $data['monitor_id'],
            'run_date'             => current_time( 'mysql' ),
            'score'                => isset( $data['score'] ) ? (int) $data['score'] : null,
            'has_changes'          => isset( $data['has_changes'] ) ? (int) $data['has_changes'] : 0,
            'summary'              => isset( $data['summary'] ) ? $data['summary'] : null,
            'categories_json'      => isset( $data['categories'] ) ? wp_json_encode( $data['categories'] ) : null,
            'differences_json'     => isset( $data['differences'] ) ? wp_json_encode( $data['differences'] ) : null,
            'recommendations_json' => isset( $data['recommendations'] ) ? wp_json_encode( $data['recommendations'] ) : null,
            'screenshots_json'     => isset( $data['screenshots'] ) ? wp_json_encode( $data['screenshots'] ) : null,
            'status'               => isset( $data['status'] ) ? $data['status'] : 'completed',
            'error_message'        => isset( $data['error_message'] ) ? $data['error_message'] : null,
        );

        $format = array( '%d', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s' );

        $result = $wpdb->insert( $table, $insert, $format );
        if ( $result ) {
            // Purge old results to keep the table manageable
            self::purge_old( (int) $data['monitor_id'] );
            return $wpdb->insert_id;
        }
        return false;
    }

    /**
     * Update a result's status.
     *
     * @param int    $id
     * @param string $status 'completed', 'failed', or 'approved'.
     * @return bool
     */
    public static function update_status( $id, $status ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';

        return (bool) $wpdb->update(
            $table,
            array( 'status' => $status ),
            array( 'id' => $id ),
            array( '%s' ),
            array( '%d' )
        );
    }

    /**
     * Count results for a monitor.
     *
     * @param int $monitor_id
     * @return int
     */
    public static function count( $monitor_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';
        return (int) $wpdb->get_var(
            $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE monitor_id = %d", $monitor_id )
        );
    }

    /**
     * Purge old results, keeping only the most recent MAX_RESULTS_PER_MONITOR.
     *
     * @param int $monitor_id
     */
    public static function purge_old( $monitor_id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_results';

        $count = self::count( $monitor_id );
        if ( $count <= self::MAX_RESULTS_PER_MONITOR ) {
            return;
        }

        $to_delete = $count - self::MAX_RESULTS_PER_MONITOR;
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE monitor_id = %d ORDER BY run_date ASC LIMIT %d",
                $monitor_id,
                $to_delete
            )
        );
    }
}
