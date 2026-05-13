<?php
/**
 * Monitor model — CRUD operations for visual regression monitors.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Monitor {

    /**
     * Get all monitors.
     *
     * @param array $args Optional. Query arguments: 'is_enabled', 'schedule', 'orderby', 'order'.
     * @return array
     */
    public static function get_all( $args = array() ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';

        $where = array( '1=1' );
        $values = array();

        // Scope to the current account's monitors when the column exists.
        if ( self::column_exists( 'api_key_hash' ) ) {
            $hash = QAProof_Settings::get_api_key_hash();
            if ( $hash !== '' ) {
                $where[]  = 'api_key_hash = %s';
                $values[] = $hash;
            }
        }

        if ( isset( $args['is_enabled'] ) ) {
            $where[] = 'is_enabled = %d';
            $values[] = (int) $args['is_enabled'];
        }

        if ( isset( $args['schedule'] ) ) {
            $where[] = 'schedule = %s';
            $values[] = $args['schedule'];
        }

        $orderby = isset( $args['orderby'] ) ? sanitize_sql_orderby( $args['orderby'] ) : 'created_at';
        $order   = isset( $args['order'] ) && strtoupper( $args['order'] ) === 'ASC' ? 'ASC' : 'DESC';

        $sql = "SELECT * FROM {$table} WHERE " . implode( ' AND ', $where ) . " ORDER BY {$orderby} {$order}";

        if ( ! empty( $values ) ) {
            $sql = $wpdb->prepare( $sql, ...$values );
        }

        return $wpdb->get_results( $sql, ARRAY_A );
    }

    /**
     * Check if a column exists in the monitors table (cached per request).
     */
    private static function column_exists( $column ) {
        static $cache = [];
        if ( isset( $cache[ $column ] ) ) {
            return $cache[ $column ];
        }
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $result = $wpdb->get_var( $wpdb->prepare( "SHOW COLUMNS FROM {$table} LIKE %s", $column ) );
        $cache[ $column ] = ! empty( $result );
        return $cache[ $column ];
    }

    /**
     * Get a single monitor by ID.
     *
     * @param int $id
     * @return array|null
     */
    public static function get( $id ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';
        return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
    }

    /**
     * Create a new monitor.
     *
     * @param array $data {
     *     @type string $page_url       Required.
     *     @type string $schedule       Optional. 'daily', 'weekly', 'monthly'. Default 'daily'.
     *     @type bool   $notify_email   Optional. Default true.
     *     @type bool   $notify_admin   Optional. Default true.
     *     @type string $notify_on      Optional. 'failures' or 'all'. Default 'failures'.
     *     @type int    $threshold_score Optional. Default 90.
     * }
     * @return int|false Insert ID or false on failure.
     */
    public static function create( $data ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';

        $insert = array(
            'page_url'        => $data['page_url'],
            'schedule'        => isset( $data['schedule'] ) ? $data['schedule'] : 'daily',
            'is_enabled'      => isset( $data['is_enabled'] ) ? (int) $data['is_enabled'] : 1,
            'notify_email'    => isset( $data['notify_email'] ) ? (int) $data['notify_email'] : 1,
            'notify_admin'    => isset( $data['notify_admin'] ) ? (int) $data['notify_admin'] : 1,
            'notify_on'       => isset( $data['notify_on'] ) && in_array( $data['notify_on'], array( 'all', 'failures' ), true ) ? $data['notify_on'] : 'failures',
            'threshold_score' => isset( $data['threshold_score'] ) ? (int) $data['threshold_score'] : 90,
            'scheduled_at'    => ! empty( $data['scheduled_at'] ) ? $data['scheduled_at'] : current_time( 'mysql' ),
            'created_at'      => current_time( 'mysql' ),
        );

        // Tag with current account hash when the column exists.
        if ( self::column_exists( 'api_key_hash' ) ) {
            $insert['api_key_hash'] = QAProof_Settings::get_api_key_hash();
        }

        $formats = array( '%s', '%s', '%d', '%d', '%d', '%s', '%s', '%d', '%s', '%s' );
        if ( isset( $insert['api_key_hash'] ) ) {
            $formats[] = '%s';
        }

        $result = $wpdb->insert( $table, $insert, $formats );
        return $result ? $wpdb->insert_id : false;
    }

    /**
     * Update a monitor.
     *
     * @param int   $id
     * @param array $data Fields to update.
     * @return bool
     */
    public static function update( $id, $data ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';

        $allowed = array(
            'page_url', 'baseline_key', 'schedule', 'is_enabled',
            'notify_email', 'notify_admin', 'notify_on', 'threshold_score',
            'scheduled_at', 'last_run_at', 'last_score', 'has_baseline',
        );

        // Fields stored as strings (not integers)
        $string_fields = array( 'page_url', 'baseline_key', 'schedule', 'notify_on', 'scheduled_at', 'last_run_at' );

        $update = array();
        $format = array();

        foreach ( $allowed as $field ) {
            if ( isset( $data[ $field ] ) ) {
                $update[ $field ] = $data[ $field ];
                $format[] = in_array( $field, $string_fields, true ) ? '%s' : '%d';
            }
        }

        if ( empty( $update ) ) {
            return false;
        }

        return (bool) $wpdb->update( $table, $update, array( 'id' => $id ), $format, array( '%d' ) );
    }

    /**
     * Delete a monitor and its results.
     *
     * @param int $id
     * @return bool
     */
    public static function delete( $id ) {
        global $wpdb;

        // Delete associated results first
        $wpdb->delete(
            $wpdb->prefix . 'qaproof_results',
            array( 'monitor_id' => $id ),
            array( '%d' )
        );

        return (bool) $wpdb->delete(
            $wpdb->prefix . 'qaproof_monitors',
            array( 'id' => $id ),
            array( '%d' )
        );
    }

    /**
     * Get monitors due to run based on schedule.
     *
     * @param string $schedule 'daily', 'weekly', or 'monthly'.
     * @return array
     */
    public static function get_due( $schedule ) {
        global $wpdb;
        $table = $wpdb->prefix . 'qaproof_monitors';

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE is_enabled = 1 AND schedule = %s AND (scheduled_at IS NULL OR scheduled_at <= %s)",
                $schedule,
                current_time( 'mysql' )
            ),
            ARRAY_A
        );
    }
}
