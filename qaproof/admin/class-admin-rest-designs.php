<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_Designs {

    public static function handle_figma_preview( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        $figma_url     = isset( $params['figmaUrl'] ) ? QAProof_Settings::sanitize_figma_url( $params['figmaUrl'] ) : '';
        $force_refresh = ! empty( $params['forceRefresh'] );

        if ( empty( $figma_url ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Figma URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        // Figma's 429 Retry-After applies per workspace/file, so the gate is per-file.
        $file_key = QAProof_Settings::extract_figma_file_key( $figma_url );
        if ( ! $force_refresh && $file_key !== '' ) {
            $blocked_until = QAProof_Settings::figma_rate_limit_active_until( $file_key );
            if ( $blocked_until > 0 ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [
                        'message' => __( 'Figma rate limit active for this file. Try again after the reset time.', 'qaproof' ),
                        'code'    => 'FIGMA_RATE_LIMITED',
                        'retryAt' => $blocked_until,
                        'fileKey' => $file_key,
                    ],
                ], 429 );
            }
        }

        $result = QAProof_API_Client::preview_figma( $figma_url, $force_refresh );

        if ( is_wp_error( $result ) ) {
            $status = 502;
            $data   = $result->get_error_data();
            if ( is_array( $data ) && isset( $data['status'] ) ) {
                $status = (int) $data['status'];
            }

            $error_code = is_array( $data ) && isset( $data['error_code'] ) ? $data['error_code'] : 'API_ERROR';

            // Only count when the call actually reached Figma (errors prefixed FIGMA_).
            $figma_hit_error_codes = [
                'FIGMA_RATE_LIMITED',
                'FIGMA_NOT_SHARED',
                'FIGMA_FILE_NOT_FOUND',
                'FIGMA_EXPORT_FAILED',
                'FIGMA_RENDER_TIMEOUT',
                'FIGMA_NODE_NOT_RENDERABLE',
                'FIGMA_IMAGE_DOWNLOAD_FAILED',
                'FIGMA_INVALID_IMAGE',
                'FIGMA_NODE_FETCH_FAILED',
                'FIGMA_NODE_NOT_FOUND',
                'FIGMA_NO_BOUNDS',
                'FIGMA_ZERO_FRAME',
                'FIGMA_ERROR',
            ];
            if ( in_array( $error_code, $figma_hit_error_codes, true ) && $file_key !== '' ) {
                QAProof_Settings::track_figma_api_call( $file_key, 'image', false );
            }

            // Persist Figma's real Retry-After timestamp.
            if ( $error_code === 'FIGMA_RATE_LIMITED' && is_array( $data ) && ! empty( $data['retry_at'] ) && $file_key !== '' ) {
                QAProof_Settings::record_figma_rate_limit( $file_key, $data['retry_at'] );
            }

            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'message' => $result->get_error_message(),
                    'code'    => $error_code,
                    'fileKey' => $file_key,
                    'retryAt' => ( $error_code === 'FIGMA_RATE_LIMITED' && is_array( $data ) && ! empty( $data['retry_at'] ) ) ? (int) $data['retry_at'] : 0,
                ],
            ], $status );
        }

        // Don't count cached hits (API marks them with fromCache: true).
        $from_cache = is_array( $result ) && ! empty( $result['fromCache'] );
        if ( ! $from_cache && $file_key !== '' ) {
            QAProof_Settings::track_figma_api_call( $file_key, 'image', true );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }

    public static function handle_detect_elements( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        $api_params = array();
        if ( ! empty( $params['figmaUrl'] ) )         $api_params['figmaUrl']         = QAProof_Settings::sanitize_figma_url( $params['figmaUrl'] );
        if ( ! empty( $params['figmaImageBase64'] ) ) $api_params['figmaImageBase64'] = $params['figmaImageBase64'];
        if ( ! empty( $params['sketchFileBase64'] ) ) $api_params['sketchFileBase64'] = $params['sketchFileBase64'];
        if ( ! empty( $params['pixelPerfectOnly'] ) ) $api_params['pixelPerfectOnly'] = true;

        $has_source = ! empty( $api_params['figmaUrl'] )
            || ! empty( $api_params['figmaImageBase64'] )
            || ! empty( $api_params['sketchFileBase64'] );

        if ( ! $has_source ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'A design source is required (Figma URL or uploaded image).', 'qaproof' ) ],
            ], 400 );
        }

        // Only gate when this call would actually hit Figma's API.
        $will_hit_figma = ! empty( $api_params['figmaUrl'] )
            && empty( $api_params['figmaImageBase64'] )
            && empty( $api_params['sketchFileBase64'] );
        $file_key = $will_hit_figma ? QAProof_Settings::extract_figma_file_key( $api_params['figmaUrl'] ) : '';

        if ( $will_hit_figma && $file_key !== '' ) {
            $blocked_until = QAProof_Settings::figma_rate_limit_active_until( $file_key );
            if ( $blocked_until > 0 ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [
                        'message' => __( 'Figma rate limit active for this file. Try again after the reset time.', 'qaproof' ),
                        'code'    => 'FIGMA_RATE_LIMITED',
                        'retryAt' => $blocked_until,
                        'fileKey' => $file_key,
                    ],
                ], 429 );
            }
        }

        $result = QAProof_API_Client::detect_elements( $api_params );

        // /v1/files/{key}/nodes counts separately from image export and is
        // billed regardless of outcome.
        $hit_figma = ! empty( $api_params['figmaUrl'] )
            && empty( $api_params['figmaImageBase64'] )
            && empty( $api_params['sketchFileBase64'] );

        if ( is_wp_error( $result ) ) {
            $status = 502;
            $data   = $result->get_error_data();
            if ( is_array( $data ) && isset( $data['status'] ) ) {
                $status = (int) $data['status'];
            }

            if ( $hit_figma && $file_key !== '' ) {
                QAProof_Settings::track_figma_api_call( $file_key, 'nodes', false );
            }

            $err_code = is_array( $data ) && isset( $data['error_code'] ) ? $data['error_code'] : '';
            if ( $err_code === 'FIGMA_RATE_LIMITED' && is_array( $data ) && ! empty( $data['retry_at'] ) && $file_key !== '' ) {
                QAProof_Settings::record_figma_rate_limit( $file_key, $data['retry_at'] );
            }

            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'message' => $result->get_error_message(),
                    'code'    => $err_code,
                    'fileKey' => $file_key,
                    'retryAt' => is_array( $data ) && ! empty( $data['retry_at'] ) ? (int) $data['retry_at'] : 0,
                ],
            ], $status );
        }

        // Count only when the API actually hit Figma (source=figma-api).
        $source = is_array( $result ) && isset( $result['source'] ) ? $result['source'] : '';
        if ( $hit_figma && $source === 'figma-api' && $file_key !== '' ) {
            QAProof_Settings::track_figma_api_call( $file_key, 'nodes', true );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }

    /**
     * POST /qaproof/v1/designs/verify-access — confirm the service account
     * can read a Figma file. Body: { figmaUrl }.
     */
    public static function handle_verify_access( WP_REST_Request $request ) {
        $params    = $request->get_json_params();
        $figma_url = isset( $params['figmaUrl'] ) ? QAProof_Settings::sanitize_figma_url( $params['figmaUrl'] ) : '';

        if ( empty( $figma_url ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Figma URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::verify_figma_access( $figma_url );

        if ( is_wp_error( $result ) ) {
            $data       = $result->get_error_data();
            $status     = is_array( $data ) && isset( $data['status'] )     ? (int) $data['status']     : 502;
            $error_code = is_array( $data ) && isset( $data['error_code'] ) ? $data['error_code']       : 'API_ERROR';
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'message' => $result->get_error_message(),
                    'code'    => $error_code,
                ],
            ], $status );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }
}
