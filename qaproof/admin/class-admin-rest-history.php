<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_History {

    public static function handle_list_test_history( WP_REST_Request $request ) {
        $test_type    = $request->get_param( 'test_type' ) ?: '';
        $exclude_type = $request->get_param( 'exclude_type' ) ?: '';
        $limit        = $request->get_param( 'limit' ) ? (int) $request->get_param( 'limit' ) : 50;
        $offset       = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        $items = QAProof_Test_History::get_all( [
            'test_type'    => $test_type,
            'exclude_type' => $exclude_type,
            'limit'        => $limit,
            'offset'       => $offset,
        ] );
        $total = QAProof_Test_History::count( $test_type, $exclude_type );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $items,
            'total'   => $total,
        ], 200 );
    }

    public static function handle_get_test_history( WP_REST_Request $request ) {
        $item = QAProof_Test_History::get( (int) $request['id'] );
        if ( ! $item ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Test not found.', 'qaproof' ) ],
            ], 404 );
        }
        return new WP_REST_Response( [ 'success' => true, 'data' => $item ], 200 );
    }

    public static function handle_delete_test_history( WP_REST_Request $request ) {
        $item = QAProof_Test_History::get( (int) $request['id'] );
        if ( ! $item ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Test not found.', 'qaproof' ) ],
            ], 404 );
        }
        QAProof_Test_History::delete( (int) $request['id'] );
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
