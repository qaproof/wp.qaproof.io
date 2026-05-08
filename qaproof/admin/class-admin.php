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
        add_action( 'wp_ajax_qaproof_save_history',       [ 'QAProof_Admin_AJAX', 'ajax_save_history' ] );
        add_action( 'wp_ajax_qaproof_fetch_account_info', [ 'QAProof_Admin_AJAX', 'ajax_fetch_account_info' ] );
        // Hook at priority -999 so we run first and can remove all subsequent notice callbacks
        add_action( 'admin_notices',         [ __CLASS__, 'suppress_third_party_notices' ], -999 );
        add_action( 'all_admin_notices',     [ __CLASS__, 'suppress_third_party_notices' ], -999 );
        add_action( 'network_admin_notices', [ __CLASS__, 'suppress_third_party_notices' ], -999 );
    }

    /**
     * Remove all third-party admin notices on QAProof pages.
     * Runs at priority -999 so it fires before any other notice callbacks.
     */
    public static function suppress_third_party_notices() {
        $screen = get_current_screen();
        if ( ! $screen ) return;

        $qaproof_pages = [
            'toplevel_page_qaproof',
            'qaproof_page_qaproof-tests',
            'qaproof_page_qaproof-accessibility',
            'qaproof_page_qaproof-monitors',
            'qaproof_page_qaproof-settings',
        ];

        if ( in_array( $screen->id, $qaproof_pages, true ) ) {
            remove_all_actions( 'admin_notices' );
            remove_all_actions( 'all_admin_notices' );
            remove_all_actions( 'network_admin_notices' );
        }
    }

    // ============================
    // Menu
    // ============================
    public static function register_menu() {
        add_menu_page(
            __( 'QAProof', 'qaproof' ),
            __( 'QAProof', 'qaproof' ),
            self::CAPABILITY,
            self::MENU_SLUG,
            [ __CLASS__, 'render_dashboard_page' ],
            'data:image/svg+xml;base64,' . base64_encode( file_get_contents( plugin_dir_path( __FILE__ ) . 'images/icon.svg' ) ),
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

    // ============================
    // REST API Routes
    // ============================
    public static function register_rest_routes() {
        $permission = function() {
            return current_user_can( self::CAPABILITY );
        };

        // Tests
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

        register_rest_route( self::REST_NAMESPACE, '/save-test-result', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Tests', 'handle_save_test_result' ],
            'permission_callback' => $permission,
        ]);

        // Monitors
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

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)', [
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

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)/run', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_run_monitor' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)/results', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_get_results' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/results/(?P<id>\d+)/approve', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_approve_result' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/notifications/clear', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Monitors', 'handle_clear_notifications' ],
            'permission_callback' => $permission,
        ]);

        // Designs / Figma
        register_rest_route( self::REST_NAMESPACE, '/figma-preview', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_figma_preview' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/save-design-image', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_save_design_image' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/saved-design-image/(?P<id>[a-f0-9]+)', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_get_design_image' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/save-design-elements', [
            'methods'             => 'POST',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_save_design_elements' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/saved-design-elements/(?P<id>[a-f0-9]+)', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_Designs', 'handle_get_design_elements' ],
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
                // Usage is now per-fileKey; byFile map carries each file's
                // own rateLimit. Aggregate total/byType are derived for
                // glance views.
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

        // Send Report via Email (PDF attachment)
        register_rest_route( self::REST_NAMESPACE, '/send-report-email', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_send_report_email' ],
            'permission_callback' => $permission,
        ]);

        // Feedback (GET = list, POST = submit)
        register_rest_route( self::REST_NAMESPACE, '/feedback', [
            [
                'methods'             => 'GET',
                'callback'            => [ __CLASS__, 'handle_get_feedback' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ __CLASS__, 'handle_submit_feedback' ],
                'permission_callback' => $permission,
            ],
        ]);

        // Test History
        register_rest_route( self::REST_NAMESPACE, '/test-history', [
            'methods'             => 'GET',
            'callback'            => [ 'QAProof_Admin_REST_History', 'handle_list_test_history' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/test-history/(?P<id>\d+)', [
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

    // ============================
    // Email Report Handler
    // ============================
    public static function handle_send_report_email( WP_REST_Request $request ) {
        $pdf_base64 = $request->get_param( 'pdfBase64' );
        $file_name  = sanitize_file_name( $request->get_param( 'fileName' ) ?: 'qaproof-report.pdf' );
        $test_type  = sanitize_text_field( $request->get_param( 'testType' ) ?: 'Accessibility' );
        $page_url   = esc_url_raw( $request->get_param( 'pageUrl' ) ?: '' );
        $score      = intval( $request->get_param( 'score' ) ?: 0 );

        if ( empty( $pdf_base64 ) ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'No PDF data provided.' ], 400 );
        }

        // Decode PDF and save to temp file
        $pdf_data = base64_decode( preg_replace( '/^data:application\/pdf;base64,/', '', $pdf_base64 ) );
        if ( ! $pdf_data ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'Invalid PDF data.' ], 400 );
        }

        $tmp_file = wp_tempnam( $file_name );
        if ( ! $tmp_file || file_put_contents( $tmp_file, $pdf_data ) === false ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'Could not create temp file.' ], 500 );
        }

        // Rename temp file to have .pdf extension (required for wp_mail attachment)
        $pdf_tmp = $tmp_file . '.pdf';
        rename( $tmp_file, $pdf_tmp );

        // Recipient: use notify_email setting or fall back to admin email
        $to      = get_option( 'qaproof_notify_email', get_option( 'admin_email' ) );
        $subject = sprintf( '[QAProof] %s Report — Score %d/100', ucfirst( $test_type ), $score );
        $body    = sprintf(
            "Hello,\n\nYour QAProof %s report is attached.\n\nPage: %s\nScore: %d/100\n\nGenerated by QAProof — qaproof.io",
            ucfirst( $test_type ),
            $page_url ?: '(not specified)',
            $score
        );
        $headers     = [ 'Content-Type: text/plain; charset=UTF-8' ];
        $attachments = [ $pdf_tmp ];

        $sent = wp_mail( $to, $subject, $body, $headers, $attachments );

        // Clean up temp file
        @unlink( $pdf_tmp );

        if ( ! $sent ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'wp_mail() failed. Check your server email configuration.' ], 500 );
        }

        return new WP_REST_Response( [ 'success' => true, 'sentTo' => $to ], 200 );
    }

    // ============================
    // Feedback Handlers
    // ============================
    public static function handle_submit_feedback( WP_REST_Request $request ) {
        $rating   = intval( $request->get_param( 'rating' ) );
        $comment  = sanitize_textarea_field( $request->get_param( 'comment' ) ?: '' );
        $test_type = sanitize_text_field( $request->get_param( 'testType' ) ?: '' );
        $page_url  = esc_url_raw( $request->get_param( 'pageUrl' ) ?: '' );
        $score     = intval( $request->get_param( 'score' ) ?: 0 );

        if ( $rating < 1 || $rating > 5 ) {
            return new WP_REST_Response( [ 'success' => false, 'error' => 'Rating must be 1–5.' ], 400 );
        }

        $entry = [
            'id'        => uniqid( 'fb_', true ),
            'rating'    => $rating,
            'comment'   => $comment,
            'testType'  => $test_type,
            'pageUrl'   => $page_url,
            'score'     => $score,
            'userId'    => get_current_user_id(),
            'createdAt' => current_time( 'mysql' ),
        ];

        // Store in wp_options (keep last 200 entries)
        $feedback = get_option( 'qaproof_feedback_log', [] );
        array_unshift( $feedback, $entry );
        if ( count( $feedback ) > 200 ) {
            $feedback = array_slice( $feedback, 0, 200 );
        }
        update_option( 'qaproof_feedback_log', $feedback );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_get_feedback( WP_REST_Request $request ) {
        $feedback = get_option( 'qaproof_feedback_log', [] );
        return new WP_REST_Response( [ 'success' => true, 'data' => $feedback, 'total' => count( $feedback ) ], 200 );
    }

    // ============================
    // Page Renderers
    // ============================
    private static function render_theme_toggle() {
        include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-theme-toggle.php';
    }

    public static function render_settings_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $active_tab    = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general';
        $active_subtab = isset( $_GET['subtab'] ) ? sanitize_key( $_GET['subtab'] ) : 'general';
        $base_url      = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-settings.php';
    }

    public static function render_monitors_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $settings_url = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        include QAPROOF_PLUGIN_DIR . 'admin/partials/page-monitors.php';
    }


    public static function render_dashboard_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;

        $monitors        = QAProof_Monitor::get_all();
        $total_monitors  = count( $monitors );
        $active_monitors = 0;

        foreach ( $monitors as $m ) {
            if ( (int) $m['is_enabled'] ) $active_monitors++;
        }

        $default_threshold = (int) get_option( 'qaproof_default_threshold', 95 );
        $history_stats     = QAProof_Test_History::get_stats( $default_threshold );
        $total_tests       = $history_stats['total'];
        $avg_score         = $history_stats['avg_score'];
        $has_api_key       = ! empty( QAProof_Settings::get_api_key() );

        // Fetch live account data from API (AI generations + plan + monitor limit)
        $ai_used       = 0;
        $ai_limit      = 20;
        $monitor_limit = 1; // free-plan default
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
        // Reset label: first day of next month
        $reset_ts    = mktime( 0, 0, 0, (int) date('n') + 1, 1 );
        $reset_label = 'Resets on ' . date( 'M j, Y', $reset_ts );

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

    private static function render_test_history_section( $prefix, $filters = [], $inline = false ) {
        include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-test-history.php';
    }
}
