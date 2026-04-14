<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_REST_Designs {

    public static function handle_figma_preview( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        $figma_url     = isset( $params['figmaUrl'] )     ? sanitize_url( $params['figmaUrl'] )           : '';
        $figma_token   = isset( $params['figmaToken'] )   ? sanitize_text_field( $params['figmaToken'] ) : '';
        $force_refresh = ! empty( $params['forceRefresh'] );

        if ( empty( $figma_url ) || empty( $figma_token ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Figma URL and Token are required.', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::preview_figma( $figma_url, $figma_token, $force_refresh );

        if ( is_wp_error( $result ) ) {
            $status = 502;
            $data   = $result->get_error_data();
            if ( is_array( $data ) && isset( $data['status'] ) ) {
                $status = (int) $data['status'];
            }

            $error_code = is_array( $data ) && isset( $data['error_code'] ) ? $data['error_code'] : 'API_ERROR';

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

    /**
     * Save a fetched Figma image to a saved design entry.
     * This allows reusing the image without re-calling the Figma API.
     */
    public static function handle_save_design_image( WP_REST_Request $request ) {
        $params    = $request->get_json_params();
        $design_id = isset( $params['designId'] )   ? sanitize_text_field( $params['designId'] )   : '';
        $image_b64 = isset( $params['imageBase64'] ) ? $params['imageBase64']                       : '';

        if ( empty( $design_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Design ID is required.', 'qaproof' ) ],
            ], 400 );
        }

        if ( empty( $image_b64 ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Image data is required.', 'qaproof' ) ],
            ], 400 );
        }

        // Validate it looks like a data URL
        if ( strpos( $image_b64, 'data:image/' ) !== 0 ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Invalid image data format.', 'qaproof' ) ],
            ], 400 );
        }

        $updated = QAProof_Settings::update_saved_design_image( $design_id, $image_b64 );

        if ( ! $updated ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Saved design not found.', 'qaproof' ) ],
            ], 404 );
        }

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    /**
     * Get a saved design's cached image.
     */
    public static function handle_get_design_image( WP_REST_Request $request ) {
        $design_id = sanitize_text_field( $request['id'] );
        $designs   = QAProof_Settings::get_saved_designs();

        foreach ( $designs as $d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                if ( ! empty( $d['imageBase64'] ) ) {
                    return new WP_REST_Response( [
                        'success'     => true,
                        'imageBase64' => $d['imageBase64'],
                    ], 200 );
                }
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => __( 'No saved image for this design.', 'qaproof' ) ],
                ], 404 );
            }
        }

        return new WP_REST_Response( [
            'success' => false,
            'error'   => [ 'message' => __( 'Design not found.', 'qaproof' ) ],
        ], 404 );
    }

    /**
     * Save detected elements for a saved design.
     */
    public static function handle_save_design_elements( WP_REST_Request $request ) {
        $params    = $request->get_json_params();
        $design_id = isset( $params['designId'] ) ? sanitize_text_field( $params['designId'] ) : '';
        $elements  = isset( $params['elements'] ) ? $params['elements']                        : [];
        $source    = isset( $params['source'] )   ? sanitize_text_field( $params['source'] )   : '';

        if ( empty( $design_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Design ID is required.', 'qaproof' ) ],
            ], 400 );
        }

        if ( empty( $elements ) || ! is_array( $elements ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Elements data is required.', 'qaproof' ) ],
            ], 400 );
        }

        $updated = QAProof_Settings::update_saved_design_elements( $design_id, $elements, $source );

        if ( ! $updated ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Saved design not found.', 'qaproof' ) ],
            ], 404 );
        }

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    /**
     * Get cached detected elements for a saved design.
     */
    public static function handle_get_design_elements( WP_REST_Request $request ) {
        $design_id = sanitize_text_field( $request['id'] );
        $designs   = QAProof_Settings::get_saved_designs();

        foreach ( $designs as $d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                if ( ! empty( $d['elementsJson'] ) ) {
                    $elements = json_decode( $d['elementsJson'], true );
                    return new WP_REST_Response( [
                        'success'  => true,
                        'elements' => is_array( $elements ) ? $elements : [],
                        'source'   => isset( $d['elementsSource'] ) ? $d['elementsSource'] : '',
                    ], 200 );
                }
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => __( 'No saved elements for this design.', 'qaproof' ) ],
                ], 404 );
            }
        }

        return new WP_REST_Response( [
            'success' => false,
            'error'   => [ 'message' => __( 'Design not found.', 'qaproof' ) ],
        ], 404 );
    }

    /**
     * Handle detect-elements REST request.
     */
    public static function handle_detect_elements( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        // Extract all supported design source params
        $api_params = array();

        // Figma
        if ( ! empty( $params['figmaUrl'] ) )         $api_params['figmaUrl']         = sanitize_url( $params['figmaUrl'] );
        if ( ! empty( $params['figmaToken'] ) )       $api_params['figmaToken']       = sanitize_text_field( $params['figmaToken'] );
        if ( ! empty( $params['figmaImageBase64'] ) ) $api_params['figmaImageBase64'] = $params['figmaImageBase64'];

        // Sketch
        if ( ! empty( $params['sketchFileBase64'] ) ) $api_params['sketchFileBase64'] = $params['sketchFileBase64'];

        // Pixel-perfect flag — disables AI vision fallback on the API side.
        if ( ! empty( $params['pixelPerfectOnly'] ) ) $api_params['pixelPerfectOnly'] = true;

        // Validate: at least one source
        $has_source = ! empty( $api_params['figmaUrl'] )
            || ! empty( $api_params['figmaImageBase64'] )
            || ! empty( $api_params['sketchFileBase64'] );

        if ( ! $has_source ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'A design source is required (Figma URL or uploaded image).', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::detect_elements( $api_params );

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

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }
}
