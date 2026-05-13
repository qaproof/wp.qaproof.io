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

        // Send the "queued" response BEFORE running the job, then keep the PHP
        // process alive to execute the monitor inline. This bypasses WP-Cron
        // entirely — which is unreliable in Docker because spawn_cron()'s
        // non-blocking HTTP request to localhost:PORT often fails to reach
        // Apache from inside the WP container, leaving the job stuck for
        // minutes until JS-pinged wp-cron.php finally fires it.
        //
        // fastcgi_finish_request() (PHP-FPM) and flush()+ignore_user_abort()
        // (mod_php) both let us return the HTTP response and continue working.
        // The browser sees a 200 immediately and starts polling for results;
        // the actual capture runs synchronously here in the same PHP process,
        // taking ~50–90 s for baseline creation or ~30–50 s for regression.

        $response_body = wp_json_encode( [
            'success' => true,
            'data'    => [
                'monitor' => $monitor,
                'message' => __( 'Monitor test started. Results will appear shortly.', 'qaproof' ),
            ],
        ] );

        // Make sure long-running background work isn't aborted if the browser
        // closes the connection mid-capture. 900s lines up with Apache Timeout
        // (apache-timeout.conf) + php.ini max_execution_time (uploads.ini) so
        // the poll loop won't be killed mid-iteration.
        ignore_user_abort( true );
        @set_time_limit( 900 );

        if ( function_exists( 'fastcgi_finish_request' ) ) {
            // PHP-FPM path — preferred when available
            header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
            header( 'Content-Length: ' . strlen( $response_body ) );
            echo $response_body;
            fastcgi_finish_request();
        } else {
            // mod_php path — close output buffer + flush before continuing
            header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
            header( 'Connection: close' );
            header( 'Content-Length: ' . strlen( $response_body ) );
            echo $response_body;
            // Flush output buffers so the bytes leave PHP and reach the client
            while ( ob_get_level() > 0 ) { @ob_end_flush(); }
            @flush();
        }

        // Now execute the monitor inline — runs in the same PHP process but
        // the client has already received the response and is polling.
        QAProof_Scheduler::run_single_monitor( $id );

        // exit() prevents WP from sending its own response on top of ours
        exit;
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
