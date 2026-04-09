<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_Monitors {

    public static function handle_list_monitors() {
        $monitors = QAProof_Monitor::get_all();
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

        $id = QAProof_Monitor::create( [
            'page_url'        => sanitize_url( $params['page_url'] ),
            'schedule'        => isset( $params['schedule'] ) ? sanitize_text_field( $params['schedule'] ) : 'daily',
            'notify_email'    => isset( $params['notify_email'] ) ? (int) $params['notify_email'] : 1,
            'notify_admin'    => isset( $params['notify_admin'] ) ? (int) $params['notify_admin'] : 1,
            'threshold_score' => isset( $params['threshold_score'] ) ? (int) $params['threshold_score'] : (int) get_option( 'qaproof_default_threshold', 95 ),
        ] );

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
        if ( isset( $params['threshold_score'] ) ) {
            $update['threshold_score'] = (int) $params['threshold_score'];
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

        // Schedule the monitor run as a background cron event (runs async)
        // This prevents the REST request from timing out via Varnish
        wp_schedule_single_event( time(), 'qaproof_run_monitor', [ $id ] );
        // Trigger cron immediately
        spawn_cron();

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
