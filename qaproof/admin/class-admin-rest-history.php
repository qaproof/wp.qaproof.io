<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * WP REST handlers for test history.
 * All data lives in the SaaS API (PostgreSQL) — this class is a pure proxy.
 */
class QAProof_Admin_REST_History {

    public static function handle_list_test_history( WP_REST_Request $request ) {
        $test_type    = $request->get_param( 'test_type' )    ?: '';
        $exclude_type = $request->get_param( 'exclude_type' ) ?: '';
        $limit        = $request->get_param( 'limit' )  ? (int) $request->get_param( 'limit' )  : 50;
        $offset       = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        $result = QAProof_API_Client::history_list( [
            'test_type'    => $test_type,
            'exclude_type' => $exclude_type,
            'limit'        => $limit,
            'offset'       => $offset,
        ] );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result['data'],
            'total'   => $result['total'],
        ], 200 );
    }

    public static function handle_get_test_history( WP_REST_Request $request ) {
        $id   = sanitize_text_field( $request['id'] );
        $item = QAProof_API_Client::history_get( $id );

        if ( is_wp_error( $item ) ) {
            $data = $item->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $item->get_error_message() ],
            ], $http );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $item ], 200 );
    }

    public static function handle_delete_test_history( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $result = QAProof_API_Client::history_delete( $id );

        if ( is_wp_error( $result ) ) {
            $data = $result->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], $http );
        }

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
