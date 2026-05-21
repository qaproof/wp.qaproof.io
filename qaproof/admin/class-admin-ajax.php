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

    /**
     * Save test result to history. The browser sends only jobId; this handler
     * fetches full-quality screenshots server-to-server (bypassing admin-ajax
     * POST size limits) and then saves to the SaaS API.
     */
    public static function ajax_save_history() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => __( 'Unauthorized.', 'qaproof' ) ], 403 );
        }

        $test_type = isset( $_POST['testType'] ) ? sanitize_text_field( wp_unslash( $_POST['testType'] ) ) : '';
        $page_url  = isset( $_POST['pageUrl'] )  ? sanitize_url( wp_unslash( $_POST['pageUrl'] ) ) : '';
        $job_id    = isset( $_POST['jobId'] )    ? sanitize_text_field( wp_unslash( $_POST['jobId'] ) ) : '';
        // JSON payload — unslash before decode; sanitization happens after json_decode validates structure.
        // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
        $result_raw    = isset( $_POST['result'] ) ? wp_unslash( $_POST['result'] ) : '';
        $payload_bytes = is_string( $result_raw ) ? strlen( $result_raw ) : 0;
        $result        = $result_raw;
        qaproof_debug_log( sprintf(
            '[QAProof] ajax_save_history start: testType=%s payloadBytes=%d jobId=%s',
            $test_type, $payload_bytes, $job_id ?: '(none)'
        ) );

        if ( empty( $test_type ) || empty( $page_url ) || empty( $result ) ) {
            qaproof_debug_log( '[QAProof] ajax_save_history: missing fields' );
            wp_send_json_error( [ 'message' => __( 'Missing required fields.', 'qaproof' ) ] );
        }

        // Dedup overlapping poll responses on the same jobId within 120s.
        if ( ! empty( $job_id ) ) {
            $dedup_key = 'qaproof_saved_job_' . substr( hash( 'sha256', $job_id ), 0, 16 );
            if ( get_transient( $dedup_key ) ) {
                qaproof_debug_log( '[QAProof] ajax_save_history: duplicate jobId detected, skipping — jobId=' . $job_id );
                wp_send_json_success( [ 'saved' => true, 'id' => null, 'deduplicated' => true ] );
            }
            set_transient( $dedup_key, 1, 120 );
        }

        if ( is_string( $result ) ) {
            $result = json_decode( $result, true );
        }

        if ( ! is_array( $result ) ) {
            qaproof_debug_log( '[QAProof] ajax_save_history: json_decode failed — payloadBytes=' . $payload_bytes );
            wp_send_json_error( [ 'message' => __( 'Invalid result data.', 'qaproof' ) ] );
        }

        $result = self::sanitize_history_payload( $result );

        $has_screenshots = false;
        if ( ! empty( $job_id ) ) {
            $screenshots_data = QAProof_API_Client::get_job_screenshots( $job_id );
            if ( ! is_wp_error( $screenshots_data ) && ! empty( $screenshots_data['screenshots'] ) ) {
                $result['screenshots'] = $screenshots_data['screenshots'];
                $has_screenshots = true;
                qaproof_debug_log( sprintf(
                    '[QAProof] ajax_save_history: screenshots fetched server-side — viewports=%s',
                    implode( ',', array_keys( $screenshots_data['screenshots'] ) )
                ) );
            } else {
                $err = is_wp_error( $screenshots_data ) ? $screenshots_data->get_error_message() : 'empty response';
                qaproof_debug_log( '[QAProof] ajax_save_history: screenshots fetch failed — ' . $err );
            }
        }

        $save_data = array_merge(
            [ 'test_type' => $test_type, 'page_url' => $page_url, 'job_id' => $job_id ?: null ],
            $result
        );

        $saved = QAProof_API_Client::history_save( $save_data );

        if ( is_wp_error( $saved ) ) {
            $err_msg = $saved->get_error_message();
            qaproof_debug_log( '[QAProof] ajax_save_history: API save failed — ' . $err_msg . ' jobId=' . ( $job_id ?: '(none)' ) );
            /* translators: %s: error message from the API */
            wp_send_json_error( [ 'message' => sprintf( __( 'Failed to save history: %s', 'qaproof' ), $err_msg ) ] );
        }

        $saved_id = isset( $saved['id'] ) ? $saved['id'] : null;
        qaproof_debug_log( '[QAProof] ajax_save_history: record saved id=' . ( $saved_id ?: '?' ) . ' jobId=' . ( $job_id ?: '(none)' ) . ' testType=' . $test_type );

        wp_send_json_success( [ 'saved' => true, 'id' => $saved_id, 'hasScreenshots' => $has_screenshots ] );
    }

    /**
     * Recursively sanitize a decoded history payload. Strings become text-safe;
     * known `data:image/...` base64 fields are validated and passed through
     * (raw bytes never appear in HTML); integers/floats/bools/null are kept.
     */
    private static function sanitize_history_payload( $value ) {
        if ( is_array( $value ) ) {
            $out = [];
            foreach ( $value as $k => $v ) {
                $key = is_string( $k ) ? sanitize_key( $k ) : $k;
                $out[ $key ] = self::sanitize_history_payload( $v );
            }
            return $out;
        }
        if ( is_string( $value ) ) {
            // Pass data-URI images through after a strict format + size check.
            if ( strncmp( $value, 'data:image/', 11 ) === 0 ) {
                return self::sanitize_data_uri_image( $value );
            }
            return sanitize_textarea_field( $value );
        }
        if ( is_int( $value ) || is_float( $value ) || is_bool( $value ) || $value === null ) {
            return $value;
        }
        return null;
    }

    /**
     * Accept only well-formed image data URIs up to 8 MB; otherwise drop.
     */
    private static function sanitize_data_uri_image( $value ) {
        if ( ! preg_match( '#^data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$#', $value ) ) {
            return '';
        }
        if ( strlen( $value ) > 8 * 1024 * 1024 ) {
            return '';
        }
        return $value;
    }
}
