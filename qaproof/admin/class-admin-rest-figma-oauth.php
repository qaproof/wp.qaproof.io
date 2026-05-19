<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Thin REST proxies for the Figma OAuth flow. The actual OAuth handshake,
 * token storage, and refresh logic live on api.qaproof.io; this class only
 * relays calls and normalizes the response shape for the admin UI.
 */
class QAProof_Admin_REST_Figma_OAuth {

    public static function handle_start( WP_REST_Request $request ) {
        $result = QAProof_API_Client::figma_oauth_start();
        return self::respond( $result );
    }

    public static function handle_status( WP_REST_Request $request ) {
        $result = QAProof_API_Client::figma_oauth_status();
        return self::respond( $result );
    }

    public static function handle_disconnect( WP_REST_Request $request ) {
        $result = QAProof_API_Client::figma_oauth_disconnect();
        return self::respond( $result );
    }

    /** Uniform REST response — preserves the backend's HTTP status + error.code. */
    private static function respond( $result ) {
        if ( is_wp_error( $result ) ) {
            $data       = $result->get_error_data();
            $status     = is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 502;
            $error_code = is_array( $data ) && isset( $data['error_code'] ) ? $data['error_code'] : 'API_ERROR';
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'code'    => $error_code,
                    'message' => $result->get_error_message(),
                ],
            ], $status );
        }
        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }
}
