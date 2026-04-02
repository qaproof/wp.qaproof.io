<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_API_Client {

    const TIMEOUT = 300; // 5 minutes — matches server timeout

    /**
     * Run a comparison test against the SaaS API.
     *
     * @param array $params Test parameters (pageUrl, testType, etc.)
     * @return array|WP_Error Decoded response data on success, WP_Error on failure.
     */
    public static function run_test( $params ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/compare';
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        $response = wp_remote_post( $endpoint, [
            'headers' => [
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'body'      => wp_json_encode( $params ),
            'timeout'   => self::TIMEOUT,
            'sslverify' => true,
        ]);

        // Network-level error (DNS, timeout, SSL)
        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf(
                    __( 'Could not reach the API: %s', 'qaproof' ),
                    $response->get_error_message()
                )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $body        = wp_remote_retrieve_body( $response );
        $decoded     = json_decode( $body, true );

        // Invalid JSON response
        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        // API returned an error response
        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            $error_code = isset( $decoded['error']['code'] )
                ? $decoded['error']['code']
                : 'API_ERROR';

            return new WP_Error( 'qaproof_api_error', $error_msg, [
                'status'     => $status_code,
                'error_code' => $error_code,
            ]);
        }

        return $decoded['data'];
    }

    /**
     * Create a baseline screenshot via the SaaS API.
     *
     * @param string $page_url URL to capture as baseline.
     * @return array|WP_Error Baseline data on success, WP_Error on failure.
     */
    public static function create_baseline( $page_url ) {
        return self::api_request( 'POST', '/api/baselines', array( 'pageUrl' => $page_url ) );
    }

    /**
     * Get a baseline by key.
     *
     * @param string $key Baseline key.
     * @return array|WP_Error
     */
    public static function get_baseline( $key ) {
        return self::api_request( 'GET', '/api/baselines/' . $key );
    }

    /**
     * Delete a baseline by key.
     *
     * @param string $key Baseline key.
     * @return array|WP_Error
     */
    public static function delete_baseline( $key ) {
        return self::api_request( 'DELETE', '/api/baselines/' . $key );
    }

    /**
     * List all baselines.
     *
     * @return array|WP_Error
     */
    public static function list_baselines() {
        return self::api_request( 'GET', '/api/baselines' );
    }

    /**
     * Generic API request helper.
     *
     * @param string     $method HTTP method (GET, POST, DELETE).
     * @param string     $path   API path (e.g. '/api/baselines').
     * @param array|null $body   Request body for POST requests.
     * @return array|WP_Error
     */
    private static function api_request( $method, $path, $body = null ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . $path;
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        $args = array(
            'method'    => $method,
            'headers'   => array(
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'timeout'   => self::TIMEOUT,
            'sslverify' => true,
        );

        if ( $body !== null ) {
            $args['body'] = wp_json_encode( $body );
        }

        $response = wp_remote_request( $endpoint, $args );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg, array(
                'status' => $status_code,
            ) );
        }

        return $decoded['data'];
    }

    /**
     * Fetch a Figma design preview image.
     *
     * Timeout set to 120s to allow for Figma API rate-limit retries on the backend.
     *
     * @param string $figma_url    Figma design URL.
     * @param string $figma_token  Figma Personal Access Token.
     * @param bool   $force_refresh Whether to bypass server-side cache.
     * @return array|WP_Error Preview data on success, WP_Error on failure.
     */
    public static function preview_figma( $figma_url, $figma_token, $force_refresh = false ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/figma-preview';
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        $response = wp_remote_post( $endpoint, array(
            'headers' => array(
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body'      => wp_json_encode( array_filter( array(
                'figmaUrl'     => $figma_url,
                'figmaToken'   => $figma_token,
                'forceRefresh' => $force_refresh ? true : null,
            ) ) ),
            'timeout'   => 120,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            $error_code = isset( $decoded['error']['code'] )
                ? $decoded['error']['code']
                : 'API_ERROR';

            return new WP_Error( 'qaproof_figma_error', $error_msg, array(
                'status'     => $status_code,
                'error_code' => $error_code,
            ) );
        }

        return $decoded['data'];
    }

    /**
     * Detect UI elements/sections in a design image.
     *
     * @param string      $figma_url   Figma design URL.
     * @param string      $figma_token Figma Personal Access Token.
     * @param string|null $image_base64 Direct base64 image (alternative to Figma URL).
     * @return array|WP_Error Detection results or error.
     */
    public static function detect_elements( $params = array() ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/detect-elements';
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        // Pass through all supported fields
        $body = array();
        $allowed_keys = array(
            'figmaUrl', 'figmaToken', 'figmaImageBase64',
            'sketchFileBase64',
        );
        foreach ( $allowed_keys as $key ) {
            if ( ! empty( $params[ $key ] ) ) {
                $body[ $key ] = $params[ $key ];
            }
        }

        $response = wp_remote_post( $endpoint, array(
            'headers' => array(
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body'      => wp_json_encode( $body ),
            'timeout'   => 120,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg, array(
                'status' => $status_code,
            ) );
        }

        return $decoded['data'];
    }

    /**
     * Check API health.
     *
     * @return array|WP_Error Health check response or error.
     */
    public static function health_check() {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/health';

        $response = wp_remote_get( $endpoint, [
            'timeout'   => 10,
            'sslverify' => true,
        ]);

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        if ( $status_code !== 200 ) {
            return new WP_Error( 'qaproof_health_error',
                sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code )
            );
        }

        $body    = wp_remote_retrieve_body( $response );
        $decoded = json_decode( $body, true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_health_invalid_json',
                __( 'API returned invalid response.', 'qaproof' )
            );
        }

        return $decoded;
    }
}
