<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin {

    const MENU_SLUG       = 'qaproof';
    const TESTS_SLUG      = 'qaproof-tests';
    const ACCESSIBILITY_SLUG = 'qaproof-accessibility';
    const MONITORS_SLUG   = 'qaproof-monitors';
    const SETTINGS_SLUG   = 'qaproof-settings';
    const REST_NAMESPACE  = 'qaproof/v1';
    const CAPABILITY      = 'manage_options';

    public static function init() {
        add_action( 'admin_menu', [ __CLASS__, 'register_menu' ] );
        add_action( 'admin_enqueue_scripts', [ 'QAProof_Admin_Assets', 'enqueue_assets' ] );
        add_action( 'rest_api_init', [ __CLASS__, 'register_rest_routes' ] );
        add_action( 'wp_ajax_qaproof_health_check',       [ 'QAProof_Admin_AJAX', 'ajax_health_check' ] );
        add_action( 'wp_ajax_qaproof_fetch_account_info', [ 'QAProof_Admin_AJAX', 'ajax_fetch_account_info' ] );
    }

    public static function register_menu() {
        add_menu_page(
            __( 'QAProof', 'qaproof' ),
            __( 'QAProof', 'qaproof' ),
            self::CAPABILITY,
            self::MENU_SLUG,
            [ __CLASS__, 'render_dashboard_page' ],
            self::menu_icon_svg(),
            80
        );

        add_submenu_page(
            self::MENU_SLUG,
            __( 'Dashboard', 'qaproof' ),
            __( 'Dashboard', 'qaproof' ),
            self::CAPABILITY,
            self::MENU_SLUG,
            [ __CLASS__, 'render_dashboard_page' ]
        );

        add_submenu_page(
            self::MENU_SLUG,
            __( 'Tests', 'qaproof' ),
            __( 'Tests', 'qaproof' ),
            self::CAPABILITY,
            self::TESTS_SLUG,
            [ __CLASS__, 'render_tests_page' ]
        );

        add_submenu_page(
            self::MENU_SLUG,
            __( 'Accessibility', 'qaproof' ),
            __( 'Accessibility', 'qaproof' ),
            self::CAPABILITY,
            self::ACCESSIBILITY_SLUG,
            [ __CLASS__, 'render_accessibility_page' ]
        );

        add_submenu_page(
            self::MENU_SLUG,
            __( 'Monitors', 'qaproof' ),
            __( 'Monitors', 'qaproof' ),
            self::CAPABILITY,
            self::MONITORS_SLUG,
            [ __CLASS__, 'render_monitors_page' ]
        );

        add_submenu_page(
            self::MENU_SLUG,
            __( 'Settings', 'qaproof' ),
            __( 'Settings', 'qaproof' ),
            self::CAPABILITY,
            self::SETTINGS_SLUG,
            [ __CLASS__, 'render_settings_page' ]
        );
    }

    /** Data-URI menu icon; falls back to 'dashicons-chart-bar' if SVG can't load. */
    private static function menu_icon_svg() {
        $path = plugin_dir_path( __FILE__ ) . 'images/icon.svg';
        if ( is_file( $path ) && is_readable( $path ) ) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_read_file_get_contents -- plugin-local SVG asset.
            $svg = file_get_contents( $path );
            if ( is_string( $svg ) && $svg !== '' ) {
                // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- encoding own SVG for data URI.
                return 'data:image/svg+xml;base64,' . base64_encode( $svg );
            }
        }
        return 'dashicons-chart-bar';
    }

    public static function register_rest_routes() {
        $permission = function() {
            return current_user_can( self::CAPABILITY );
        };

        register_rest_route( self::REST_NAMESPACE, '/run-test', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Tests', 'handle_run_test' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/poll-job/(?P<jobId>[a-f0-9]+)', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Tests', 'handle_poll_job' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/job-screenshots/(?P<jobId>[a-f0-9]+)', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Tests', 'handle_job_screenshots' ],
            'permission_callback' => $permission,
        ]);

        // Cancel-job proxy. Fired by the WP UI on tab close / explicit cancel
        // so the API can stop the pipeline and refund the quota slot. Mirrors
        // the existing poll-job route's restriction to hex job IDs.
        register_rest_route( self::REST_NAMESPACE, '/cancel-job/(?P<jobId>[a-f0-9]+)', [
            'methods'             => 'DELETE',
            'callback'            => [ 'QAProof_Admin_REST_Tests', 'handle_cancel_job' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors', [
            [
                'methods'             => 'GET',
                'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_list_monitors' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_create_monitor' ],
                'permission_callback' => $permission,
            ],
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>[a-fA-F0-9-]{8,64})', [
            [
                'methods'             => 'GET',
                'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_get_monitor' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_update_monitor' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_delete_monitor' ],
                'permission_callback' => $permission,
            ],
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>[a-fA-F0-9-]{8,64})/run', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_run_monitor' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>[a-fA-F0-9-]{8,64})/results', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_get_results' ],
            'permission_callback' => $permission,
        ]);

        // Single result WITH screenshots — lazy-loaded on "View" so the list stays light.
        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>[a-fA-F0-9-]{8,64})/results/(?P<rid>[\w-]+)', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_get_single_result' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/results/(?P<id>[\w-]+)/approve', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_approve_result' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/notifications/clear', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_clear_notifications' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/figma-preview', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_figma_preview' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/designs/verify-access', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_verify_access' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/figma-oauth/start', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Figma_OAuth', 'handle_start' ],
            'permission_callback' => $permission,
        ]);
        register_rest_route( self::REST_NAMESPACE, '/figma-oauth/status', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Figma_OAuth', 'handle_status' ],
            'permission_callback' => $permission,
        ]);
        register_rest_route( self::REST_NAMESPACE, '/figma-oauth/disconnect', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Figma_OAuth', 'handle_disconnect' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/detect-elements', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_detect_elements' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/figma-api-usage', [
            'methods'             => 'GET',
            'callback'            => function () {
                return new WP_REST_Response( [
                    'success' => true,
                    'data'    => QAProof_Settings::get_figma_api_usage(),
                ], 200 );
            },
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/figma-api-usage/reset', [
            'methods'             => 'POST',
            'callback'            => function () {
                QAProof_Settings::reset_figma_api_usage();
                return new WP_REST_Response( [
                    'success' => true,
                    'data'    => QAProof_Settings::get_figma_api_usage(),
                ], 200 );
            },
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/send-report-email', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_send_report_email' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/generate-pdf', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_generate_pdf' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/feedback', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_submit_feedback' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/test-history', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_History', 'handle_list_test_history' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/test-history/(?P<id>[\w-]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [ 'QAProof_Admin_REST_History', 'handle_get_test_history' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [ 'QAProof_Admin_REST_History', 'handle_delete_test_history' ],
                'permission_callback' => $permission,
            ],
        ]);

    }

    public static function handle_send_report_email( WP_REST_Request $request ) {
        $result_data = $request->get_param( 'resultData' );
        $file_name   = sanitize_file_name( $request->get_param( 'fileName' ) ?: 'qaproof-report.pdf' );

        $current_user = wp_get_current_user();
        $to = ( $current_user->ID && $current_user->user_email )
            ? $current_user->user_email
            : get_option( 'qaproof_notify_email', get_option( 'admin_email' ) );

        if ( ! empty( $result_data ) && is_array( $result_data ) ) {
            // New path — API generates PDF server-side from result data.
            $result = QAProof_API_Client::send_report_email( [
                'resultData' => $result_data,
                'to'         => $to,
                'fileName'   => $file_name,
            ] );
        } else {
            // Legacy path — pdfBase64 sent from browser jsPDF (kept for backward compat).
            $pdf_base64 = $request->get_param( 'pdfBase64' );
            if ( empty( $pdf_base64 ) ) {
                return new WP_REST_Response( [ 'success' => false, 'error' => 'No PDF data provided.' ], 400 );
            }
            $result = QAProof_API_Client::send_report_email( [
                'pdfBase64' => $pdf_base64,
                'to'        => $to,
                'fileName'  => $file_name,
                'testType'  => sanitize_text_field( $request->get_param( 'testType' ) ?: 'report' ),
                'pageUrl'   => esc_url_raw( $request->get_param( 'pageUrl' ) ?: '' ),
                'score'     => intval( $request->get_param( 'score' ) ?: 0 ),
            ] );
        }

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => $result->get_error_message() ], 500 );
        }

        return new WP_REST_Response( [ 'success' => true, 'sentTo' => $to ], 200 );
    }

    public static function handle_generate_pdf( WP_REST_Request $request ) {
        $result_data = $request->get_param( 'resultData' );

        if ( empty( $result_data ) || ! is_array( $result_data ) ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'No result data provided.' ], 400 );
        }

        // Screenshots can be several MB of base64 each; compress before sending
        // to keep the payload within nginx body limits and avoid 502 errors.
        if ( ! empty( $result_data['screenshots'] ) && is_array( $result_data['screenshots'] ) ) {
            $result_data['screenshots'] = self::compress_screenshots( $result_data['screenshots'] );
        }

        $pdf = QAProof_API_Client::generate_pdf( $result_data );

        if ( is_wp_error( $pdf ) ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => $pdf->get_error_message() ], 502 );
        }

        $test_type = sanitize_file_name( isset( $result_data['testType'] ) ? $result_data['testType'] : 'report' );
        $stamp     = gmdate( 'Y-m-d' );
        $filename  = "qaproof-{$test_type}-{$stamp}.pdf";

        // WP REST server always json_encodes WP_HTTP_Response body, which corrupts
        // binary data. Send the PDF directly and exit before that happens.
        status_header( 200 );
        header( 'Content-Type: application/pdf' );
        header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
        header( 'Content-Length: ' . strlen( $pdf ) );
        header( 'Cache-Control: private, no-store' );
        echo $pdf;
        exit;
    }

    /**
     * Resize each base64 data-URI screenshot to max 800 px wide at 65% JPEG
     * quality so the PDF payload stays within nginx body limits.
     * Falls back to stripping screenshots if PHP-GD is unavailable.
     */
    private static function compress_screenshots( array $screenshots ) {
        if ( ! function_exists( 'imagecreatefromstring' ) ) {
            return [];
        }
        foreach ( $screenshots as $key => &$val ) {
            if ( ! is_string( $val ) || strpos( $val, 'data:image' ) === false ) {
                continue;
            }
            $pos = strpos( $val, 'base64,' );
            if ( $pos === false ) continue;
            $img = @imagecreatefromstring( base64_decode( substr( $val, $pos + 7 ) ) );
            if ( ! $img ) continue;
            $w = imagesx( $img );
            $h = imagesy( $img );
            if ( $w > 800 ) {
                $new_h = (int) round( $h * 800 / $w );
                $thumb = imagecreatetruecolor( 800, $new_h );
                imagecopyresampled( $thumb, $img, 0, 0, 0, 0, 800, $new_h, $w, $h );
                imagedestroy( $img );
                $img = $thumb;
            }
            ob_start();
            imagejpeg( $img, null, 65 );
            $val = 'data:image/jpeg;base64,' . base64_encode( ob_get_clean() );
            imagedestroy( $img );
        }
        unset( $val );
        return $screenshots;
    }

    /**
     * "How was this test?" handler.
     *
     * Forwards the rating + optional comment to the QAProof SaaS and returns
     * the result to the client. Feedback is NOT persisted on the WordPress
     * site — the SaaS-side `plugin_feedback` table is the only store.
     *
     * Errors from the SaaS (network failure, 4xx/5xx, missing API key) are
     * surfaced back through `error.message` so the UI can show a real
     * "couldn't save" message rather than a silent success.
     */
    public static function handle_submit_feedback( WP_REST_Request $request ) {
        $rating = intval( $request->get_param( 'rating' ) );

        // Hard length cap BEFORE sanitize so a malicious admin can't blow up
        // the request payload with a megabyte of text. 2000 chars matches
        // the SaaS-side schema cap.
        $raw = $request->get_param( 'comment' ) ?: '';
        if ( is_string( $raw ) ) {
            $raw = function_exists( 'mb_substr' ) ? mb_substr( $raw, 0, 2000 ) : substr( $raw, 0, 2000 );
        } else {
            $raw = '';
        }
        $comment   = sanitize_textarea_field( $raw );
        $test_type = sanitize_text_field( $request->get_param( 'testType' ) ?: '' );
        $page_url  = esc_url_raw( $request->get_param( 'pageUrl' ) ?: '' );
        $score     = intval( $request->get_param( 'score' ) ?: 0 );

        if ( $rating < 1 || $rating > 5 ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'code'    => 'INVALID_RATING',
                    'message' => __( 'Rating must be 1–5.', 'qaproof' ),
                ],
            ], 400 );
        }

        $result = QAProof_API_Client::submit_feedback( [
            'rating'        => $rating,
            'comment'       => $comment,
            'testType'      => $test_type,
            'pageUrl'       => $page_url,
            'score'         => $score,
            'wpUserId'      => get_current_user_id(),
            'sourceSiteUrl' => home_url(),
        ] );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [
                    'code'    => $result->get_error_code(),
                    'message' => $result->get_error_message(),
                ],
            ], 502 );
        }

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    private static function render_theme_toggle() {
        include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-theme-toggle.php';
    }

    public static function render_settings_page() {
        // Capability gate. WordPress's admin menu router already enforces this
        // (the page wouldn't be reachable otherwise), but we re-check for
        // defence-in-depth.
        if ( ! current_user_can( self::CAPABILITY ) ) return;

        // Read-only tab navigation. `tab` and `subtab` only pick which UI tab
        // is displayed; they do NOT trigger writes, options updates, or any
        // server-side action. A nonce on a navigation URL would break the
        // back button, bookmarks, and admin-menu deep links — and would not
        // add real security since (a) the capability check above already
        // gates the entire handler and (b) sanitize_key() strips any payload
        // a malicious URL could carry. We additionally clamp the values to a
        // known allow-list below so an unexpected string can never reach the
        // template include.
        //
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only tab navigation; capability + allow-list guard above.
        $tab_raw    = isset( $_GET['tab'] )    ? sanitize_key( wp_unslash( $_GET['tab'] ) )    : '';
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only tab navigation; capability + allow-list guard above.
        $subtab_raw = isset( $_GET['subtab'] ) ? sanitize_key( wp_unslash( $_GET['subtab'] ) ) : '';

        // Allow-list for tabs/subtabs. Anything else collapses to the default
        // landing tab so the template never sees an unrecognised key.
        // Keep in sync with the tab/subtab anchors in admin/partials/page-settings.php.
        $allowed_tabs    = [ 'general', 'tests', 'monitors', 'uninstall' ];
        $allowed_subtabs = [ 'general', 'fidelity', 'responsive', 'accessibility' ];

        $active_tab    = in_array( $tab_raw,    $allowed_tabs,    true ) ? $tab_raw    : 'general';
        $active_subtab = in_array( $subtab_raw, $allowed_subtabs, true ) ? $subtab_raw : 'general';

        $base_url = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-settings.php';
    }

    public static function render_monitors_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $settings_url = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-monitors.php';
    }


    public static function render_dashboard_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;

        $monitors        = [];
        $total_monitors  = 0;
        $active_monitors = 0;
        $monitors_raw    = QAProof_API_Client::monitors_list();
        if ( ! is_wp_error( $monitors_raw ) ) {
            $monitors       = $monitors_raw;
            $total_monitors = count( $monitors );
            foreach ( $monitors as $m ) {
                if ( (int) $m['is_enabled'] ) $active_monitors++;
            }
        }

        $default_threshold = (int) get_option( 'qaproof_default_threshold', 95 );
        $total_tests = 0;
        $avg_score   = null;
        $history_stats_raw = QAProof_API_Client::history_stats( $default_threshold );
        if ( ! is_wp_error( $history_stats_raw ) ) {
            $total_tests = $history_stats_raw['total']     ?? 0;
            $avg_score   = $history_stats_raw['avg_score'] ?? null;
        }
        $has_api_key       = ! empty( QAProof_Settings::get_api_key() );

        $ai_used       = 0;
        $ai_limit      = 20;
        $monitor_limit = 1;
        $account_plan  = 'free';
        $reset_label   = '';

        if ( $has_api_key ) {
            $account_info = QAProof_API_Client::get_account_info();
            if ( ! is_wp_error( $account_info ) && isset( $account_info['workspace'] ) ) {
                $ws            = $account_info['workspace'];
                $ai_used       = (int) ( $ws['aiGenerations']['used']  ?? 0 );
                $ai_limit      = (int) ( $ws['aiGenerations']['limit'] ?? 20 );
                $monitor_limit = (int) ( $ws['monitors']['limit']      ?? 1 );
                $account_plan  = ucfirst( $ws['plan'] ?? 'free' );
            }
        }

        $ai_pct      = $ai_limit > 0 ? round( $ai_used / $ai_limit * 100 ) : 0;
        $reset_ts    = mktime( 0, 0, 0, (int) gmdate( 'n' ) + 1, 1 );
        /* translators: %s: reset date (e.g. "Jun 1, 2026") */
        $reset_label = sprintf( __( 'Resets on %s', 'qaproof' ), wp_date( 'M j, Y', $reset_ts ) );

        $ring_radius    = 44;
        $circumference  = 2 * 3.14159 * $ring_radius;
        $score_pct      = $avg_score !== null ? $avg_score / 100 : 0;
        $dash_offset    = $circumference * ( 1 - $score_pct );
        $ring_color     = '#00ADB5';
        if ( $avg_score !== null && $avg_score < 70 ) $ring_color = '#EF4444';
        elseif ( $avg_score !== null && $avg_score < 85 ) $ring_color = '#F0B429';

        $tests_slug         = self::TESTS_SLUG;
        $accessibility_slug = self::ACCESSIBILITY_SLUG;
        $monitors_slug      = self::MONITORS_SLUG;
        $settings_slug      = self::SETTINGS_SLUG;

        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-dashboard.php';
    }

    public static function get_score_class( $score ) {
        if ( $score >= 90 ) return 'score-high';
        if ( $score >= 70 ) return 'score-medium';
        return 'score-low';
    }

    public static function render_tests_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $settings_url = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-tests.php';
    }

    public static function render_accessibility_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $settings_url = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-accessibility.php';
    }

    private static function render_test_history_section( $qaproof_prefix, $qaproof_filters = [], $qaproof_inline = false ) {
        include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-test-history.php';
    }
}
