<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_API_Client {

    const TIMEOUT          = 30;  // Short timeout — API now returns jobId immediately
    const BASELINE_TIMEOUT = 300; // Baseline creation: Playwright scroll-and-stitch can take 60-180 s on complex pages (Shopify etc.)

    /**
     * Submit a test job to the SaaS API (async — returns jobId).
     *
     * The API creates a background job and returns immediately with a jobId.
     * Use poll_job() to check status and retrieve results.
     *
     * @param array $params Test parameters (pageUrl, testType, etc.)
     * @return array|WP_Error { jobId, status } on success, WP_Error on failure.
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

            return new WP_Error( 'qaproof_api_error', $error_msg, [
                'status'     => $status_code,
                'error_code' => $error_code,
            ]);
        }

        return $decoded['data'];
    }

    /**
     * Poll a job for status and results.
     *
     * @param string $job_id The job ID returned by run_test().
     * @return array|WP_Error Job data { id, status, result?, error?, elapsed? }
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

        if ( $status_code === 404 ) {
            return new WP_Error( 'qaproof_job_not_found', __( 'Job not found or expired.', 'qaproof' ) );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg );
        }

        return $decoded['data'];
    }

    /**
     * Fetch screenshots for a completed job (separate from poll to avoid large responses).
     *
     * @param string $job_id The job ID.
     * @return array|WP_Error Screenshots data { id, screenshots: { desktop, tablet, mobile, ... } }
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

        // Screenshots response is large (multi-MB base64) — use longer timeout + more memory
        @ini_set( 'memory_limit', '256M' );

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
                sprintf( __( 'Could not fetch screenshots: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null ) {
            return new WP_Error( 'qaproof_api_invalid_json',
                sprintf( __( 'Screenshots response invalid (HTTP %d)', 'qaproof' ), $status_code )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );

            return new WP_Error( 'qaproof_api_error', $error_msg );
        }

        return $decoded['data'];
    }

    /**
     * Create a baseline screenshot via the SaaS API.
     *
     * Uses a longer timeout (300 s) because the API captures a full-page
     * Playwright screenshot synchronously before responding (complex pages like Shopify can take 2-3 min).
     *
     * @param string $page_url URL to capture as baseline.
     * @return array|WP_Error Baseline data on success, WP_Error on failure.
     */
    public static function create_baseline( $page_url ) {
        return self::api_request( 'POST', '/api/baselines', array( 'pageUrl' => $page_url ), self::BASELINE_TIMEOUT );
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
     * @param string     $method   HTTP method (GET, POST, DELETE).
     * @param string     $path     API path (e.g. '/api/baselines').
     * @param array|null $body     Request body for POST requests.
     * @param int        $timeout  cURL timeout in seconds (default: TIMEOUT = 30).
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

        // Accept both 200 (OK) and 201 (Created) as success codes
        $is_success_code = ( $status_code === 200 || $status_code === 201 );

        if ( ! $is_success_code || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
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

            $err_data = array(
                'status'     => $status_code,
                'error_code' => $error_code,
            );
            // Propagate real Figma Retry-After timestamp (ms) when present.
            if ( isset( $decoded['error']['retryAt'] ) ) {
                $err_data['retry_at'] = (int) $decoded['error']['retryAt'];
            }

            return new WP_Error( 'qaproof_figma_error', $error_msg, $err_data );
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
        // Pixel-perfect flag: when true, the API will NOT fall back to AI vision
        // if Figma API fails (e.g. rate-limited). Used by Settings auto-cache.
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
     * Fetch account info for the currently configured API key.
     * Calls GET /api/me (Bearer token auth) — returns user + plan + limits.
     *
     * @param string|null $api_key Optional key override (e.g. unsaved input value). Falls back to saved option.
     * @return array|WP_Error Account data or error.
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

        if ( $status_code === 401 ) {
            return new WP_Error( 'qaproof_auth_error',
                __( 'Invalid API key. Please check your key in Settings.', 'qaproof' )
            );
        }

        if ( $status_code !== 200 || empty( $decoded['success'] ) ) {
            $error_msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $error_msg );
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
                __( 'API returned invalid JSON.', 'qaproof' )
            );
        }

        return $decoded;
    }

    // =========================================================================
    // Monitors (remote API)
    // =========================================================================

    /**
     * Normalize a monitor row returned by the SaaS API into the shape the
     * WP plugin frontend and scheduler expect (integer booleans, snake_case fields).
     *
     * @param array $m Raw monitor row from the API.
     * @return array
     */
    private static function normalize_monitor( $m ) {
        $m['is_enabled']  = isset( $m['is_enabled'] )  ? (int) $m['is_enabled']  : 1;
        $m['has_baseline'] = isset( $m['has_baseline'] ) ? (int) $m['has_baseline'] : 0;

        // Map notify_email_enabled / notify_admin_enabled → notify_email / notify_admin
        // so existing PHP + JS code that reads these fields keeps working unchanged.
        // Fallback to 0 (off) when the key is absent — safer than silently enabling notifications.
        $m['notify_email'] = isset( $m['notify_email_enabled'] ) ? (int) $m['notify_email_enabled'] : 0;
        $m['notify_admin'] = isset( $m['notify_admin_enabled'] ) ? (int) $m['notify_admin_enabled'] : 0;

        return $m;
    }

    /**
     * Normalize a monitor result row from the API.
     * Expands the result JSONB column into the separate _json fields that the
     * WP frontend expects.
     *
     * @param array $r Raw result row from the API.
     * @return array
     */
    private static function normalize_result( $r ) {
        // Map run_at → run_date
        if ( isset( $r['run_at'] ) && ! isset( $r['run_date'] ) ) {
            $r['run_date'] = $r['run_at'];
        }

        // Expand result JSONB → separate _json columns
        $result_data = [];
        if ( ! empty( $r['result'] ) ) {
            $result_data = is_array( $r['result'] ) ? $r['result'] : json_decode( $r['result'], true );
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

        // Screenshots are stored as a separate JSONB column on the API
        if ( ! isset( $r['screenshots_json'] ) ) {
            $ss = isset( $r['screenshots'] ) ? $r['screenshots'] : null;
            $r['screenshots_json'] = $ss !== null
                ? ( is_string( $ss ) ? $ss : wp_json_encode( $ss ) )
                : null;
        }

        $r['has_changes'] = isset( $r['has_changes'] ) ? (int) $r['has_changes'] : 0;

        return $r;
    }

    /**
     * Normalize a test-history row from the API.
     *
     * @param array $h Raw history row from the API.
     * @return array
     */
    private static function normalize_history( $h ) {
        $result_data = [];
        if ( ! empty( $h['result'] ) ) {
            $result_data = is_array( $h['result'] ) ? $h['result'] : json_decode( $h['result'], true );
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

        // Screenshots
        if ( ! isset( $h['screenshots_json'] ) ) {
            $ss = isset( $h['screenshots'] ) ? $h['screenshots'] : null;
            $h['screenshots_json'] = $ss !== null
                ? ( is_string( $ss ) ? $ss : wp_json_encode( $ss ) )
                : null;
        }

        // extracted_data_json: design-audit / wcag fields live inside result.extractedData
        if ( ! isset( $h['extracted_data_json'] ) ) {
            $extracted = isset( $result_data['extractedData'] ) ? $result_data['extractedData'] : null;
            $h['extracted_data_json'] = $extracted !== null ? wp_json_encode( $extracted ) : null;
        }

        return $h;
    }

    // ── Monitor CRUD ──────────────────────────────────────────────────────────

    /**
     * List all monitors for the current workspace.
     *
     * @return array[]|WP_Error
     */
    public static function monitors_list() {
        $result = self::api_request( 'GET', '/api/monitors' );
        if ( is_wp_error( $result ) ) return $result;
        return array_map( [ __CLASS__, 'normalize_monitor' ], (array) $result );
    }

    /**
     * List monitors due for a given schedule (enabled + scheduled_at <= now).
     *
     * @param string $schedule 'daily'|'weekly'|'monthly'
     * @return array[]|WP_Error
     */
    public static function monitors_list_due( $schedule ) {
        $path   = '/api/monitors?schedule=' . rawurlencode( $schedule ) . '&due=1';
        $result = self::api_request( 'GET', $path );
        if ( is_wp_error( $result ) ) return $result;
        return array_map( [ __CLASS__, 'normalize_monitor' ], (array) $result );
    }

    /**
     * Get a single monitor.
     *
     * @param string $id UUID.
     * @return array|WP_Error
     */
    public static function monitors_get( $id ) {
        $result = self::api_request( 'GET', '/api/monitors/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_monitor( $result );
    }

    /**
     * Create a monitor.
     *
     * @param array $data { page_url, schedule, notify_email, notify_admin, notify_on, threshold_score, ... }
     * @return array|WP_Error
     */
    public static function monitors_create( $data ) {
        // WP plugin uses notify_email/notify_admin (bool int) → map to API field names
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

    /**
     * Update fields on a monitor.
     *
     * @param string $id   UUID.
     * @param array  $data Fields to update (WP field names — will be mapped).
     * @return array|WP_Error
     */
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

        // Booleans: WP int (0/1) → PHP bool → JSON true/false
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

    /**
     * Delete a monitor (cascades to results).
     *
     * @param string $id UUID.
     * @return true|WP_Error
     */
    public static function monitors_delete( $id ) {
        $result = self::api_request( 'DELETE', '/api/monitors/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    // ── Monitor Results ───────────────────────────────────────────────────────

    /**
     * Get results for a monitor.
     *
     * @param string $id     Monitor UUID.
     * @param array  $args   { limit, offset }
     * @return array { data: array[], total: int }|WP_Error
     */
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
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null || $status_code !== 200 || empty( $decoded['success'] ) ) {
            $msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $msg );
        }

        $rows = array_map( [ __CLASS__, 'normalize_result' ], (array) $decoded['data'] );
        return array( 'data' => $rows, 'total' => isset( $decoded['total'] ) ? (int) $decoded['total'] : count( $rows ) );
    }

    /**
     * Save a result for a monitor.
     *
     * @param string $monitor_id Monitor UUID.
     * @param array  $data       Result data.
     * @return array|WP_Error
     */
    public static function monitors_save_result( $monitor_id, $data ) {
        $payload = array(
            'score'         => isset( $data['score'] )         ? (int) $data['score']         : null,
            'has_changes'   => isset( $data['has_changes'] )   ? (bool) $data['has_changes']   : null,
            'status'        => isset( $data['status'] )        ? $data['status']               : 'completed',
            'summary'       => isset( $data['summary'] )       ? $data['summary']              : null,
            'error_message' => isset( $data['error_message'] ) ? $data['error_message']        : null,
        );

        // Pack separate _json columns back into result JSONB + screenshots
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

        // Use a longer timeout: result payloads can include full-quality screenshots (2–5 MB).
        $result = self::api_request(
            'POST',
            '/api/monitors/' . rawurlencode( $monitor_id ) . '/results',
            $payload,
            self::BASELINE_TIMEOUT
        );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_result( $result );
    }

    /**
     * Approve a monitor result (mark as approved in the API).
     *
     * @param string $result_id Result UUID.
     * @return true|WP_Error
     */
    public static function monitors_approve_result( $result_id ) {
        $result = self::api_request( 'PUT', '/api/results/' . rawurlencode( $result_id ) . '/approve' );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    // ── Test History ──────────────────────────────────────────────────────────

    /**
     * List test history.
     *
     * @param array $args { test_type, exclude_type, limit, offset }
     * @return array { data: array[], total: int }|WP_Error
     */
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
                sprintf( __( 'Could not reach the API: %s', 'qaproof' ), $response->get_error_message() )
            );
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $decoded     = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( $decoded === null || $status_code !== 200 || empty( $decoded['success'] ) ) {
            $msg = isset( $decoded['error']['message'] )
                ? $decoded['error']['message']
                : sprintf( __( 'API returned HTTP %d', 'qaproof' ), $status_code );
            return new WP_Error( 'qaproof_api_error', $msg );
        }

        $rows = array_map( [ __CLASS__, 'normalize_history' ], (array) $decoded['data'] );
        return array( 'data' => $rows, 'total' => isset( $decoded['total'] ) ? (int) $decoded['total'] : count( $rows ) );
    }

    /**
     * Get a single history item.
     *
     * @param string $id UUID.
     * @return array|WP_Error
     */
    public static function history_get( $id ) {
        $result = self::api_request( 'GET', '/api/history/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_history( $result );
    }

    /**
     * Save a test result to history.
     *
     * @param array $data { test_type, page_url, score, summary, categories, differences,
     *                      recommendations, screenshots, extractedData, job_id }
     * @return array|WP_Error
     */
    public static function history_save( $data ) {
        // Pack separate fields into the result JSONB
        $result_obj = array();
        $copy_keys  = array( 'categories', 'differences', 'recommendations' );
        foreach ( $copy_keys as $key ) {
            if ( isset( $data[ $key ] ) ) { $result_obj[ $key ] = $data[ $key ]; }
        }
        // Design audit / WCAG extracted data
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

        // Use a longer timeout: history payloads can include full-quality screenshots (2–5 MB).
        $result = self::api_request( 'POST', '/api/history', $payload, self::BASELINE_TIMEOUT );
        if ( is_wp_error( $result ) ) return $result;
        return self::normalize_history( $result );
    }

    /**
     * Delete a history item.
     *
     * @param string $id UUID.
     * @return true|WP_Error
     */
    public static function history_delete( $id ) {
        $result = self::api_request( 'DELETE', '/api/history/' . rawurlencode( $id ) );
        if ( is_wp_error( $result ) ) return $result;
        return true;
    }

    /**
     * Get aggregated history stats for the dashboard.
     *
     * @param int $threshold Score below which a test is considered failing. Default 70.
     * @return array { total, avg_score, below_threshold, by_type }|WP_Error
     */
    public static function history_stats( $threshold = 70 ) {
        $path   = '/api/history/stats?threshold=' . (int) $threshold;
        $result = self::api_request( 'GET', $path );
        if ( is_wp_error( $result ) ) return $result;
        return $result;
    }

    /**
     * Send a PDF report via email using the SaaS API (AWS SES).
     *
     * @param array $params {
     *   pdfBase64 string  jsPDF datauristring
     *   to        string  Recipient email
     *   fileName  string  Attachment filename
     *   testType  string  e.g. 'accessibility'
     *   pageUrl   string
     *   score     int
     * }
     * @return array|WP_Error { success, sentTo } or WP_Error
     */
    public static function send_report_email( $params ) {
        return self::api_request( 'POST', '/api/send-report-email', $params, 60 );
    }
}
