<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_AJAX {

    public static function ajax_health_check() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => __( 'Unauthorized.', 'qaproof' ) ], 403 );
        }

        $result = QAProof_API_Client::health_check();

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( [ 'message' => $result->get_error_message() ] );
        }

        wp_send_json_success( $result );
    }

    /**
     * Fetch /api/me. Accepts an optional `api_key` POST param so the UI can
     * preview an unsaved key without disturbing the saved one.
     */
    public static function ajax_fetch_account_info() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => __( 'Unauthorized.', 'qaproof' ) ], 403 );
        }

        $posted_key = isset( $_POST['api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) : '';
        $legacy     = '/^qap_[0-9a-f]{64}$/i';
        $current    = '/^qap_(?:live|test)_sk_[0-9a-f]{48}$/i';
        $use_key    = ( preg_match( $legacy, $posted_key ) || preg_match( $current, $posted_key ) )
                      ? $posted_key
                      : null;

        $result = QAProof_API_Client::get_account_info( $use_key );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( [ 'message' => $result->get_error_message() ] );
        }

        wp_send_json_success( $result );
    }

    // NOTE: the qaproof_save_history AJAX action and its sanitize_history_payload
    // / sanitize_data_uri_image helpers were removed. Test history is now written
    // exclusively server-side by the API when the async job completes (single
    // writer). The browser-driven save here produced a second, duplicate
    // test_history row per test, so it has been deleted along with its dedup
    // transient and the client-side "max history entries" pruning (retention is
    // enforced server-side by the plan's history_retention_days).
}
