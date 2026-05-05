<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_Monitors {

    public static function handle_list_monitors() {
        $monitors = QAProof_Monitor::get_all();

        // Augment each monitor with the next WP-Cron timestamp for its schedule.
        $cron_next = [
            'daily'   => wp_next_scheduled( QAProof_Scheduler::DAILY_HOOK ),
            'weekly'  => wp_next_scheduled( QAProof_Scheduler::WEEKLY_HOOK ),
            'monthly' => wp_next_scheduled( QAProof_Scheduler::MONTHLY_HOOK ),
        ];

        foreach ( $monitors as &$m ) {
            $ts = isset( $cron_next[ $m['schedule'] ] ) ? $cron_next[ $m['schedule'] ] : false;
            $m['next_run_at'] = $ts ? gmdate( 'Y-m-d H:i:s', $ts ) : null;
        }
        unset( $m );

        return new WP_REST_Response( [ 'success' => true, 'data' => $monitors ], 200 );
    }

    public static function handle_get_monitor( WP_REST_Request $request ) {
        $monitor = QAProof_Monitor::get( (int) $request['id'] );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }
        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 200 );
    }

    public static function handle_create_monitor( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['page_url'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Page URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $url = sanitize_url( $params['page_url'] );
        $parsed = wp_parse_url( $url );
        if ( empty( $parsed['scheme'] ) || ! in_array( $parsed['scheme'], [ 'http', 'https' ], true )
            || empty( $parsed['host'] ) || strpos( $parsed['host'], '.' ) === false ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Please enter a valid URL (e.g. https://example.com).', 'qaproof' ) ],
            ], 400 );
        }

        // Reject duplicate URLs (normalised: lowercase, strip trailing slash)
        $normalized_url = rtrim( strtolower( sanitize_url( $params['page_url'] ) ), '/' );
        $existing = QAProof_Monitor::get_all();
        foreach ( $existing as $m ) {
            if ( rtrim( strtolower( $m['page_url'] ), '/' ) === $normalized_url ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => __( 'A monitor for this URL already exists.', 'qaproof' ) ],
                ], 409 );
            }
        }

        $valid_notify_on = [ 'failures', 'all' ];
        $create_data = [
            'page_url'        => sanitize_url( $params['page_url'] ),
            'schedule'        => isset( $params['schedule'] ) ? sanitize_text_field( $params['schedule'] ) : 'daily',
            'notify_email'    => isset( $params['notify_email'] ) ? (int) $params['notify_email'] : 1,
            'notify_admin'    => isset( $params['notify_admin'] ) ? (int) $params['notify_admin'] : 1,
            'notify_on'       => isset( $params['notify_on'] ) && in_array( $params['notify_on'], $valid_notify_on, true ) ? $params['notify_on'] : 'failures',
            'threshold_score' => isset( $params['threshold_score'] ) ? (int) $params['threshold_score'] : (int) get_option( 'qaproof_default_threshold', 95 ),
        ];
        if ( ! empty( $params['scheduled_at'] ) ) {
            $create_data['scheduled_at'] = sanitize_text_field( $params['scheduled_at'] );
        }
        $id = QAProof_Monitor::create( $create_data );

        if ( ! $id ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Failed to create monitor.', 'qaproof' ) ],
            ], 500 );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => QAProof_Monitor::get( $id ),
        ], 201 );
    }

    public static function handle_update_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        $params = $request->get_json_params();
        $update = [];

        if ( isset( $params['page_url'] ) ) {
            $update['page_url'] = sanitize_url( $params['page_url'] );
        }
        if ( isset( $params['schedule'] ) ) {
            $update['schedule'] = sanitize_text_field( $params['schedule'] );
        }
        if ( isset( $params['is_enabled'] ) ) {
            $update['is_enabled'] = (int) $params['is_enabled'];
        }
        if ( isset( $params['notify_email'] ) ) {
            $update['notify_email'] = (int) $params['notify_email'];
        }
        if ( isset( $params['notify_admin'] ) ) {
            $update['notify_admin'] = (int) $params['notify_admin'];
        }
        if ( isset( $params['notify_on'] ) && in_array( $params['notify_on'], [ 'failures', 'all' ], true ) ) {
            $update['notify_on'] = sanitize_text_field( $params['notify_on'] );
        }
        if ( isset( $params['threshold_score'] ) ) {
            $update['threshold_score'] = (int) $params['threshold_score'];
        }
        if ( ! empty( $params['scheduled_at'] ) ) {
            $update['scheduled_at'] = sanitize_text_field( $params['scheduled_at'] );
        }

        QAProof_Monitor::update( $id, $update );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => QAProof_Monitor::get( $id ),
        ], 200 );
    }

    public static function handle_delete_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Delete baseline from API if exists
        if ( ! empty( $monitor['baseline_key'] ) ) {
            QAProof_API_Client::delete_baseline( $monitor['baseline_key'] );
        }

        QAProof_Monitor::delete( $id );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_run_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Schedule the monitor job via WP-Cron and immediately trigger it.
        // spawn_cron() fires a non-blocking HTTP request to wp-cron.php, which
        // runs the job in a separate PHP process — so this REST response returns
        // immediately (< 1s) and the UI polls for the result.
        //
        // The cron_request filter in QAProof_Scheduler::fix_cron_url_for_docker()
        // rewrites localhost:PORT → localhost so the request reaches Apache's
        // internal port 80 inside Docker containers.
        wp_schedule_single_event( time(), 'qaproof_run_monitor', [ $id ] );

        // Clear any stale doing_cron lock from a previously interrupted cron run,
        // otherwise spawn_cron() will silently skip firing the new cron request.
        $doing_cron_ts = get_transient( 'doing_cron' );
        if ( false !== $doing_cron_ts && ( floatval( $doing_cron_ts ) + 60 ) < microtime( true ) ) {
            delete_transient( 'doing_cron' );
        }

        spawn_cron();

        // Belt-and-suspenders for Docker environments where spawn_cron's non-blocking
        // HTTP request to localhost:PORT may fail to connect from inside the container.
        // We fire a direct curl call to the internal Apache port (80) in the background.
        // WP-Cron's own doing_cron transient prevents double-execution if both fire.
        if ( function_exists( 'exec' ) ) {
            $internal_cron_url = 'http://localhost/wp-cron.php?doing_wp_cron=' . sprintf( '%.22F', microtime( true ) );
            @exec( 'curl -s --connect-timeout 5 --max-time 180 ' . escapeshellarg( $internal_cron_url ) . ' > /dev/null 2>&1 &' );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => [
                'monitor' => $monitor,
                'message' => __( 'Monitor test started in background. Results will appear shortly.', 'qaproof' ),
            ],
        ], 200 );
    }

    public static function handle_get_results( WP_REST_Request $request ) {
        $id     = (int) $request['id'];
        $limit  = $request->get_param( 'limit' ) ? (int) $request->get_param( 'limit' ) : 20;
        $offset = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        $results = QAProof_Result::get_for_monitor( $id, [
            'limit'  => $limit,
            'offset' => $offset,
        ] );
        $total = QAProof_Result::count( $id );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $results,
            'total'   => $total,
        ], 200 );
    }

    public static function handle_approve_result( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $result = QAProof_Result::get( $id );
        if ( ! $result ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Result not found.', 'qaproof' ) ],
            ], 404 );
        }

        $monitor = QAProof_Monitor::get( (int) $result['monitor_id'] );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Create a new baseline from the current page state
        $baseline_result = QAProof_API_Client::create_baseline( $monitor['page_url'] );

        if ( is_wp_error( $baseline_result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $baseline_result->get_error_message() ],
            ], 502 );
        }

        // Update monitor with new baseline
        QAProof_Monitor::update( (int) $result['monitor_id'], [
            'baseline_key' => $baseline_result['key'],
            'has_baseline'  => 1,
        ] );

        // Mark result as approved
        QAProof_Result::update_status( $id, 'approved' );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_clear_notifications() {
        QAProof_Notifications::clear_badge();
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
