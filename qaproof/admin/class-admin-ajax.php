<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_AJAX {

    public static function ajax_health_check() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => 'Unauthorized.' ], 403 );
        }

        $result = QAProof_API_Client::health_check();

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( [ 'message' => $result->get_error_message() ] );
        }

        wp_send_json_success( $result );
    }

    /**
     * AJAX handler: detailed network diagnostics.
     * Tests connectivity from PHP to the API server.
     */
    public static function ajax_diagnose() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => 'Unauthorized.' ], 403 );
        }

        $api_endpoint = QAProof_Settings::get_api_endpoint();
        $api_key      = QAProof_Settings::get_api_key();
        $api_host     = wp_parse_url( $api_endpoint, PHP_URL_HOST );
        $results      = [];

        // 1. Config check
        $results['config'] = [
            'api_endpoint'          => $api_endpoint,
            'api_key_set'           => ! empty( $api_key ),
            'api_key_prefix'        => $api_key ? substr( $api_key, 0, 8 ) . '...' : '(empty)',
            'env_override'          => getenv( 'QAPROOF_API_ENDPOINT' ) ?: '(not set)',
            'wp_http_block_external'=> defined( 'WP_HTTP_BLOCK_EXTERNAL' ) ? WP_HTTP_BLOCK_EXTERNAL : false,
            'wp_accessible_hosts'   => defined( 'WP_ACCESSIBLE_HOSTS' ) ? WP_ACCESSIBLE_HOSTS : '(not set)',
            'wp_proxy_host'         => defined( 'WP_PROXY_HOST' ) ? WP_PROXY_HOST : '(not set)',
            'php_version'           => phpversion(),
            'curl_version'          => function_exists( 'curl_version' ) ? curl_version()['version'] : 'N/A',
            'openssl_version'       => defined( 'OPENSSL_VERSION_TEXT' ) ? OPENSSL_VERSION_TEXT : 'N/A',
        ];

        // 2. DNS resolution
        $dns_start = microtime( true );
        $ips = gethostbynamel( $api_host );
        $dns_time = round( ( microtime( true ) - $dns_start ) * 1000, 1 );
        $results['dns'] = [
            'host'    => $api_host,
            'ips'     => $ips ?: [],
            'ok'      => ! empty( $ips ),
            'time_ms' => $dns_time,
        ];

        // 3. Health check via wp_remote_get (simplest test)
        $health_start = microtime( true );
        $health_resp = wp_remote_get( $api_endpoint . '/api/health', [
            'timeout'   => 15,
            'sslverify' => true,
        ]);
        $health_time = round( ( microtime( true ) - $health_start ) * 1000, 1 );

        if ( is_wp_error( $health_resp ) ) {
            $results['health'] = [
                'ok'      => false,
                'error'   => $health_resp->get_error_message(),
                'time_ms' => $health_time,
            ];
        } else {
            $results['health'] = [
                'ok'          => true,
                'http_code'   => wp_remote_retrieve_response_code( $health_resp ),
                'body'        => substr( wp_remote_retrieve_body( $health_resp ), 0, 300 ),
                'time_ms'     => $health_time,
            ];
        }

        // 4a. POST /api/compare — NO pageUrl (fails at validation BEFORE DNS/DB)
        $results['test_no_url'] = self::diagnose_post( $api_endpoint, $api_key, [
            'testType' => 'responsive',
        ], 'No pageUrl — should fail at validation before DNS/DB' );

        // 4b. POST /api/compare — pageUrl is an IP (skips DNS, still hits DB)
        $results['test_ip_url'] = self::diagnose_post( $api_endpoint, $api_key, [
            'testType' => 'responsive',
            'pageUrl'  => 'https://93.184.216.34',
        ], 'IP pageUrl — skips DNS, tests DB' );

        // 4c. POST /api/compare — normal URL (DNS + DB)
        $results['test_normal_url'] = self::diagnose_post( $api_endpoint, $api_key, [
            'testType' => 'responsive',
            'pageUrl'  => 'https://example.com',
        ], 'Normal URL — tests DNS + DB' );

        // 4d. GET /api/jobs-stats (tests PostgreSQL read - no body parsing issues)
        $stats_start = microtime( true );
        $stats_resp = wp_remote_get( $api_endpoint . '/api/jobs-stats', [
            'headers' => [ 'Authorization' => 'Bearer ' . $api_key ],
            'timeout' => 10,
            'sslverify' => true,
        ]);
        $stats_time = round( ( microtime( true ) - $stats_start ) * 1000, 1 );

        if ( is_wp_error( $stats_resp ) ) {
            $results['jobs_stats'] = [
                'ok'    => false,
                'error' => $stats_resp->get_error_message(),
                'time_ms' => $stats_time,
                'note'  => 'Tests PostgreSQL connection via GET (no body parsing)',
            ];
        } else {
            $results['jobs_stats'] = [
                'ok'        => true,
                'http_code' => wp_remote_retrieve_response_code( $stats_resp ),
                'body'      => substr( wp_remote_retrieve_body( $stats_resp ), 0, 300 ),
                'time_ms'   => $stats_time,
                'note'      => 'Tests PostgreSQL connection via GET (no body parsing)',
            ];
        }

        wp_send_json_success( $results );
    }

    /**
     * Helper: POST to /api/compare with specific payload and return result.
     */
    private static function diagnose_post( $api_endpoint, $api_key, $payload, $note ) {
        $start = microtime( true );
        $resp  = wp_remote_post( $api_endpoint . '/api/compare', [
            'headers' => [
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'body'      => wp_json_encode( $payload ),
            'timeout'   => 12,
            'sslverify' => true,
            'httpversion' => '1.1',
        ]);
        $time = round( ( microtime( true ) - $start ) * 1000, 1 );

        if ( is_wp_error( $resp ) ) {
            return [
                'ok'      => false,
                'error'   => $resp->get_error_message(),
                'time_ms' => $time,
                'note'    => $note,
            ];
        }

        $code = wp_remote_retrieve_response_code( $resp );
        return [
            'ok'        => $code === 200,
            'http_code' => $code,
            'body'      => substr( wp_remote_retrieve_body( $resp ), 0, 300 ),
            'time_ms'   => $time,
            'note'      => $note,
        ];
    }

    /**
     * AJAX handler: save test result to history.
     * Uses admin-ajax.php which bypasses Varnish cache.
     */
    public static function ajax_save_history() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => 'Unauthorized.' ], 403 );
        }

        $test_type = isset( $_POST['testType'] ) ? sanitize_text_field( $_POST['testType'] ) : '';
        $page_url  = isset( $_POST['pageUrl'] ) ? sanitize_url( $_POST['pageUrl'] ) : '';
        $result    = isset( $_POST['result'] ) ? $_POST['result'] : [];

        if ( empty( $test_type ) || empty( $page_url ) || empty( $result ) ) {
            wp_send_json_error( [ 'message' => 'Missing required fields.' ] );
        }

        // Sanitize result array recursively
        if ( is_string( $result ) ) {
            $result = json_decode( stripslashes( $result ), true );
        }

        $save_data = array_merge(
            [ 'test_type' => $test_type, 'page_url' => $page_url ],
            is_array( $result ) ? $result : []
        );

        $saved_id = QAProof_Test_History::save( $save_data );
        $max = (int) get_option( 'qaproof_max_history', 30 );
        QAProof_Test_History::purge_old( $max > 0 ? $max : 30 );

        wp_send_json_success( [ 'saved' => $saved_id ? true : false ] );
    }
}
