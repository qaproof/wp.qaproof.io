<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * REST handlers for the Figma OAuth connection.
 *
 * Each handler is a thin proxy to api.qaproof.io: the actual OAuth flow,
 * token storage, and refresh logic all live on the backend. The plugin's
 * job is just to relay the API key, expose status to the admin UI, and
 * return enough of the API's response shape that init.js can render.
 *
 * Endpoints (registered in class-admin.php):
 *   POST /qaproof/v1/figma-oauth/start       → { authorizeUrl }
 *   GET  /qaproof/v1/figma-oauth/status      → connection state
 *   POST /qaproof/v1/figma-oauth/disconnect  → { deleted: bool }
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

    /**
     * Translate WP_Error / API payload into a uniform REST response. The
     * frontend (init.js) only cares about res.ok + body.success — we preserve
     * the backend's HTTP status and error.code so it can branch on
     * FIGMA_OAUTH_NOT_CONFIGURED, AUTHENTICATION_ERROR, etc.
     */
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
