<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * WP REST handlers for visual regression monitors.
 * All data lives in the SaaS API (PostgreSQL) — this class is a pure proxy.
 */
class QAProof_Admin_REST_Monitors {

    public static function handle_list_monitors() {
        $monitors = QAProof_API_Client::monitors_list();

        if ( is_wp_error( $monitors ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $monitors->get_error_message() ],
            ], 502 );
        }

        // Augment each monitor with the next WP-Cron timestamp for its schedule.
        // Cron schedule data only exists on this WP install, so we enrich here.
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
        $id      = sanitize_text_field( $request['id'] );
        $monitor = QAProof_API_Client::monitors_get( $id );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $monitor->get_error_message() ],
            ], $http );
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

        $url    = sanitize_url( $params['page_url'] );
        $parsed = wp_parse_url( $url );
        if ( empty( $parsed['scheme'] ) || ! in_array( $parsed['scheme'], [ 'http', 'https' ], true )
            || empty( $parsed['host'] ) || strpos( $parsed['host'], '.' ) === false ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Please enter a valid URL (e.g. https://example.com).', 'qaproof' ) ],
            ], 400 );
        }

        $valid_notify_on = [ 'failures', 'all' ];
        $create_data = [
            'page_url'        => $url,
            'schedule'        => isset( $params['schedule'] ) ? sanitize_text_field( $params['schedule'] ) : 'daily',
            'notify_email'    => isset( $params['notify_email'] )    ? (int) $params['notify_email']    : 1,
            'notify_admin'    => isset( $params['notify_admin'] )    ? (int) $params['notify_admin']    : 1,
            'notify_on'       => isset( $params['notify_on'] ) && in_array( $params['notify_on'], $valid_notify_on, true )
                                    ? $params['notify_on'] : 'failures',
            'threshold_score' => isset( $params['threshold_score'] )
                                    ? (int) $params['threshold_score']
                                    : (int) get_option( 'qaproof_default_threshold', 95 ),
        ];
        if ( ! empty( $params['scheduled_at'] ) ) {
            $create_data['scheduled_at'] = sanitize_text_field( $params['scheduled_at'] );
        }

        $monitor = QAProof_API_Client::monitors_create( $create_data );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = 500;
            $code = '';
            if ( is_array( $data ) ) {
                if ( isset( $data['status'] ) )     { $http = (int) $data['status']; }
                if ( isset( $data['error_code'] ) ) { $code = $data['error_code']; }
            }
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'code' => $code, 'message' => $monitor->get_error_message() ],
            ], $http );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 201 );
    }

    public static function handle_update_monitor( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $params = $request->get_json_params();
        $update = [];

        if ( isset( $params['page_url'] ) )        { $update['page_url']        = sanitize_url( $params['page_url'] ); }
        if ( isset( $params['schedule'] ) )        { $update['schedule']        = sanitize_text_field( $params['schedule'] ); }
        if ( isset( $params['is_enabled'] ) )      { $update['is_enabled']      = (int) $params['is_enabled']; }
        if ( isset( $params['notify_email'] ) )    { $update['notify_email']    = (int) $params['notify_email']; }
        if ( isset( $params['notify_admin'] ) )    { $update['notify_admin']    = (int) $params['notify_admin']; }
        if ( isset( $params['threshold_score'] ) ) { $update['threshold_score'] = (int) $params['threshold_score']; }
        if ( ! empty( $params['scheduled_at'] ) )  { $update['scheduled_at']   = sanitize_text_field( $params['scheduled_at'] ); }
        if ( isset( $params['notify_on'] ) && in_array( $params['notify_on'], [ 'failures', 'all' ], true ) ) {
            $update['notify_on'] = sanitize_text_field( $params['notify_on'] );
        }

        $monitor = QAProof_API_Client::monitors_update( $id, $update );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $monitor->get_error_message() ],
            ], $http );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 200 );
    }

    public static function handle_delete_monitor( WP_REST_Request $request ) {
        $id      = sanitize_text_field( $request['id'] );
        $monitor = QAProof_API_Client::monitors_get( $id );

        if ( is_wp_error( $monitor ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Delete baseline from API storage if one exists
        if ( ! empty( $monitor['baseline_key'] ) ) {
            QAProof_API_Client::delete_baseline( $monitor['baseline_key'] );
        }

        $result = QAProof_API_Client::monitors_delete( $id );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_run_monitor( WP_REST_Request $request ) {
        $id      = sanitize_text_field( $request['id'] );
        $monitor = QAProof_API_Client::monitors_get( $id );

        if ( is_wp_error( $monitor ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Send the "queued" response BEFORE running the job, then keep the PHP
        // process alive to execute the monitor inline. This bypasses WP-Cron
        // entirely — which is unreliable in Docker because spawn_cron()'s
        // non-blocking HTTP request to localhost:PORT often fails to reach
        // Apache from inside the WP container, leaving the job stuck for minutes.
        //
        // fastcgi_finish_request() (PHP-FPM) and flush()+ignore_user_abort()
        // (mod_php) both let us return the HTTP response and continue working.
        // The browser sees a 200 immediately and starts polling for results.
        $response_body = wp_json_encode( [
            'success' => true,
            'data'    => [
                'monitor' => $monitor,
                'message' => __( 'Monitor test started. Results will appear shortly.', 'qaproof' ),
            ],
        ] );

        ignore_user_abort( true );
        @set_time_limit( 900 );

        if ( function_exists( 'fastcgi_finish_request' ) ) {
            header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
            header( 'Content-Length: ' . strlen( $response_body ) );
            echo $response_body;
            fastcgi_finish_request();
        } else {
            header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
            header( 'Connection: close' );
            header( 'Content-Length: ' . strlen( $response_body ) );
            echo $response_body;
            while ( ob_get_level() > 0 ) { @ob_end_flush(); }
            @flush();
        }

        // Now execute the monitor inline — client has already received the response.
        QAProof_Scheduler::run_single_monitor( $id );

        exit;
    }

    public static function handle_get_results( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $limit  = $request->get_param( 'limit' )  ? (int) $request->get_param( 'limit' )  : 20;
        $offset = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        $result = QAProof_API_Client::monitors_get_results( $id, [
            'limit'  => $limit,
            'offset' => $offset,
        ] );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result['data'],
            'total'   => $result['total'],
        ], 200 );
    }

    public static function handle_approve_result( WP_REST_Request $request ) {
        $result_id  = sanitize_text_field( $request['id'] );
        $monitor_id = sanitize_text_field( $request->get_param( 'monitorId' ) );

        if ( empty( $monitor_id ) ) {
            // monitorId not supplied — just flip the status, skip baseline re-creation
            $approved = QAProof_API_Client::monitors_approve_result( $result_id );
            if ( is_wp_error( $approved ) ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => $approved->get_error_message() ],
                ], 502 );
            }
            return new WP_REST_Response( [ 'success' => true ], 200 );
        }

        $monitor = QAProof_API_Client::monitors_get( $monitor_id );
        if ( is_wp_error( $monitor ) ) {
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
        QAProof_API_Client::monitors_update( $monitor_id, [
            'baseline_key' => $baseline_result['key'],
            'has_baseline' => 1,
        ] );

        // Mark result as approved
        QAProof_API_Client::monitors_approve_result( $result_id );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_clear_notifications() {
        QAProof_Notifications::clear_badge();
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
