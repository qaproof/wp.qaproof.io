<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_Tests {

    public static function handle_run_test( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['pageUrl'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Page URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $test_type = isset( $params['testType'] ) ? $params['testType'] : 'fidelity';
        if ( ! in_array( $test_type, [ 'fidelity', 'responsive', 'regression', 'accessibility', 'design-audit' ], true ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Invalid test type.', 'qaproof' ) ],
            ], 400 );
        }

        $api_params = [
            'pageUrl'  => sanitize_url( $params['pageUrl'] ),
            'testType' => $test_type,
        ];

        // Pass WCAG level for accessibility tests
        if ( $test_type === 'accessibility' && ! empty( $params['wcagLevel'] ) ) {
            $allowed_levels = [ 'A', 'AA', 'AAA' ];
            $level = strtoupper( sanitize_text_field( $params['wcagLevel'] ) );
            if ( in_array( $level, $allowed_levels, true ) ) {
                $api_params['wcagLevel'] = $level;
            }
        }

        if ( $test_type === 'fidelity' ) {
            if ( ! empty( $params['figmaUrl'] ) ) {
                $api_params['figmaUrl'] = sanitize_url( $params['figmaUrl'] );
            }
            if ( ! empty( $params['figmaImageBase64'] ) ) {
                $api_params['figmaImageBase64'] = $params['figmaImageBase64'];
            }
            // Pass ignoreText setting
            if ( isset( $params['ignoreText'] ) ) {
                $api_params['ignoreText'] = rest_sanitize_boolean( $params['ignoreText'] );
            }
            // Element-level fidelity: pass region coordinates
            if ( ! empty( $params['elementRegion'] ) && is_array( $params['elementRegion'] ) ) {
                $region = [
                    'top'    => max( 0, (float) ( $params['elementRegion']['top'] ?? 0 ) ),
                    'left'   => max( 0, (float) ( $params['elementRegion']['left'] ?? 0 ) ),
                    'width'  => max( 0, (float) ( $params['elementRegion']['width'] ?? 0 ) ),
                    'height' => max( 0, (float) ( $params['elementRegion']['height'] ?? 0 ) ),
                ];
                if ( $region['width'] > 0 && $region['height'] > 0 ) {
                    $api_params['elementRegion'] = $region;
                }
            }
        }

        // API now returns { jobId, status: 'pending' } immediately
        $result = QAProof_API_Client::run_test( $api_params );

        if ( is_wp_error( $result ) ) {
            $status = 502;
            $data   = $result->get_error_data();
            if ( is_array( $data ) && isset( $data['status'] ) ) {
                $status = (int) $data['status'];
            }

            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], $status );
        }

        // Return jobId to browser — it will poll for results
        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result,
        ], 200 );
    }

    /**
     * Poll a background job for status and results.
     * When job is done, auto-saves result to test history.
     */
    public static function handle_poll_job( WP_REST_Request $request ) {
        $job_id = sanitize_text_field( $request->get_param( 'jobId' ) );

        if ( empty( $job_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Job ID is required.', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::poll_job( $job_id );

        if ( is_wp_error( $result ) ) {
            $code = $result->get_error_code();
            $status = $code === 'qaproof_job_not_found' ? 404 : 502;

            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], $status );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result,
        ], 200 );
    }

    /**
     * Fetch screenshots for a completed job.
     * Called separately from polling to avoid multi-MB JSON responses timing out
     * through the WP proxy.
     */
    public static function handle_job_screenshots( WP_REST_Request $request ) {
        $job_id = sanitize_text_field( $request->get_param( 'jobId' ) );

        if ( empty( $job_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Job ID is required.', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::get_job_screenshots( $job_id );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result,
        ], 200 );
    }

    /**
     * Save a test result to history.
     * Proxied to the SaaS API — data is stored in PostgreSQL, not local MySQL.
     */
    public static function handle_save_test_result( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['testType'] ) || empty( $params['pageUrl'] ) || empty( $params['result'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Missing required fields.', 'qaproof' ) ],
            ], 400 );
        }

        $result_data = is_array( $params['result'] ) ? $params['result'] : [];

        $save_data = array_merge(
            [
                'test_type' => sanitize_text_field( $params['testType'] ),
                'page_url'  => sanitize_url( $params['pageUrl'] ),
            ],
            $result_data
        );

        $saved = QAProof_API_Client::history_save( $save_data );

        return new WP_REST_Response( [
            'success'      => true,
            'historySaved' => ! is_wp_error( $saved ),
        ], 200 );
    }
}
