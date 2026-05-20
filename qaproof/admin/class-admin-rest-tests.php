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

        if ( $test_type === 'accessibility' && ! empty( $params['wcagLevel'] ) ) {
            $allowed_levels = [ 'A', 'AA', 'AAA' ];
            $level = strtoupper( sanitize_text_field( $params['wcagLevel'] ) );
            if ( in_array( $level, $allowed_levels, true ) ) {
                $api_params['wcagLevel'] = $level;
            }
        }

        if ( $test_type === 'fidelity' ) {
            if ( ! empty( $params['figmaUrl'] ) ) {
                $api_params['figmaUrl'] = QAProof_Settings::sanitize_figma_url( $params['figmaUrl'] );
            }
            if ( ! empty( $params['figmaImageBase64'] ) ) {
                $api_params['figmaImageBase64'] = $params['figmaImageBase64'];
            }
            if ( isset( $params['ignoreText'] ) ) {
                $api_params['ignoreText'] = rest_sanitize_boolean( $params['ignoreText'] );
            }
            if ( ! empty( $params['viewportPreset'] ) && in_array( $params['viewportPreset'], [ 'mobile', 'tablet', 'desktop' ], true ) ) {
                $api_params['viewportPreset'] = sanitize_text_field( $params['viewportPreset'] );
            }
            if ( isset( $params['viewportWidth'] ) ) {
                $w = (int) $params['viewportWidth'];
                if ( $w >= 320 && $w <= 2560 ) {
                    $api_params['viewportWidth'] = $w;
                }
            }
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

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result,
        ], 200 );
    }

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

    /** Separate from poll() so the multi-MB JSON doesn't time out through the WP proxy. */
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
