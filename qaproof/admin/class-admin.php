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
        add_action( 'wp_ajax_qaproof_health_check', [ 'QAProof_Admin_AJAX', 'ajax_health_check' ] );
        add_action( 'wp_ajax_qaproof_save_history', [ 'QAProof_Admin_AJAX', 'ajax_save_history' ] );
        add_action( 'wp_ajax_qaproof_diagnose', [ 'QAProof_Admin_AJAX', 'ajax_diagnose' ] );
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

        $monitors       = QAProof_Monitor::get_all();
        $total_monitors = count( $monitors );
        $active_monitors = 0;

        foreach ( $monitors as $m ) {
            if ( (int) $m['is_enabled'] ) $active_monitors++;
        }

        $default_threshold = (int) get_option( 'qaproof_default_threshold', 95 );
        $history_stats     = QAProof_Test_History::get_stats( $default_threshold );
        $total_tests       = $history_stats['total'];
        $avg_score         = $history_stats['avg_score'];
        $has_api_key       = ! empty( QAProof_Settings::get_api_key() );

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
