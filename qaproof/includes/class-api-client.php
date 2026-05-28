<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_API_Client {

    const TIMEOUT          = 30;
    const BASELINE_TIMEOUT = 300; // Baseline capture is synchronous and can run 60–180s on complex pages.

    /**
     * Hook http_request_args to add a plugin-identifying User-Agent on outbound
     * requests targeting api.qaproof.io (other hosts are untouched).
     */
    public static function register_user_agent_filter() {
        add_filter( 'http_request_args', [ __CLASS__, 'inject_user_agent' ], 10, 2 );
    }

    public static function inject_user_agent( $args, $url ) {
        $api_origin = wp_parse_url( QAProof_Settings::get_api_endpoint(), PHP_URL_HOST );
        $req_origin = wp_parse_url( (string) $url, PHP_URL_HOST );
        if ( ! $api_origin || ! $req_origin || $api_origin !== $req_origin ) {
            return $args;
        }
        $ua = sprintf(
            'QAProof-WordPress/%s (WordPress/%s; PHP/%s)',
            QAPROOF_VERSION,
            get_bloginfo( 'version' ),
            PHP_VERSION
        );
        if ( empty( $args['headers'] ) || ! is_array( $args['headers'] ) ) {
            $args['headers'] = [];
        }
        $args['headers']['User-Agent'] = $ua;
        return $args;
    }

    /**
     * Submit a test job. Async — returns { jobId, status }; use poll_job() to fetch results.
     *
     * @param  array $params Test parameters (pageUrl, testType, etc.)
     * @return array|WP_Error
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
            'httpversion' => '1.1',
        ]);

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf(
                    /* translators: %s: error message */
                    __( 'Could not reach the API: %s', 'qaproof' ),
                    $response->get_error_message()
                )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $body        = wp_remote_retrieve_body( $response );
        $decoded     = json_decode( $body, true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
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
     * Poll a job. Returns { id, status, result?, error?, elapsed? }.
     *
     * @param  string $job_id
     * @return array|WP_Error
     */
    public static function poll_job( $job_id ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/jobs/' . sanitize_text_field( $job_id );
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        $response = wp_remote_get( $endpoint, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'timeout'   => 15,
            'sslverify' => true,
        ]);

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code === 404 ) {
            return new WP_Error( 'qaproof_job_not_found', __( 'Job not found or expired.', 'qaproof' ) );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg );
        }

        return $decoded['data'];
    }

    /**
     * Fetch screenshots for a completed job. Separate from poll() to keep the
     * poll payload small.
     *
     * @param  string $job_id
     * @return array|WP_Error
     */
    public static function get_job_screenshots( $job_id ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/jobs/' . sanitize_text_field( $job_id ) . '/screenshots';
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        // Screenshots can be multi-MB base64 (a tall full-page capture decodes to
        // ~30 MB JSON). Bumping memory only for THIS call, never globally.
        //
        // We prefer wp_raise_memory_limit() over a direct ini_set() because:
        //   1. It respects the WP_MAX_MEMORY_LIMIT constant a hoster may set.
        //   2. It runs the `image_memory_limit` filter so other plugins can vote.
        //   3. It's the documented, Plugin-Check-blessed way to bump memory
        //      for a single image-heavy operation.
        // The 'image' context maps to WP_MAX_MEMORY_LIMIT, typically 256M.
        wp_raise_memory_limit( 'image' );

        $response = wp_remote_get( $endpoint, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'timeout'   => 120,
            'sslverify' => true,
        ]);

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not fetch screenshots: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'Screenshots response invalid (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg );
        }

        return $decoded['data'];
    }

    /**
     * Cancel an in-flight job. Fire-and-forget from the WP UI side — the API
     * marks the job 'cancelled' and the runner aborts at the next stage gate
     * so no quota is charged for the discarded work. Returns the API
     * response payload on success (status + cancelled flag) so the WP UI
     * can log the outcome; non-2xx becomes a WP_Error.
     *
     * Uses a short timeout because this is best-effort during unload.
     *
     * @param  string $job_id
     * @return array|WP_Error
     */
    public static function cancel_job( $job_id ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/jobs/' . sanitize_text_field( $job_id );
        $api_key  = QAProof_Settings::get_api_key();
        if ( empty( $api_key ) ) {
            return new WP_Error( 'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }
        $response = wp_remote_request( $endpoint, [
            'method'    => 'DELETE',
            'headers'   => [ 'Authorization' => 'Bearer ' . $api_key ],
            'timeout'   => 5,
            'sslverify' => true,
        ]);
        if ( is_wp_error( $response ) ) {
            return new WP_Error( 'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Cancel failed: %s', 'qaproof' ), $response->get_error_message() )
            );
        }
        $status  = wp_remote_retrieve_response_code( $response );
        $decoded = json_decode( wp_remote_retrieve_body( $response ), true );
        // 404 or 409 (already done / not found) — treat as success so the
        // unload handler never raises noise the user can't see.
        if ( in_array( $status, [ 200, 404, 409 ], true ) ) {
            return is_array( $decoded ) && isset( $decoded['data'] ) ? $decoded['data'] : [ 'status' => 'unknown' ];
        }
        $msg = isset( $decoded['error']['message'] )
            ? $decoded['error']['message']
            /* translators: %d: HTTP status code */
            : sprintf( __( 'Cancel returned HTTP %d', 'qaproof' ), $status );
        return new WP_Error( 'qaproof_api_error', $msg );
    }

    /**
     * Create a baseline screenshot. Synchronous on the API side; uses BASELINE_TIMEOUT.
     *
     * @param  string $page_url
     * @param  bool   $force_capture
     * @return array|WP_Error
     */
    public static function create_baseline( $page_url, $force_capture = false ) {
        $body = array( 'pageUrl' => $page_url );
        if ( $force_capture ) {
            $body['forceCapture'] = true;
        }
        return self::api_request( 'POST', '/api/baselines', $body, self::BASELINE_TIMEOUT );
    }

    public static function get_baseline( $key ) {
        return self::api_request( 'GET', '/api/baselines/' . $key );
    }

    public static function delete_baseline( $key ) {
        return self::api_request( 'DELETE', '/api/baselines/' . $key );
    }

    public static function list_baselines() {
        return self::api_request( 'GET', '/api/baselines' );
    }

    /**
     * @param  string     $method  HTTP method.
     * @param  string     $path    API path.
     * @param  array|null $body    Optional request body.
     * @param  int        $timeout Seconds.
     * @return array|WP_Error
     */
    private static function api_request( $method, $path, $body = null, $timeout = self::TIMEOUT ) {
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
            'timeout'   => $timeout,
            'sslverify' => true,
        );

        if ( $body !== null ) {
            $args['body'] = wp_json_encode( $body );
        }

        $response = wp_remote_request( $endpoint, $args );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        $is_success_code = ( $status_code === 200 || $status_code === 201 );

        if ( ! $is_success_code || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            $err_data = array( 'status' => $status_code );
            if ( isset( $decoded['error']['code'] ) ) {
                $err_data['error_code'] = $decoded['error']['code'];
            }
            if ( isset( $decoded['error']['retryAt'] ) ) {
                $err_data['retry_at'] = (int) $decoded['error']['retryAt'];
            }
            return new WP_Error( 'qaproof_api_error', $error_msg, $err_data );
        }

        return $decoded['data'];
    }

    /**
     * Fetch a Figma design preview image via the API. 120s timeout to absorb
     * Figma rate-limit retries on the backend.
     *
     * @param  string $figma_url
     * @param  bool   $force_refresh Bypass server-side cache.
     * @return array|WP_Error
     */
    public static function preview_figma( $figma_url, $force_refresh = false ) {
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
                'forceRefresh' => $force_refresh ? true : null,
            ) ) ),
            'timeout'   => 120,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            $error_code = isset( $decoded['error']['code'] )
                ? $decoded['error']['code']
                : 'API_ERROR';

            $err_data = array(
                'status'     => $status_code,
                'error_code' => $error_code,
            );
            if ( isset( $decoded['error']['retryAt'] ) ) {
                $err_data['retry_at'] = (int) $decoded['error']['retryAt'];
            }

            return new WP_Error( 'qaproof_figma_error', $error_msg, $err_data );
        }

        return $decoded['data'];
    }

    /**
     * Verify the API can read a Figma file. Returns
     * { accessible: true, name, lastModified } or a WP_Error with one of
     * FIGMA_NOT_SHARED / FIGMA_FILE_NOT_FOUND / etc.
     *
     * @param  string $figma_url
     * @return array|WP_Error
     */
    public static function verify_figma_access( $figma_url ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/figma/verify-access';
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Go to Settings to add your API key.', 'qaproof' )
            );
        }

        $response = wp_remote_post( $endpoint, array(
            'headers'   => array(
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body'      => wp_json_encode( array( 'figmaUrl' => $figma_url ) ),
            'timeout'   => 30,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error(
                'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            /* translators: %d: HTTP status code */
            $error_msg  = isset( $decoded['error']['message'] ) ? $decoded['error']['message'] : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            $error_code = isset( $decoded['error']['code'] )    ? $decoded['error']['code']    : 'API_ERROR';
            return new WP_Error( 'qaproof_figma_verify_error', $error_msg, array(
                'status'     => $status_code,
                'error_code' => $error_code,
            ) );
        }

        return $decoded['data'];
    }

    /**
     * Detect UI elements/sections in a design image.
     *
     * @param  array $params figmaUrl|figmaImageBase64|sketchFileBase64|pixelPerfectOnly.
     * @return array|WP_Error
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

        $body = array();
        $allowed_keys = array( 'figmaUrl', 'figmaImageBase64', 'sketchFileBase64' );
        foreach ( $allowed_keys as $key ) {
            if ( ! empty( $params[ $key ] ) ) {
                $body[ $key ] = $params[ $key ];
            }
        }
        // pixelPerfectOnly disables the AI-vision fallback when Figma API fails.
        if ( ! empty( $params['pixelPerfectOnly'] ) ) {
            $body['pixelPerfectOnly'] = true;
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
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            $err_data = array( 'status' => $status_code );
            if ( isset( $decoded['error']['code'] ) ) {
                $err_data['error_code'] = $decoded['error']['code'];
            }
            if ( isset( $decoded['error']['retryAt'] ) ) {
                $err_data['retry_at'] = (int) $decoded['error']['retryAt'];
            }
            return new WP_Error( 'qaproof_api_error', $error_msg, $err_data );
        }

        return $decoded['data'];
    }

    /**
     * GET /api/me — returns user + plan + limits for the configured API key.
     *
     * @param  string|null $api_key Optional key override; falls back to saved option.
     * @return array|WP_Error
     */
    public static function get_account_info( $api_key = null ) {
        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/me';
        $api_key  = $api_key !== null ? $api_key : QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured.', 'qaproof' )
            );
        }

        $response = wp_remote_get( $endpoint, [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'timeout'   => 10,
            'sslverify' => true,
        ]);

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned invalid response (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code === 401 ) {
            return new WP_Error( 'qaproof_auth_error',
                __( 'Invalid API key. Please check your key in Settings.', 'qaproof' )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $error_msg );
        }

        return $decoded['data'];
    }

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
                /* translators: %d: HTTP status code */
                sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code )
            );
        }

        $body    = wp_remote_retrieve_body( $response );
        $decoded = json_decode( $body, true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_health_invalid_json',
                __( 'API returned invalid JSON.', 'qaproof' )
            );
        }

        return $decoded;
    }

    // ── Monitors ──────────────────────────────────────────────────────────────

    /**
     * Normalize a monitor row from the API. Defaults missing booleans to off
     * so a malformed row never silently enables notifications.
     */
    private static function normalize_monitor( $m ) {
        $m['is_enabled']   = isset( $m['is_enabled'] )   ? (int) $m['is_enabled']   : 1;
        $m['has_baseline'] = isset( $m['has_baseline'] ) ? (int) $m['has_baseline'] : 0;
        $m['notify_email'] = isset( $m['notify_email_enabled'] ) ? (int) $m['notify_email_enabled'] : 0;
        $m['notify_admin'] = isset( $m['notify_admin_enabled'] ) ? (int) $m['notify_admin_enabled'] : 0;
        return $m;
    }

    /**
     * Normalize a monitor result row, expanding the result JSONB column into
     * the *_json fields the WP frontend reads.
     */
    private static function normalize_result( $r ) {
        if ( isset( $r['run_at'] ) && ! isset( $r['run_date'] ) ) {
            $r['run_date'] = $r['run_at'];
        }

        $result_data = [];
        if ( ! empty( $r['result'] ) ) {
            if ( is_array( $r['result'] ) ) {
                $result_data = $r['result'];
            } elseif ( is_string( $r['result'] ) ) {
                $decoded     = json_decode( $r['result'], true );
                $result_data = is_array( $decoded ) ? $decoded : [];
            }
        }

        if ( ! isset( $r['categories_json'] ) ) {
            $cats = isset( $result_data['categories'] ) ? $result_data['categories'] : null;
            $r['categories_json'] = $cats !== null ? wp_json_encode( $cats ) : null;
        }
        if ( ! isset( $r['differences_json'] ) ) {
            $diffs = isset( $result_data['differences'] ) ? $result_data['differences'] : null;
            $r['differences_json'] = $diffs !== null ? wp_json_encode( $diffs ) : null;
        }
        if ( ! isset( $r['recommendations_json'] ) ) {
            $recs = isset( $result_data['recommendations'] ) ? $result_data['recommendations'] : null;
            $r['recommendations_json'] = $recs !== null ? wp_json_encode( $recs ) : null;
        }

        if ( ! isset( $r['screenshots_json'] ) ) {
            $ss = isset( $r['screenshots'] ) ? $r['screenshots'] : null;
            $r['screenshots_json'] = $ss !== null
                ? ( is_string( $ss ) ? $ss : wp_json_encode( $ss ) )
                : null;
        }

        $r['has_changes'] = isset( $r['has_changes'] ) ? (int) $r['has_changes'] : 0;

        return $r;
    }

    private static function normalize_history( $h ) {
        $result_data = [];
        if ( ! empty( $h['result'] ) ) {
            if ( is_array( $h['result'] ) ) {
                $result_data = $h['result'];
            } elseif ( is_string( $h['result'] ) ) {
                $decoded     = json_decode( $h['result'], true );
                $result_data = is_array( $decoded ) ? $decoded : [];
            }
        }

        if ( ! isset( $h['categories_json'] ) ) {
            $cats = isset( $result_data['categories'] ) ? $result_data['categories'] : null;
            $h['categories_json'] = $cats !== null ? wp_json_encode( $cats ) : null;
        }
        if ( ! isset( $h['differences_json'] ) ) {
            $diffs = isset( $result_data['differences'] ) ? $result_data['differences'] : null;
            $h['differences_json'] = $diffs !== null ? wp_json_encode( $diffs ) : null;
        }
        if ( ! isset( $h['recommendations_json'] ) ) {
            $recs = isset( $result_data['recommendations'] ) ? $result_data['recommendations'] : null;
            $h['recommendations_json'] = $recs !== null ? wp_json_encode( $recs ) : null;
        }

        if ( ! isset( $h['screenshots_json'] ) ) {
            $ss = isset( $h['screenshots'] ) ? $h['screenshots'] : null;
            $h['screenshots_json'] = $ss !== null
                ? ( is_string( $ss ) ? $ss : wp_json_encode( $ss ) )
                : null;
        }

        if ( ! isset( $h['extracted_data_json'] ) ) {
            $extracted = isset( $result_data['extractedData'] ) ? $result_data['extractedData'] : null;
            $h['extracted_data_json'] = $extracted !== null ? wp_json_encode( $extracted ) : null;
        }

        return $h;
    }

    public static function monitors_list() {
        $result = self::api_request( 'GET', '/api/monitors' );
        if ( is_wp_error( $result ) ) return $result;
        return array_map( [ __CLASS__, 'normalize_monitor' ], (array) $result );
    }

    /** @param string $schedule 'daily'|'weekly'|'monthly' */
    public static function monitors_list_due( $schedule ) {
        $path   = '/api/monitors?schedule=' . rawurlencode( $schedule ) . '&due=1';
        $result = self::api_request( 'GET', $path );
        if ( is_wp_error( $result ) ) return $result;
        return array_map( [ __CLASS__, 'normalize_monitor' ], (array) $result );
    }

    public static function monitors_get( $id ) {
        $result = self::api_request( 'GET', '/api/monitors/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_monitor( $result );
    }

    public static function monitors_create( $data ) {
        $payload = array(
            'page_url'              => isset( $data['page_url'] )        ? $data['page_url']        : '',
            'schedule'              => isset( $data['schedule'] )        ? $data['schedule']        : 'daily',
            'is_enabled'            => isset( $data['is_enabled'] )      ? (bool) $data['is_enabled'] : true,
            'notify_email_enabled'  => isset( $data['notify_email'] )    ? (bool) $data['notify_email'] : true,
            'notify_admin_enabled'  => isset( $data['notify_admin'] )    ? (bool) $data['notify_admin'] : true,
            'notify_on'             => isset( $data['notify_on'] )       ? $data['notify_on']       : 'failures',
            'threshold_score'       => isset( $data['threshold_score'] ) ? (int) $data['threshold_score'] : 90,
        );
        if ( ! empty( $data['scheduled_at'] ) ) {
            $payload['scheduled_at'] = $data['scheduled_at'];
        }

        $result = self::api_request( 'POST', '/api/monitors', $payload, self::BASELINE_TIMEOUT );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_monitor( $result );
    }

    public static function monitors_update( $id, $data ) {
        $payload = array();

        $direct_fields = array(
            'page_url', 'schedule', 'baseline_key', 'scheduled_at',
            'last_run_at', 'last_score', 'threshold_score', 'notify_on',
        );
        foreach ( $direct_fields as $field ) {
            if ( array_key_exists( $field, $data ) ) {
                $payload[ $field ] = $data[ $field ];
            }
        }

        if ( array_key_exists( 'is_enabled', $data ) ) {
            $payload['is_enabled'] = (bool) $data['is_enabled'];
        }
        if ( array_key_exists( 'has_baseline', $data ) ) {
            $payload['has_baseline'] = (bool) $data['has_baseline'];
        }
        if ( array_key_exists( 'notify_email', $data ) ) {
            $payload['notify_email_enabled'] = (bool) $data['notify_email'];
        }
        if ( array_key_exists( 'notify_admin', $data ) ) {
            $payload['notify_admin_enabled'] = (bool) $data['notify_admin'];
        }

        if ( empty( $payload ) ) {
            return new WP_Error( 'qaproof_no_data', __( 'No fields to update.', 'qaproof' ) );
        }

        $result = self::api_request( 'PUT', '/api/monitors/' . rawurlencode( $id ), $payload );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_monitor( $result );
    }

    public static function monitors_delete( $id ) {
        $result = self::api_request( 'DELETE', '/api/monitors/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    public static function monitors_get_results( $id, $args = array() ) {
        $limit  = isset( $args['limit'] )  ? (int) $args['limit']  : 20;
        $offset = isset( $args['offset'] ) ? (int) $args['offset'] : 0;
        $path   = '/api/monitors/' . rawurlencode( $id ) . '/results?limit=' . $limit . '&offset=' . $offset;

        $endpoint = QAProof_Settings::get_api_endpoint() . $path;
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error( 'qaproof_no_api_key', __( 'API key not configured.', 'qaproof' ) );
        }

        $response = wp_remote_get( $endpoint, array(
            'headers'   => array( 'Authorization' => 'Bearer ' . $api_key ),
            'timeout'   => self::TIMEOUT,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error( 'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null || $status_code !== 200 || empty( $decoded['success'] ) ) {
            $msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $msg );
        }

        $rows = array_map( [ __CLASS__, 'normalize_result' ], (array) $decoded['data'] );
        return array( 'data' => $rows, 'total' => isset( $decoded['total'] ) ? (int) $decoded['total'] : count( $rows ) );
    }

    public static function monitors_save_result( $monitor_id, $data ) {
        $payload = array(
            'score'         => isset( $data['score'] )         ? (int) $data['score']         : null,
            'has_changes'   => isset( $data['has_changes'] )   ? (bool) $data['has_changes']   : null,
            'status'        => isset( $data['status'] )        ? $data['status']               : 'completed',
            'summary'       => isset( $data['summary'] )       ? $data['summary']              : null,
            'error_message' => isset( $data['error_message'] ) ? $data['error_message']        : null,
        );

        $result_obj = array();
        if ( isset( $data['categories'] ) )      { $result_obj['categories']      = $data['categories']; }
        if ( isset( $data['differences'] ) )     { $result_obj['differences']     = $data['differences']; }
        if ( isset( $data['recommendations'] ) ) { $result_obj['recommendations'] = $data['recommendations']; }
        if ( ! empty( $result_obj ) ) {
            $payload['result'] = $result_obj;
        }

        if ( ! empty( $data['screenshots'] ) ) {
            $payload['screenshots'] = $data['screenshots'];
        }

        // Result payload can include 2–5 MB of base64 screenshots.
        $result = self::api_request(
            'POST',
            '/api/monitors/' . rawurlencode( $monitor_id ) . '/results',
            $payload,
            self::BASELINE_TIMEOUT
        );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_result( $result );
    }

    public static function monitors_approve_result( $result_id ) {
        $result = self::api_request( 'PUT', '/api/results/' . rawurlencode( $result_id ) . '/approve' );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    /**
     * Attach screenshots to an already-saved monitor result.
     *
     * Called by the background cron `qaproof_fetch_monitor_screenshots` after
     * the main result row was saved without screenshots so the UI could show the
     * score immediately. Screenshots are fetched server-to-server separately and
     * then patched onto the existing row via this endpoint.
     *
     * @param string $result_id  Monitor result UUID.
     * @param array  $screenshots  Associative array of viewport => base64 data-URI.
     * @return true|WP_Error
     */
    public static function monitors_update_result_screenshots( $result_id, $screenshots ) {
        $result = self::api_request(
            'PATCH',
            '/api/results/' . rawurlencode( $result_id ) . '/screenshots',
            array( 'screenshots' => $screenshots ),
            self::BASELINE_TIMEOUT
        );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    // ── Test History ──────────────────────────────────────────────────────────

    public static function history_list( $args = array() ) {
        $params = array();
        if ( ! empty( $args['test_type'] ) )    { $params[] = 'test_type='    . rawurlencode( $args['test_type'] ); }
        if ( ! empty( $args['exclude_type'] ) ) { $params[] = 'exclude_type=' . rawurlencode( $args['exclude_type'] ); }
        $limit  = isset( $args['limit'] )  ? (int) $args['limit']  : 50;
        $offset = isset( $args['offset'] ) ? (int) $args['offset'] : 0;
        $params[] = 'limit='  . $limit;
        $params[] = 'offset=' . $offset;

        $path     = '/api/history?' . implode( '&', $params );
        $endpoint = QAProof_Settings::get_api_endpoint() . $path;
        $api_key  = QAProof_Settings::get_api_key();

        if ( empty( $api_key ) ) {
            return new WP_Error( 'qaproof_no_api_key', __( 'API key not configured.', 'qaproof' ) );
        }

        $response = wp_remote_get( $endpoint, array(
            'headers'   => array( 'Authorization' => 'Bearer ' . $api_key ),
            'timeout'   => self::TIMEOUT,
            'sslverify' => true,
        ) );

        if ( is_wp_error( $response ) ) {
            return new WP_Error( 'qaproof_api_network_error',
                /* translators: %s: error message */
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null || $status_code !== 200 || empty( $decoded['success'] ) ) {
            $msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $msg );
        }

        $rows = array_map( [ __CLASS__, 'normalize_history' ], (array) $decoded['data'] );
        return array( 'data' => $rows, 'total' => isset( $decoded['total'] ) ? (int) $decoded['total'] : count( $rows ) );
    }

    public static function history_get( $id ) {
        $result = self::api_request( 'GET', '/api/history/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_history( $result );
    }

    public static function history_save( $data ) {
        $result_obj = array();
        $copy_keys  = array( 'categories', 'differences', 'recommendations' );
        foreach ( $copy_keys as $key ) {
            if ( isset( $data[ $key ] ) ) { $result_obj[ $key ] = $data[ $key ]; }
        }
        // Pass-through flags that change which result UI is rendered when the
        // history entry is opened later. Without these the JS render path falls
        // through to the generic score layout — for a mismatch result that
        // means an empty "—/100" ring and a misleading "No analysis data
        // available" warning instead of the mismatch recovery panel.
        // Element-mode failures (`elementTest: true, matched: false`) have the
        // same property: the render path branches on these flags. Anything
        // that controls a branch in renderFidelityResults() belongs here.
        $passthrough_flags = array(
            'mismatch', 'designSite', 'liveSite',
            'elementTest', 'matched',
            'freshnessCheckFailed', 'scoreRecomputed',
            'parseFailed',
        );
        foreach ( $passthrough_flags as $key ) {
            if ( isset( $data[ $key ] ) ) { $result_obj[ $key ] = $data[ $key ]; }
        }
        if ( isset( $data['designSystem'] ) )    { $result_obj['extractedData']['designSystem']    = $data['designSystem']; }
        if ( isset( $data['components'] ) )      { $result_obj['extractedData']['components']      = $data['components']; }
        if ( isset( $data['designDebtScore'] ) ) { $result_obj['extractedData']['designDebtScore'] = $data['designDebtScore']; }
        if ( isset( $data['targetWcagLevel'] ) ) { $result_obj['extractedData']['wcagLevel']       = $data['targetWcagLevel']; }

        $payload = array(
            'test_type'   => isset( $data['test_type'] )  ? $data['test_type']       : '',
            'page_url'    => isset( $data['page_url'] )   ? $data['page_url']        : '',
            'score'       => isset( $data['score'] )      ? (int) $data['score']     : null,
            'summary'     => isset( $data['summary'] )    ? $data['summary']         : null,
            'job_id'      => isset( $data['job_id'] )     ? $data['job_id']          : null,
        );
        if ( ! empty( $result_obj ) ) { $payload['result'] = $result_obj; }
        if ( ! empty( $data['screenshots'] ) ) { $payload['screenshots'] = $data['screenshots']; }

        // History payload can include 2–5 MB of base64 screenshots.
        $result = self::api_request( 'POST', '/api/history', $payload, self::BASELINE_TIMEOUT );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_history( $result );
    }

    public static function history_delete( $id ) {
        $result = self::api_request( 'DELETE', '/api/history/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    public static function history_stats( $threshold = 70 ) {
        $path   = '/api/history/stats?threshold=' . (int) $threshold;
        $result = self::api_request( 'GET', $path );
        if ( is_wp_error( $result ) ) return $result;
        return $result;
    }

    /**
     * Send a PDF report via the SaaS API (SES).
     *
     * @param  array $params { pdfBase64, to, fileName, testType, pageUrl, score }
     * @return array|WP_Error
     */
    public static function send_report_email( $params ) {
        return self::api_request( 'POST', '/api/send-report-email', $params, 60 );
    }

    // ── Figma OAuth ───────────────────────────────────────────────────────────

    /** @return array|WP_Error { authorizeUrl } */
    public static function figma_oauth_start() {
        return self::api_request( 'POST', '/api/figma-oauth/start', array(), 60 );
    }

    /** @return array|WP_Error { connected, revoked, figmaUserEmail, ... } */
    public static function figma_oauth_status() {
        return self::api_request( 'GET', '/api/figma-oauth/status' );
    }

    /** @return array|WP_Error { deleted: bool } */
    public static function figma_oauth_disconnect() {
        return self::api_request( 'POST', '/api/figma-oauth/disconnect', array() );
    }

    /**
     * Submit a "How was this test?" rating to the SaaS.
     *
     * Blocking — the caller (the REST handler) needs to surface success or
     * failure to the user. 5-second timeout bounds the worst-case wait; the
     * endpoint is a single INSERT on the SaaS side so it normally returns in
     * <100 ms.
     *
     * Feedback is stored only on the SaaS; the WP install keeps no copy.
     *
     * @param array $payload  Validated/sanitised by the REST handler.
     * @return array|WP_Error Success array `[ 'success' => true ]`, or
     *                        WP_Error with a translatable user-visible
     *                        message on failure (no API key, network error,
     *                        non-2xx response).
     */
    public static function submit_feedback( $payload ) {
        $api_key = QAProof_Settings::get_api_key();
        if ( empty( $api_key ) ) {
            return new WP_Error(
                'qaproof_no_api_key',
                __( 'API key not configured. Add your key in Settings → API before submitting feedback.', 'qaproof' )
            );
        }

        $endpoint = QAProof_Settings::get_api_endpoint() . '/api/feedback';
        $response = wp_remote_post( $endpoint, [
            'headers' => [
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'body'        => wp_json_encode( $payload ),
            'timeout'     => 5,
            'sslverify'   => true,
            'httpversion' => '1.1',
        ] );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'qaproof_api_network_error',
                sprintf(
                    /* translators: %s: low-level transport error message */
                    __( 'Could not reach the API: %s', 'qaproof' ),
                    $response->get_error_message()
                )
            );
        }

        $status = wp_remote_retrieve_response_code( $response );
        if ( $status < 200 || $status >= 300 ) {
            $body    = wp_remote_retrieve_body( $response );
            $decoded = json_decode( $body, true );
            $msg     = ( is_array( $decoded ) && ! empty( $decoded['error']['message'] ) )
                ? $decoded['error']['message']
                /* translators: %d: HTTP status code returned by the API */
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status );
            return new WP_Error( 'qaproof_api_error', $msg, [ 'status' => $status ] );
        }

        return [ 'success' => true ];
    }
}
