<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Thin REST proxy for monitor data on api.qaproof.io. Read endpoints use a
 * 9s WP transient cache so the JS poll loop (10s interval) hits local MySQL
 * instead of the remote API on every tick; writes bypass the cache and
 * flush affected keys.
 */
class QAProof_Admin_REST_Monitors {

    const CACHE_TTL = 9;

    private static function cache_key_list()                        { return 'qaproof_mon_list'; }
    private static function cache_key_monitor( $id )                { return 'qaproof_mon_' . md5( $id ); }
    private static function cache_key_results( $id )                { return 'qaproof_mon_res_' . md5( $id ); }
    private static function cache_key_results_page( $id, $limit )   { return 'qaproof_mon_res_' . md5( $id ) . '_lim' . (int) $limit; }
    public  static function run_queued_key( $id )                   { return 'qaproof_run_q_' . md5( $id ); }

    private static function flush_monitor_cache( $id ) {
        delete_transient( self::cache_key_list() );
        delete_transient( self::cache_key_monitor( $id ) );
        delete_transient( self::cache_key_results( $id ) );
    }

    private static function flush_list_cache() {
        delete_transient( self::cache_key_list() );
    }

    public static function handle_list_monitors() {
        $cached = get_transient( self::cache_key_list() );
        if ( $cached !== false ) {
            return new WP_REST_Response( [ 'success' => true, 'data' => $cached ], 200 );
        }

        $monitors = QAProof_API_Client::monitors_list();

        if ( is_wp_error( $monitors ) ) {
            $data = $monitors->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $monitors->get_error_message() ],
            ], $http );
        }

        // Cron schedule data only lives on this WP install — enrich here.
        $cron_next = [
            'daily'   => wp_next_scheduled( QAProof_Scheduler::DAILY_HOOK ),
            'weekly'  => wp_next_scheduled( QAProof_Scheduler::WEEKLY_HOOK ),
            'monthly' => wp_next_scheduled( QAProof_Scheduler::MONTHLY_HOOK ),
        ];

        foreach ( $monitors as &$m ) {
            $ts = isset( $cron_next[ $m['schedule'] ] ) ? $cron_next[ $m['schedule'] ] : false;
            $m['next_run_at'] = $ts ? gmdate( 'Y-m-d H:i:s', $ts ) : null;
        }
        unset( $m );

        set_transient( self::cache_key_list(), $monitors, self::CACHE_TTL );
        $cached = $monitors;

        // Inject run_queued_at fresh on every read — never cached.
        foreach ( $cached as &$m ) {
            $run_ts = get_transient( self::run_queued_key( $m['id'] ) );
            $m['run_queued_at'] = $run_ts ? gmdate( 'c', (int) $run_ts ) : null;
        }
        unset( $m );

        return new WP_REST_Response( [ 'success' => true, 'data' => $cached ], 200 );
    }

    public static function handle_get_monitor( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $cached = get_transient( self::cache_key_monitor( $id ) );
        if ( $cached === false ) {
            $monitor = QAProof_API_Client::monitors_get( $id );

            if ( is_wp_error( $monitor ) ) {
                $data = $monitor->get_error_data();
                $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => $monitor->get_error_message() ],
                ], $http );
            }

            set_transient( self::cache_key_monitor( $id ), $monitor, self::CACHE_TTL );
            $cached = $monitor;
        }

        $run_ts = get_transient( self::run_queued_key( $id ) );
        $cached['run_queued_at'] = $run_ts ? gmdate( 'c', (int) $run_ts ) : null;

        return new WP_REST_Response( [ 'success' => true, 'data' => $cached ], 200 );
    }

    public static function handle_create_monitor( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['page_url'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Page URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $url    = sanitize_url( $params['page_url'] );
        $parsed = wp_parse_url( $url );
        if ( empty( $parsed['scheme'] ) || ! in_array( $parsed['scheme'], [ 'http', 'https' ], true )
            || empty( $parsed['host'] ) || strpos( $parsed['host'], '.' ) === false ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Please enter a valid URL (e.g. https://example.com).', 'qaproof' ) ],
            ], 400 );
        }

        $valid_notify_on = [ 'failures', 'all' ];
        $create_data = [
            'page_url'        => $url,
            'schedule'        => isset( $params['schedule'] ) ? sanitize_text_field( $params['schedule'] ) : 'daily',
            'notify_email'    => isset( $params['notify_email'] )    ? (int) $params['notify_email']    : 1,
            'notify_admin'    => isset( $params['notify_admin'] )    ? (int) $params['notify_admin']    : 1,
            'notify_on'       => isset( $params['notify_on'] ) && in_array( $params['notify_on'], $valid_notify_on, true )
                                    ? $params['notify_on'] : 'failures',
            'threshold_score' => isset( $params['threshold_score'] )
                                    ? (int) $params['threshold_score']
                                    : (int) get_option( 'qaproof_default_threshold', 95 ),
        ];
        if ( ! empty( $params['scheduled_at'] ) ) {
            $create_data['scheduled_at'] = sanitize_text_field( $params['scheduled_at'] );
        }

        $monitor = QAProof_API_Client::monitors_create( $create_data );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = 500;
            $code = '';
            if ( is_array( $data ) ) {
                if ( isset( $data['status'] ) )     { $http = (int) $data['status']; }
                if ( isset( $data['error_code'] ) ) { $code = $data['error_code']; }
            }
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'code' => $code, 'message' => $monitor->get_error_message() ],
            ], $http );
        }

        self::flush_list_cache();
        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 200 );
    }

    public static function handle_update_monitor( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $params = $request->get_json_params();
        $update = [];

        if ( isset( $params['page_url'] ) )        { $update['page_url']        = sanitize_url( $params['page_url'] ); }
        if ( isset( $params['schedule'] ) )        { $update['schedule']        = sanitize_text_field( $params['schedule'] ); }
        if ( isset( $params['is_enabled'] ) )      { $update['is_enabled']      = (int) $params['is_enabled']; }
        if ( isset( $params['notify_email'] ) )    { $update['notify_email']    = (int) $params['notify_email']; }
        if ( isset( $params['notify_admin'] ) )    { $update['notify_admin']    = (int) $params['notify_admin']; }
        if ( isset( $params['threshold_score'] ) ) { $update['threshold_score'] = (int) $params['threshold_score']; }
        if ( ! empty( $params['scheduled_at'] ) )  { $update['scheduled_at']   = sanitize_text_field( $params['scheduled_at'] ); }
        if ( isset( $params['notify_on'] ) && in_array( $params['notify_on'], [ 'failures', 'all' ], true ) ) {
            $update['notify_on'] = sanitize_text_field( $params['notify_on'] );
        }

        $monitor = QAProof_API_Client::monitors_update( $id, $update );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $monitor->get_error_message() ],
            ], $http );
        }

        self::flush_monitor_cache( $id );
        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 200 );
    }

    public static function handle_delete_monitor( WP_REST_Request $request ) {
        $id      = sanitize_text_field( $request['id'] );
        $monitor = QAProof_API_Client::monitors_get( $id );

        if ( is_wp_error( $monitor ) ) {
            $data = $monitor->get_error_data();
            $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $http === 404
                    ? __( 'Monitor not found.', 'qaproof' )
                    : $monitor->get_error_message() ],
            ], $http );
        }

        if ( ! empty( $monitor['baseline_key'] ) ) {
            QAProof_API_Client::delete_baseline( $monitor['baseline_key'] );
        }

        $result = QAProof_API_Client::monitors_delete( $id );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        self::flush_monitor_cache( $id );
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_run_monitor( WP_REST_Request $request ) {
        $id      = sanitize_text_field( $request['id'] );
        $monitor = QAProof_API_Client::monitors_get( $id );

        if ( is_wp_error( $monitor ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Pick the job type: capture a baseline if the monitor has none yet,
        // otherwise run a regression against the existing baseline. BOTH now run
        // as async jobs — the browser polls /poll-job/:jobId and calls
        // /monitors/:id/finish-run when done. Baseline-as-a-job keeps bulk
        // monitor setups from blocking the request for the full 20-60s capture.
        $is_setup  = empty( $monitor['has_baseline'] );
        $test_type = $is_setup ? 'baseline' : 'regression';

        $job_response = QAProof_API_Client::run_test( [
            'pageUrl'  => $monitor['page_url'],
            'testType' => $test_type,
        ] );

        if ( is_wp_error( $job_response ) ) {
            // Pass the API status + code through (e.g. 429 CONCURRENCY_LIMIT) so the
            // browser can queue/retry bulk setups instead of surfacing a hard error.
            $data    = $job_response->get_error_data();
            $status  = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
            $err     = [ 'message' => $job_response->get_error_message() ];
            if ( is_array( $data ) && isset( $data['error_code'] ) ) {
                $err['code'] = $data['error_code'];
            }
            return new WP_REST_Response( [ 'success' => false, 'error' => $err ], $status );
        }

        $job_id = isset( $job_response['jobId'] ) ? $job_response['jobId'] : null;
        if ( empty( $job_id ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'API did not return a job ID.', 'qaproof' ) ],
            ], 502 );
        }

        // Keep the 25-min transient so scheduled-cron-aware UI components (run_queued_at)
        // still work correctly if the user opens the monitor in another tab.
        set_transient( self::run_queued_key( $id ), time(), 25 * MINUTE_IN_SECONDS );
        self::flush_monitor_cache( $id );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => [
                'mode'    => $is_setup ? 'baseline' : 'regression',
                'job_id'  => $job_id,
                'monitor' => $monitor,
            ],
        ], 200 );
    }

    /**
     * POST /monitors/:id/finish-run
     *
     * Called by the browser after it polls a regression job to completion.
     * Saves the result row, sends notifications, and schedules the background
     * screenshot-fetch cron so the browser doesn't have to wait for screenshots.
     */
    public static function handle_finish_run( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $params = $request->get_json_params();

        $monitor = QAProof_API_Client::monitors_get( $id );
        if ( is_wp_error( $monitor ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        $job_id    = isset( $params['job_id'] )       ? sanitize_text_field( $params['job_id'] )             : '';
        $result    = isset( $params['result'] ) && is_array( $params['result'] ) ? $params['result']         : null;
        $error_msg = isset( $params['error_message'] ) ? sanitize_textarea_field( $params['error_message'] ) : '';

        if ( $result === null && empty( $error_msg ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'result or error_message is required.', 'qaproof' ) ],
            ], 400 );
        }

        // Baseline-job completion: there's no test result row to save — the job
        // just captured a baseline. Stamp has_baseline + baseline_key on the
        // monitor so the next run does a regression, then return.
        if ( $result && ! empty( $result['baselineKey'] )
             && ( ! isset( $result['testType'] ) || $result['testType'] === 'baseline' ) ) {
            QAProof_API_Client::monitors_update( $id, [
                'baseline_key' => sanitize_text_field( $result['baselineKey'] ),
                'has_baseline' => 1,
                'last_run_at'  => gmdate( 'Y-m-d H:i:s' ),
            ] );
            delete_transient( self::run_queued_key( $id ) );
            self::flush_monitor_cache( $id );

            return new WP_REST_Response( [
                'success' => true,
                'data'    => [ 'mode' => 'baseline', 'has_baseline' => true ],
            ], 200 );
        }

        if ( $result ) {
            $save_data = [
                'score'           => isset( $result['score'] )           ? (int) $result['score']                                : null,
                'has_changes'     => ! empty( $result['hasChanges'] ) ? (bool) $result['hasChanges'] : false,
                'status'          => 'completed',
                'summary'         => isset( $result['summary'] )         ? $result['summary']               : '',
                'categories'      => isset( $result['categories'] )      ? $result['categories']            : [],
                'differences'     => isset( $result['differences'] )     ? $result['differences']           : [],
                'recommendations' => isset( $result['recommendations'] ) ? $result['recommendations']       : [],
            ];

            $saved = QAProof_API_Client::monitors_save_result( $id, $save_data );

            if ( is_wp_error( $saved ) ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => $saved->get_error_message() ],
                ], 502 );
            }

            $result_id = isset( $saved['id'] ) ? $saved['id'] : null;

            // Update the monitor's last_score and last_run_at in the SaaS DB.
            QAProof_API_Client::monitors_update( $id, [
                'last_score'  => $save_data['score'],
                'last_run_at' => gmdate( 'Y-m-d H:i:s' ),
            ] );

            // Clear the run_queued transient so the badge disappears.
            delete_transient( self::run_queued_key( $id ) );
            self::flush_monitor_cache( $id );

            // Send notification if score is below threshold — same logic as the scheduler.
            $notify_on       = isset( $monitor['notify_on'] ) ? $monitor['notify_on'] : 'failures';
            $score           = $save_data['score'];
            $below_threshold = $score !== null && $score < (int) $monitor['threshold_score'];

            if ( $notify_on === 'all' || ( $notify_on === 'failures' && $below_threshold ) ) {
                QAProof_Notifications::notify( $monitor, $result );
            }

            // Fetch screenshots inline and patch them onto the result row so the
            // report renders complete — no deferred WP-Cron (which fired only on
            // the next visit + 60s lock, leaving screenshots "loading" for ~5 min).
            // Uses the dedicated /api/results/:id/screenshots endpoint (10 MB body
            // limit) rather than the monitors save endpoint (5 MB) so two full-page
            // PNGs don't trip a 413.
            if ( $result_id && ! empty( $job_id ) ) {
                $shots = QAProof_API_Client::get_job_screenshots( $job_id );
                if ( ! is_wp_error( $shots ) && ! empty( $shots['screenshots'] ) ) {
                    QAProof_API_Client::monitors_update_result_screenshots( $result_id, $shots['screenshots'] );
                }
            }

            return new WP_REST_Response( [
                'success' => true,
                'data'    => [ 'result_id' => $result_id ],
            ], 200 );
        }

        // Error case — save a failed result row.
        QAProof_API_Client::monitors_save_result( $id, [
            'status'        => 'failed',
            'error_message' => $error_msg,
        ] );
        delete_transient( self::run_queued_key( $id ) );
        self::flush_monitor_cache( $id );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_get_results( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $limit  = $request->get_param( 'limit' )  ? (int) $request->get_param( 'limit' )  : 20;
        $offset = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        // Cache only the first-page fetches used by the polling loop.
        // cache_key_results_page() returns a fully-prefixed key
        // (`qaproof_mon_res_<hash>_lim<N>`) so it can never collide with another
        // plugin's transient storage. Earlier revisions built this key inline
        // ("'lim' . $limit") which made the static analyser flag the literal
        // 'lim' as a possibly-unprefixed key — same actual value, clearer
        // provenance through the helper.
        $use_cache = ( $offset === 0 && $limit <= 20 );
        if ( $use_cache ) {
            $cache_key = self::cache_key_results_page( $id, $limit );
            $cached    = get_transient( $cache_key );
            if ( $cached !== false ) {
                return new WP_REST_Response( [
                    'success' => true,
                    'data'    => $cached['data'],
                    'total'   => $cached['total'],
                ], 200 );
            }
        }

        $result = QAProof_API_Client::monitors_get_results( $id, [
            'limit'  => $limit,
            'offset' => $offset,
        ] );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $result->get_error_message() ],
            ], 502 );
        }

        if ( $use_cache ) {
            set_transient( $cache_key, [ 'data' => $result['data'], 'total' => $result['total'] ], self::CACHE_TTL );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $result['data'],
            'total'   => $result['total'],
        ], 200 );
    }

    public static function handle_clear_notifications() {
        QAProof_Notifications::clear_badge();
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
