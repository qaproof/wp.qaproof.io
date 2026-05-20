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

    private static function cache_key_list()         { return 'qaproof_mon_list'; }
    private static function cache_key_monitor( $id ) { return 'qaproof_mon_' . md5( $id ); }
    private static function cache_key_results( $id ) { return 'qaproof_mon_res_' . md5( $id ); }
    public  static function run_queued_key( $id )    { return 'qaproof_run_q_' . md5( $id ); }

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

        // Dispatch via WP-Cron single event so the request can return immediately;
        // the JS poll loop pings /wp-cron.php once to guarantee dispatch.
        wp_schedule_single_event( time() - 1, 'qaproof_run_monitor', [ $id ] );

        // 25-min TTL covers the scheduler's 8-min poll + PHP timeout headroom.
        set_transient( self::run_queued_key( $id ), time(), 25 * MINUTE_IN_SECONDS );
        self::flush_monitor_cache( $id );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => [
                'monitor' => $monitor,
                'message' => __( 'Monitor test queued. Results will appear shortly.', 'qaproof' ),
            ],
        ], 200 );
    }

    public static function handle_get_results( WP_REST_Request $request ) {
        $id     = sanitize_text_field( $request['id'] );
        $limit  = $request->get_param( 'limit' )  ? (int) $request->get_param( 'limit' )  : 20;
        $offset = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        // Cache only the first-page fetches used by the polling loop.
        $use_cache = ( $offset === 0 && $limit <= 20 );
        if ( $use_cache ) {
            $cache_key = self::cache_key_results( $id ) . 'lim' . $limit;
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

    public static function handle_approve_result( WP_REST_Request $request ) {
        $result_id  = sanitize_text_field( $request['id'] );
        $monitor_id = sanitize_text_field( $request->get_param( 'monitorId' ) );

        if ( empty( $monitor_id ) ) {
            // Without monitorId we can only flip status, not recreate the baseline.
            $approved = QAProof_API_Client::monitors_approve_result( $result_id );
            if ( is_wp_error( $approved ) ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => $approved->get_error_message() ],
                ], 502 );
            }
            return new WP_REST_Response( [ 'success' => true ], 200 );
        }

        $monitor = QAProof_API_Client::monitors_get( $monitor_id );
        if ( is_wp_error( $monitor ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Retry once on CAPTURE_UNSTABLE — same rationale as the scheduler.
        $baseline_result = QAProof_API_Client::create_baseline( $monitor['page_url'] );

        if ( is_wp_error( $baseline_result ) ) {
            $error_data  = $baseline_result->get_error_data( 'qaproof_api_error' );
            $is_unstable = isset( $error_data['error_code'] ) && $error_data['error_code'] === 'CAPTURE_UNSTABLE';

            if ( $is_unstable ) {
                $baseline_result = QAProof_API_Client::create_baseline( $monitor['page_url'], true );
            }

            if ( is_wp_error( $baseline_result ) ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'error'   => [ 'message' => $baseline_result->get_error_message() ],
                ], 502 );
            }
        }

        QAProof_API_Client::monitors_update( $monitor_id, [
            'baseline_key' => $baseline_result['key'],
            'has_baseline' => 1,
        ] );

        QAProof_API_Client::monitors_approve_result( $result_id );

        self::flush_monitor_cache( $monitor_id );
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_clear_notifications() {
        QAProof_Notifications::clear_badge();
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }
}
