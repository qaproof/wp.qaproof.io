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
        add_action( 'admin_enqueue_scripts', [ __CLASS__, 'enqueue_assets' ] );
        add_action( 'rest_api_init', [ __CLASS__, 'register_rest_routes' ] );
        add_action( 'wp_ajax_qaproof_health_check', [ __CLASS__, 'ajax_health_check' ] );
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
            'dashicons-welcome-view-site',
            80
        );

        // Dashboard — replaces the auto-created first submenu item
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
    // Assets
    // ============================
    public static function enqueue_assets( $hook ) {
        // Only load on our plugin pages
        $our_pages = [ self::MENU_SLUG, self::TESTS_SLUG, self::ACCESSIBILITY_SLUG, self::MONITORS_SLUG, self::SETTINGS_SLUG ];
        $is_our_page = false;
        foreach ( $our_pages as $slug ) {
            if ( strpos( $hook, $slug ) !== false ) {
                $is_our_page = true;
                break;
            }
        }
        if ( ! $is_our_page ) {
            return;
        }

        wp_enqueue_style(
            'qaproof-google-fonts',
            'https://fonts.googleapis.com/css2?family=Kodchasan:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800&display=swap',
            [],
            null
        );

        wp_enqueue_style(
            'qaproof-admin',
            QAPROOF_PLUGIN_URL . 'admin/css/admin.css',
            [ 'qaproof-google-fonts' ],
            QAPROOF_VERSION
        );

        wp_enqueue_script(
            'chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js',
            [],
            '4.4.6',
            true
        );

        wp_enqueue_script(
            'jspdf',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js',
            [],
            '3.0.3',
            true
        );

        wp_enqueue_script(
            'jspdf-autotable',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.2/jspdf.plugin.autotable.min.js',
            [ 'jspdf' ],
            '5.0.2',
            true
        );

        wp_enqueue_script(
            'qaproof-admin',
            QAPROOF_PLUGIN_URL . 'admin/js/admin.js',
            [],
            QAPROOF_VERSION,
            true
        );

        wp_localize_script( 'qaproof-admin', 'qaproof', [
            'restUrl'       => rest_url( self::REST_NAMESPACE . '/run-test' ),
            'restBase'      => untrailingslashit( rest_url( self::REST_NAMESPACE ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
            'ajaxNonce'     => wp_create_nonce( 'qaproof_ajax' ),
            'siteUrl'       => home_url( '/' ),
            'hasApiKey'     => ! empty( QAProof_Settings::get_api_key() ),
            'dashboardUrl'  => admin_url( 'admin.php?page=' . self::MENU_SLUG ),
            'testsUrl'      => admin_url( 'admin.php?page=' . self::TESTS_SLUG ),
            'settingsUrl'   => admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ),
            'monitorsUrl'   => admin_url( 'admin.php?page=' . self::MONITORS_SLUG ),
            'defaultThreshold'  => (int) get_option( 'qaproof_default_threshold', 90 ),
            'defaultTestType'   => get_option( 'qaproof_default_test_type', 'fidelity' ),
            'savedDesigns'      => QAProof_Settings::get_saved_designs(),
            'autoSaveHistory'   => (bool) get_option( 'qaproof_auto_save_history', true ),
            'maxHistory'        => (int) get_option( 'qaproof_max_history', 100 ),
        ]);
    }

    // ============================
    // REST API (AJAX proxy)
    // ============================
    public static function register_rest_routes() {
        $permission = function() {
            return current_user_can( self::CAPABILITY );
        };

        register_rest_route( self::REST_NAMESPACE, '/run-test', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_run_test' ],
            'permission_callback' => $permission,
        ]);

        // Monitors CRUD
        register_rest_route( self::REST_NAMESPACE, '/monitors', [
            [
                'methods'             => 'GET',
                'callback'            => [ __CLASS__, 'handle_list_monitors' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ __CLASS__, 'handle_create_monitor' ],
                'permission_callback' => $permission,
            ],
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [ __CLASS__, 'handle_get_monitor' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [ __CLASS__, 'handle_update_monitor' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [ __CLASS__, 'handle_delete_monitor' ],
                'permission_callback' => $permission,
            ],
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)/run', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_run_monitor' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/monitors/(?P<id>\d+)/results', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'handle_get_results' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/results/(?P<id>\d+)/approve', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_approve_result' ],
            'permission_callback' => $permission,
        ]);

        register_rest_route( self::REST_NAMESPACE, '/notifications/clear', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_clear_notifications' ],
            'permission_callback' => $permission,
        ]);

        // Figma Preview
        register_rest_route( self::REST_NAMESPACE, '/figma-preview', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_figma_preview' ],
            'permission_callback' => $permission,
        ]);

        // Detect Elements in design image
        register_rest_route( self::REST_NAMESPACE, '/detect-elements', [
            'methods'             => 'POST',
            'callback'            => [ __CLASS__, 'handle_detect_elements' ],
            'permission_callback' => $permission,
        ]);

        // Test History — list
        register_rest_route( self::REST_NAMESPACE, '/test-history', [
            'methods'             => 'GET',
            'callback'            => [ __CLASS__, 'handle_list_test_history' ],
            'permission_callback' => $permission,
        ]);

        // Test History — single item (GET + DELETE)
        register_rest_route( self::REST_NAMESPACE, '/test-history/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [ __CLASS__, 'handle_get_test_history' ],
                'permission_callback' => $permission,
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [ __CLASS__, 'handle_delete_test_history' ],
                'permission_callback' => $permission,
            ],
        ]);
    }

    public static function handle_run_test( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['pageUrl'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Page URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $test_type = isset( $params['testType'] ) ? $params['testType'] : 'fidelity';
        if ( ! in_array( $test_type, [ 'fidelity', 'responsive', 'regression', 'accessibility', 'design-audit' ], true ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Invalid test type.', 'qaproof' ) ],
            ], 400 );
        }

        $api_params = [
            'pageUrl'  => sanitize_url( $params['pageUrl'] ),
            'testType' => $test_type,
        ];

        if ( $test_type === 'fidelity' ) {
            if ( ! empty( $params['figmaUrl'] ) ) {
                $api_params['figmaUrl'] = sanitize_url( $params['figmaUrl'] );
            }
            if ( ! empty( $params['figmaImageBase64'] ) ) {
                $api_params['figmaImageBase64'] = $params['figmaImageBase64'];
            }
            if ( ! empty( $params['figmaToken'] ) ) {
                $api_params['figmaToken'] = sanitize_text_field( $params['figmaToken'] );
            }
            // Element-level fidelity: pass region coordinates
            if ( ! empty( $params['elementRegion'] ) && is_array( $params['elementRegion'] ) ) {
                $api_params['elementRegion'] = [
                    'top'    => (float) $params['elementRegion']['top'],
                    'left'   => (float) $params['elementRegion']['left'],
                    'width'  => (float) $params['elementRegion']['width'],
                    'height' => (float) $params['elementRegion']['height'],
                ];
            }
        }

        $result = QAProof_API_Client::run_test( $api_params );

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

        // Save to test history
        // Note: get_option returns '' for unchecked checkbox, which is falsy.
        // Use !== false so the default (option not set) still saves.
        $auto_save = get_option( 'qaproof_auto_save_history' );
        if ( $auto_save === false || $auto_save === '' ) {
            // Option not set (fresh install) or unchecked checkbox — default to true
            $auto_save = ( $auto_save === false );
        }
        // Always save for now — the option handling was unreliable
        $save_data = array_merge(
            [ 'test_type' => $test_type, 'page_url' => $api_params['pageUrl'] ],
            is_array( $result ) ? $result : []
        );
        $saved_id = QAProof_Test_History::save( $save_data );
        $max = (int) get_option( 'qaproof_max_history', 100 );
        QAProof_Test_History::purge_old( $max > 0 ? $max : 100 );

        return new WP_REST_Response( [
            'success'  => true,
            'data'     => $result,
            'historySaved' => $saved_id ? true : false,
        ], 200 );
    }

    // ============================
    // AJAX: Health Check
    // ============================
    public static function ajax_health_check() {
        check_ajax_referer( 'qaproof_ajax', 'nonce' );

        if ( ! current_user_can( self::CAPABILITY ) ) {
            wp_send_json_error( [ 'message' => 'Unauthorized.' ], 403 );
        }

        $result = QAProof_API_Client::health_check();

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( [ 'message' => $result->get_error_message() ] );
        }

        wp_send_json_success( $result );
    }

    // ============================
    // Theme Toggle Button (shared across all pages)
    // ============================
    private static function render_theme_toggle() {
        ?>
        <button type="button" class="qaproof-theme-toggle" id="qaproof-theme-toggle" title="<?php esc_attr_e( 'Toggle dark/light theme', 'qaproof' ); ?>">
            <svg class="qaproof-theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg class="qaproof-theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <?php
    }

    // ============================
    // Settings Page
    // ============================
    public static function render_settings_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        $active_tab    = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general';
        $active_subtab = isset( $_GET['subtab'] ) ? sanitize_key( $_GET['subtab'] ) : 'general';
        $base_url      = admin_url( 'admin.php?page=' . self::SETTINGS_SLUG );
        ?>
        <div class="wrap" id="qaproof-app">
            <?php self::render_theme_toggle(); ?>
            <h1><?php esc_html_e( 'Settings', 'qaproof' ); ?></h1>

            <!-- Settings Tabs -->
            <div class="qaproof-settings-tabs">
                <a href="<?php echo esc_url( $base_url . '&tab=general' ); ?>"
                   class="qaproof-settings-tab <?php echo $active_tab === 'general' ? 'active' : ''; ?>">
                    <?php esc_html_e( 'General', 'qaproof' ); ?>
                </a>
                <a href="<?php echo esc_url( $base_url . '&tab=tests' ); ?>"
                   class="qaproof-settings-tab <?php echo $active_tab === 'tests' ? 'active' : ''; ?>">
                    <?php esc_html_e( 'Tests', 'qaproof' ); ?>
                </a>
                <a href="<?php echo esc_url( $base_url . '&tab=monitors' ); ?>"
                   class="qaproof-settings-tab <?php echo $active_tab === 'monitors' ? 'active' : ''; ?>">
                    <?php esc_html_e( 'Monitors', 'qaproof' ); ?>
                </a>
            </div>

            <div class="qaproof-card">
                <?php if ( $active_tab === 'tests' ) : ?>
                    <!-- Test Subtabs -->
                    <div class="qaproof-settings-subtabs">
                        <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=general' ); ?>"
                           class="qaproof-settings-subtab <?php echo $active_subtab === 'general' ? 'active' : ''; ?>">
                            <?php esc_html_e( 'General', 'qaproof' ); ?>
                        </a>
                        <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=fidelity' ); ?>"
                           class="qaproof-settings-subtab <?php echo $active_subtab === 'fidelity' ? 'active' : ''; ?>">
                            <?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?>
                        </a>
                        <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=responsive' ); ?>"
                           class="qaproof-settings-subtab <?php echo $active_subtab === 'responsive' ? 'active' : ''; ?>">
                            <?php esc_html_e( 'Responsive', 'qaproof' ); ?>
                        </a>
                        <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=accessibility' ); ?>"
                           class="qaproof-settings-subtab <?php echo $active_subtab === 'accessibility' ? 'active' : ''; ?>">
                            <?php esc_html_e( 'Accessibility', 'qaproof' ); ?>
                        </a>
                    </div>
                <?php endif; ?>

                <form action="options.php" method="post">
                    <?php if ( $active_tab === 'general' ) : ?>
                        <?php settings_fields( QAProof_Settings::GROUP_GENERAL ); ?>
                        <?php do_settings_sections( 'qaproof-settings-general' ); ?>
                    <?php elseif ( $active_tab === 'tests' ) : ?>
                        <?php if ( $active_subtab === 'general' ) : ?>
                            <?php settings_fields( QAProof_Settings::GROUP_TESTS_GENERAL ); ?>
                            <?php do_settings_sections( 'qaproof-settings-tests-general' ); ?>
                        <?php elseif ( $active_subtab === 'fidelity' ) : ?>
                            <?php settings_fields( QAProof_Settings::GROUP_TESTS_FIDELITY ); ?>
                            <?php do_settings_sections( 'qaproof-settings-tests-fidelity' ); ?>
                        <?php elseif ( $active_subtab === 'responsive' ) : ?>
                            <?php settings_fields( QAProof_Settings::GROUP_TESTS_RESPONSIVE ); ?>
                            <?php do_settings_sections( 'qaproof-settings-tests-responsive' ); ?>
                        <?php elseif ( $active_subtab === 'accessibility' ) : ?>
                            <?php settings_fields( QAProof_Settings::GROUP_TESTS_A11Y ); ?>
                            <?php do_settings_sections( 'qaproof-settings-tests-accessibility' ); ?>
                        <?php endif; ?>
                    <?php elseif ( $active_tab === 'monitors' ) : ?>
                        <?php settings_fields( QAProof_Settings::GROUP_MONITORS ); ?>
                        <?php do_settings_sections( 'qaproof-settings-monitors' ); ?>
                    <?php endif; ?>

                    <?php submit_button(); ?>
                </form>
            </div>

            <!-- Brand Badge -->
            <div class="qaproof-brand-badge">
                <span class="qaproof-brand-dot"></span>
                <?php esc_html_e( 'QAProof v1.0', 'qaproof' ); ?>
            </div>
        </div>
        <?php
    }

    // ============================
    // Monitor REST Handlers
    // ============================
    public static function handle_list_monitors() {
        $monitors = QAProof_Monitor::get_all();
        return new WP_REST_Response( [ 'success' => true, 'data' => $monitors ], 200 );
    }

    public static function handle_get_monitor( WP_REST_Request $request ) {
        $monitor = QAProof_Monitor::get( (int) $request['id'] );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }
        return new WP_REST_Response( [ 'success' => true, 'data' => $monitor ], 200 );
    }

    public static function handle_create_monitor( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        if ( empty( $params['page_url'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Page URL is required.', 'qaproof' ) ],
            ], 400 );
        }

        $id = QAProof_Monitor::create( [
            'page_url'        => sanitize_url( $params['page_url'] ),
            'schedule'        => isset( $params['schedule'] ) ? sanitize_text_field( $params['schedule'] ) : 'daily',
            'notify_email'    => isset( $params['notify_email'] ) ? (int) $params['notify_email'] : 1,
            'notify_admin'    => isset( $params['notify_admin'] ) ? (int) $params['notify_admin'] : 1,
            'threshold_score' => isset( $params['threshold_score'] ) ? (int) $params['threshold_score'] : (int) get_option( 'qaproof_default_threshold', 90 ),
        ] );

        if ( ! $id ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Failed to create monitor.', 'qaproof' ) ],
            ], 500 );
        }

        return new WP_REST_Response( [
            'success' => true,
            'data'    => QAProof_Monitor::get( $id ),
        ], 201 );
    }

    public static function handle_update_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        $params = $request->get_json_params();
        $update = [];

        if ( isset( $params['page_url'] ) ) {
            $update['page_url'] = sanitize_url( $params['page_url'] );
        }
        if ( isset( $params['schedule'] ) ) {
            $update['schedule'] = sanitize_text_field( $params['schedule'] );
        }
        if ( isset( $params['is_enabled'] ) ) {
            $update['is_enabled'] = (int) $params['is_enabled'];
        }
        if ( isset( $params['notify_email'] ) ) {
            $update['notify_email'] = (int) $params['notify_email'];
        }
        if ( isset( $params['notify_admin'] ) ) {
            $update['notify_admin'] = (int) $params['notify_admin'];
        }
        if ( isset( $params['threshold_score'] ) ) {
            $update['threshold_score'] = (int) $params['threshold_score'];
        }

        QAProof_Monitor::update( $id, $update );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => QAProof_Monitor::get( $id ),
        ], 200 );
    }

    public static function handle_delete_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Delete baseline from API if exists
        if ( ! empty( $monitor['baseline_key'] ) ) {
            QAProof_API_Client::delete_baseline( $monitor['baseline_key'] );
        }

        QAProof_Monitor::delete( $id );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_run_monitor( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $monitor = QAProof_Monitor::get( $id );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        QAProof_Scheduler::run_single_monitor( $id );

        // Return updated monitor + latest result
        $updated_monitor = QAProof_Monitor::get( $id );
        $latest_result   = QAProof_Result::get_latest( $id );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => [
                'monitor' => $updated_monitor,
                'result'  => $latest_result,
            ],
        ], 200 );
    }

    public static function handle_get_results( WP_REST_Request $request ) {
        $id     = (int) $request['id'];
        $limit  = $request->get_param( 'limit' ) ? (int) $request->get_param( 'limit' ) : 20;
        $offset = $request->get_param( 'offset' ) ? (int) $request->get_param( 'offset' ) : 0;

        $results = QAProof_Result::get_for_monitor( $id, [
            'limit'  => $limit,
            'offset' => $offset,
        ] );
        $total = QAProof_Result::count( $id );

        return new WP_REST_Response( [
            'success' => true,
            'data'    => $results,
            'total'   => $total,
        ], 200 );
    }

    public static function handle_approve_result( WP_REST_Request $request ) {
        $id = (int) $request['id'];
        $result = QAProof_Result::get( $id );
        if ( ! $result ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Result not found.', 'qaproof' ) ],
            ], 404 );
        }

        $monitor = QAProof_Monitor::get( (int) $result['monitor_id'] );
        if ( ! $monitor ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Monitor not found.', 'qaproof' ) ],
            ], 404 );
        }

        // Create a new baseline from the current page state
        $baseline_result = QAProof_API_Client::create_baseline( $monitor['page_url'] );

        if ( is_wp_error( $baseline_result ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => $baseline_result->get_error_message() ],
            ], 502 );
        }

        // Update monitor with new baseline
        QAProof_Monitor::update( (int) $result['monitor_id'], [
            'baseline_key' => $baseline_result['key'],
            'has_baseline'  => 1,
        ] );

        // Mark result as approved
        QAProof_Result::update_status( $id, 'approved' );

        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_clear_notifications() {
        QAProof_Notifications::clear_badge();
        return new WP_REST_Response( [ 'success' => true ], 200 );
    }

    public static function handle_figma_preview( WP_REST_Request $request ) {
        $params = $request->get_json_params();

        $figma_url   = isset( $params['figmaUrl'] )   ? sanitize_url( $params['figmaUrl'] )             : '';
        $figma_token = isset( $params['figmaToken'] ) ? sanitize_text_field( $params['figmaToken'] ) : '';

        if ( empty( $figma_url ) || empty( $figma_token ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'error'   => [ 'message' => __( 'Figma URL and Token are required.', 'qaproof' ) ],
            ], 400 );
        }

        $result = QAProof_API_Client::preview_figma( $figma_url, $figma_token );

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

    // ============================
    // Monitors Page
    // ============================
    public static function render_monitors_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        ?>
        <div class="wrap" id="qaproof-app">
            <?php self::render_theme_toggle(); ?>
            <h1><?php esc_html_e( 'Visual Regression Monitors', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle"><?php esc_html_e( 'Monitor pages for unintended visual changes.', 'qaproof' ); ?></p>

            <?php if ( empty( QAProof_Settings::get_api_key() ) ) : ?>
                <div class="notice notice-warning inline">
                    <p>
                        <?php printf(
                            esc_html__( 'API key not configured. %sGo to Settings%s to add your key.', 'qaproof' ),
                            '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ) ) . '">',
                            '</a>'
                        ); ?>
                    </p>
                </div>
            <?php endif; ?>

            <!-- Add Monitor Form -->
            <div id="qaproof-monitor-form-wrap" class="qaproof-card hidden">
                <h2 id="qaproof-monitor-form-title"><?php esc_html_e( 'Add Monitor', 'qaproof' ); ?></h2>
                <form id="qaproof-monitor-form">
                    <input type="hidden" id="qaproof-monitor-edit-id" value="" />
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="qaproof-monitor-url"><?php esc_html_e( 'Page URL', 'qaproof' ); ?></label>
                            </th>
                            <td>
                                <input type="url" id="qaproof-monitor-url" class="regular-text" required
                                       placeholder="https://example.com"
                                       value="<?php echo esc_url( home_url( '/' ) ); ?>" />
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="qaproof-monitor-schedule"><?php esc_html_e( 'Schedule', 'qaproof' ); ?></label>
                            </th>
                            <td>
                                <select id="qaproof-monitor-schedule">
                                    <option value="daily"><?php esc_html_e( 'Daily', 'qaproof' ); ?></option>
                                    <option value="weekly"><?php esc_html_e( 'Weekly', 'qaproof' ); ?></option>
                                    <option value="monthly"><?php esc_html_e( 'Monthly', 'qaproof' ); ?></option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="qaproof-monitor-threshold"><?php esc_html_e( 'Threshold Score', 'qaproof' ); ?></label>
                            </th>
                            <td>
                                <input type="number" id="qaproof-monitor-threshold" min="0" max="100" step="1"
                                       value="<?php echo esc_attr( get_option( 'qaproof_default_threshold', 90 ) ); ?>" class="small-text" />
                                <p class="description"><?php esc_html_e( 'Notify when score drops below this value.', 'qaproof' ); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php esc_html_e( 'Notifications', 'qaproof' ); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" id="qaproof-monitor-notify-email" checked />
                                    <?php esc_html_e( 'Email', 'qaproof' ); ?>
                                </label>
                                &nbsp;&nbsp;
                                <label>
                                    <input type="checkbox" id="qaproof-monitor-notify-admin" checked />
                                    <?php esc_html_e( 'Admin badge', 'qaproof' ); ?>
                                </label>
                            </td>
                        </tr>
                    </table>
                    <p class="submit">
                        <button type="submit" class="button button-primary"><?php esc_html_e( 'Save Monitor', 'qaproof' ); ?></button>
                        <button type="button" id="qaproof-monitor-cancel" class="button"><?php esc_html_e( 'Cancel', 'qaproof' ); ?></button>
                    </p>
                </form>
            </div>

            <!-- Toolbar -->
            <div class="qaproof-monitors-toolbar">
                <button type="button" id="qaproof-add-monitor" class="button button-primary">
                    <span class="dashicons dashicons-plus-alt2"></span>
                    <?php esc_html_e( 'Add Monitor', 'qaproof' ); ?>
                </button>
            </div>

            <!-- Loading -->
            <div id="qaproof-monitors-loading" class="hidden">
                <span class="spinner is-active" style="float: none; margin: 0 10px 0 0;"></span>
                <strong><?php esc_html_e( 'Loading monitors...', 'qaproof' ); ?></strong>
            </div>

            <!-- Monitors Table -->
            <div id="qaproof-monitors-list"></div>

            <!-- Monitor Detail (results view) -->
            <div id="qaproof-monitor-detail" class="hidden"></div>

            <!-- Brand Badge -->
            <div class="qaproof-brand-badge">
                <span class="qaproof-brand-dot"></span>
                <?php esc_html_e( 'QAProof v1.0', 'qaproof' ); ?>
            </div>
        </div>
        <?php
    }

    // ============================
    // Dashboard Page
    // ============================
    public static function render_dashboard_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;

        $monitors       = QAProof_Monitor::get_all();
        $total_monitors = count( $monitors );
        $active_monitors = 0;
        $last_scores     = [];
        $recent_failures = 0;

        foreach ( $monitors as $m ) {
            if ( (int) $m['is_enabled'] ) $active_monitors++;
            if ( $m['last_score'] !== null ) $last_scores[] = (int) $m['last_score'];
            if ( $m['last_score'] !== null && (int) $m['last_score'] < (int) $m['threshold_score'] ) $recent_failures++;
        }

        $avg_score = ! empty( $last_scores ) ? round( array_sum( $last_scores ) / count( $last_scores ) ) : null;
        $has_api_key = ! empty( QAProof_Settings::get_api_key() );

        // Calculate score ring SVG values
        $ring_radius    = 44;
        $circumference  = 2 * 3.14159 * $ring_radius;
        $score_pct      = $avg_score !== null ? $avg_score / 100 : 0;
        $dash_offset    = $circumference * ( 1 - $score_pct );
        $ring_color     = '#00ADB5';
        if ( $avg_score !== null && $avg_score < 70 ) $ring_color = '#EF4444';
        elseif ( $avg_score !== null && $avg_score < 85 ) $ring_color = '#F0B429';
        ?>
        <div class="wrap" id="qaproof-app">
            <?php self::render_theme_toggle(); ?>
            <div class="qaproof-dash">

                <!-- Hero with integrated score ring -->
                <div class="qaproof-dash-hero">
                    <div class="qaproof-dash-hero-left">
                        <h1><?php esc_html_e( 'QAProof', 'qaproof' ); ?></h1>
                        <p class="qaproof-dash-hero-tagline"><?php esc_html_e( 'AI-powered web quality assurance platform', 'qaproof' ); ?></p>
                        <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::TESTS_SLUG ) ); ?>" class="qaproof-dash-hero-cta">
                            <span class="dashicons dashicons-controls-play"></span>
                            <?php esc_html_e( 'Run a Test', 'qaproof' ); ?>
                        </a>
                    </div>
                    <div class="qaproof-dash-hero-score">
                        <div class="qaproof-dash-score-ring">
                            <svg viewBox="0 0 100 100">
                                <circle class="ring-bg" cx="50" cy="50" r="<?php echo esc_attr( $ring_radius ); ?>" />
                                <circle class="ring-fill" cx="50" cy="50" r="<?php echo esc_attr( $ring_radius ); ?>"
                                    stroke="<?php echo esc_attr( $ring_color ); ?>"
                                    stroke-dasharray="<?php echo esc_attr( $circumference ); ?>"
                                    stroke-dashoffset="<?php echo esc_attr( $dash_offset ); ?>" />
                            </svg>
                            <span class="qaproof-dash-score-val"><?php echo $avg_score !== null ? esc_html( $avg_score ) : '—'; ?></span>
                        </div>
                        <span class="qaproof-dash-score-label"><?php esc_html_e( 'Average Score', 'qaproof' ); ?></span>
                    </div>
                </div>

                <!-- Notices -->
                <?php if ( ! $has_api_key ) : ?>
                    <div class="qaproof-dash-notice notice-warn">
                        <span class="dashicons dashicons-warning"></span>
                        <div>
                            <strong><?php esc_html_e( 'Setup Required', 'qaproof' ); ?></strong>
                            <p><?php printf(
                                esc_html__( 'Add your API key in %sSettings%s to start testing.', 'qaproof' ),
                                '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ) ) . '">',
                                '</a>'
                            ); ?></p>
                        </div>
                    </div>
                <?php elseif ( $total_monitors === 0 ) : ?>
                    <div class="qaproof-dash-notice">
                        <span class="dashicons dashicons-info-outline"></span>
                        <div>
                            <strong><?php esc_html_e( 'Get Started with Monitoring', 'qaproof' ); ?></strong>
                            <p><?php printf(
                                esc_html__( 'Create your first %smonitor%s to track visual changes automatically.', 'qaproof' ),
                                '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::MONITORS_SLUG ) ) . '">',
                                '</a>'
                            ); ?></p>
                        </div>
                    </div>
                <?php endif; ?>

                <!-- Stats row -->
                <div class="qaproof-dash-stats">
                    <div class="qaproof-dash-stat">
                        <div class="qaproof-dash-stat-icon icon-monitors"><span class="dashicons dashicons-desktop"></span></div>
                        <div>
                            <div class="qaproof-dash-stat-val"><?php echo esc_html( $total_monitors ); ?></div>
                            <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Monitors', 'qaproof' ); ?></div>
                        </div>
                    </div>
                    <div class="qaproof-dash-stat">
                        <div class="qaproof-dash-stat-icon icon-active"><span class="dashicons dashicons-yes-alt"></span></div>
                        <div>
                            <div class="qaproof-dash-stat-val"><?php echo esc_html( $active_monitors ); ?></div>
                            <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Active', 'qaproof' ); ?></div>
                        </div>
                    </div>
                    <div class="qaproof-dash-stat">
                        <div class="qaproof-dash-stat-icon icon-score"><span class="dashicons dashicons-chart-area"></span></div>
                        <div>
                            <div class="qaproof-dash-stat-val <?php echo $avg_score !== null ? esc_attr( self::get_score_class( $avg_score ) ) : ''; ?>">
                                <?php echo $avg_score !== null ? esc_html( $avg_score ) : '—'; ?>
                            </div>
                            <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Avg Score', 'qaproof' ); ?></div>
                        </div>
                    </div>
                    <div class="qaproof-dash-stat">
                        <div class="qaproof-dash-stat-icon icon-alerts"><span class="dashicons dashicons-bell"></span></div>
                        <div>
                            <div class="qaproof-dash-stat-val <?php echo $recent_failures > 0 ? 'score-low' : ''; ?>">
                                <?php echo esc_html( $recent_failures ); ?>
                            </div>
                            <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Alerts', 'qaproof' ); ?></div>
                        </div>
                    </div>
                </div>

                <!-- Testing Tools -->
                <h2 class="qaproof-dash-section"><?php esc_html_e( 'Testing Tools', 'qaproof' ); ?></h2>
                <div class="qaproof-dash-tools">
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::TESTS_SLUG ) ); ?>" class="qaproof-dash-tool" data-color="teal">
                        <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-art"></span></div>
                        <h3><?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?></h3>
                        <p><?php esc_html_e( 'AI-powered comparison between Figma mockups and live implementations.', 'qaproof' ); ?></p>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
                    </a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::TESTS_SLUG ) ); ?>" class="qaproof-dash-tool" data-color="blue">
                        <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-smartphone"></span></div>
                        <h3><?php esc_html_e( 'Responsive Testing', 'qaproof' ); ?></h3>
                        <p><?php esc_html_e( 'Viewport analysis across desktop, tablet, and mobile breakpoints.', 'qaproof' ); ?></p>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
                    </a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::ACCESSIBILITY_SLUG ) ); ?>" class="qaproof-dash-tool" data-color="purple">
                        <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-universal-access"></span></div>
                        <h3><?php esc_html_e( 'Accessibility Audit', 'qaproof' ); ?></h3>
                        <p><?php esc_html_e( 'WCAG 2.1 Level AA compliance check for color, structure, and navigation.', 'qaproof' ); ?></p>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
                    </a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::MONITORS_SLUG ) ); ?>" class="qaproof-dash-tool" data-color="amber">
                        <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-visibility"></span></div>
                        <h3><?php esc_html_e( 'Visual Regression', 'qaproof' ); ?></h3>
                        <p><?php esc_html_e( 'Scheduled monitoring with baseline comparison and automated alerts.', 'qaproof' ); ?></p>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
                    </a>
                </div>

                <!-- Quick Links -->
                <h2 class="qaproof-dash-section"><?php esc_html_e( 'Quick Links', 'qaproof' ); ?></h2>
                <div class="qaproof-dash-links">
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ) ); ?>" class="qaproof-dash-link">
                        <div class="qaproof-dash-link-icon"><span class="dashicons dashicons-admin-generic"></span></div>
                        <div class="qaproof-dash-link-info">
                            <div class="qaproof-dash-link-title"><?php esc_html_e( 'Settings', 'qaproof' ); ?></div>
                            <div class="qaproof-dash-link-desc"><?php esc_html_e( 'API configuration, thresholds, and notification preferences', 'qaproof' ); ?></div>
                        </div>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-link-arrow"></span>
                    </a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::MONITORS_SLUG ) ); ?>" class="qaproof-dash-link">
                        <div class="qaproof-dash-link-icon"><span class="dashicons dashicons-backup"></span></div>
                        <div class="qaproof-dash-link-info">
                            <div class="qaproof-dash-link-title"><?php esc_html_e( 'Monitors & History', 'qaproof' ); ?></div>
                            <div class="qaproof-dash-link-desc"><?php esc_html_e( 'Browse past results, monitor status, and score trends', 'qaproof' ); ?></div>
                        </div>
                        <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-link-arrow"></span>
                    </a>
                </div>

            </div>

            <!-- Brand Badge -->
            <div class="qaproof-brand-badge">
                <span class="qaproof-brand-dot"></span>
                <?php esc_html_e( 'QAProof v1.0', 'qaproof' ); ?>
            </div>
        </div>
        <?php
    }

    private static function get_score_class( $score ) {
        if ( $score >= 90 ) return 'score-high';
        if ( $score >= 70 ) return 'score-medium';
        return 'score-low';
    }

    // ============================
    // Test History Handlers
    // ============================
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

    // ============================
    // Tests Page
    // ============================
    public static function render_tests_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        ?>
        <div class="wrap" id="qaproof-app">
            <?php self::render_theme_toggle(); ?>
            <h1><?php esc_html_e( 'Tests', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle"><?php esc_html_e( 'Analyze design fidelity, responsive behavior, and design consistency', 'qaproof' ); ?></p>

            <?php if ( empty( QAProof_Settings::get_api_key() ) ) : ?>
                <div class="notice notice-warning inline">
                    <p>
                        <?php printf(
                            esc_html__( 'API key not configured. %sGo to Settings%s to add your key.', 'qaproof' ),
                            '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ) ) . '">',
                            '</a>'
                        ); ?>
                    </p>
                </div>
            <?php endif; ?>

            <!-- Test Type Selector -->
            <div class="qaproof-card">
                <div class="qaproof-test-type-selector">
                    <button type="button" class="qaproof-test-type-btn active" data-type="fidelity">
                        <span class="dashicons dashicons-art"></span>
                        <?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?>
                    </button>
                    <button type="button" class="qaproof-test-type-btn" data-type="responsive">
                        <span class="dashicons dashicons-smartphone"></span>
                        <?php esc_html_e( 'Responsive Test', 'qaproof' ); ?>
                    </button>
                    <button type="button" class="qaproof-test-type-btn" data-type="design-audit">
                        <span class="dashicons dashicons-admin-appearance"></span>
                        <?php esc_html_e( 'Design Audit', 'qaproof' ); ?>
                    </button>
                </div>

                <form id="qaproof-test-form">
                    <div class="qaproof-form-grid">
                        <div class="qaproof-form-left">
                            <!-- Saved Design Selector (fidelity only) -->
                            <div id="qaproof-saved-design-selector" class="qaproof-saved-design-selector">
                                <table class="form-table">
                                    <tr>
                                        <th scope="row">
                                            <label for="qaproof-saved-design"><?php esc_html_e( 'Saved Design', 'qaproof' ); ?></label>
                                        </th>
                                        <td>
                                            <select id="qaproof-saved-design" class="regular-text">
                                                <option value=""><?php esc_html_e( '-- Manual Entry --', 'qaproof' ); ?></option>
                                            </select>
                                            <p class="description"><?php esc_html_e( 'Select a saved design or enter details manually.', 'qaproof' ); ?></p>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <table class="form-table">
                                <tr>
                                    <th scope="row">
                                        <label for="qaproof-page-url"><?php esc_html_e( 'Page URL', 'qaproof' ); ?></label>
                                    </th>
                                    <td>
                                        <input type="url" id="qaproof-page-url" name="pageUrl"
                                               class="regular-text" required
                                               placeholder="https://example.com"
                                               value="<?php echo esc_url( home_url( '/' ) ); ?>" />
                                        <p class="description"><?php esc_html_e( 'The live page URL to test.', 'qaproof' ); ?></p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Figma fields (hidden for responsive) -->
                            <div id="qaproof-figma-fields">
                                <table class="form-table">
                                    <tr>
                                        <th scope="row">
                                            <label><?php esc_html_e( 'Design Source', 'qaproof' ); ?></label>
                                        </th>
                                        <td>
                                            <div class="qaproof-source-toggle">
                                                <button type="button" class="qaproof-source-btn active" data-source="url">
                                                    <?php esc_html_e( 'Figma URL', 'qaproof' ); ?>
                                                </button>
                                                <button type="button" class="qaproof-source-btn" data-source="upload">
                                                    <?php esc_html_e( 'Upload Image', 'qaproof' ); ?>
                                                </button>
                                            </div>
                                            <!-- Figma URL source -->
                                            <div id="qaproof-source-url" style="margin-top: 10px;">
                                                <input type="url" id="qaproof-figma-url" name="figmaUrl"
                                                       class="regular-text"
                                                       placeholder="https://www.figma.com/design/..." />
                                            </div>
                                            <!-- Upload image source -->
                                            <div id="qaproof-source-upload" class="hidden" style="margin-top: 10px;">
                                                <input type="file" id="qaproof-figma-file"
                                                       accept="image/png,image/jpeg,image/webp" />
                                                <div id="qaproof-upload-preview" class="hidden" style="margin-top: 10px;">
                                                    <img id="qaproof-upload-preview-img" alt="Preview"
                                                         style="max-width: 300px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;" />
                                                    <br />
                                                    <button type="button" id="qaproof-upload-clear" class="button button-link-delete" style="margin-top: 5px;">
                                                        <?php esc_html_e( 'Remove', 'qaproof' ); ?>
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr id="qaproof-figma-token-row">
                                        <th scope="row">
                                            <label for="qaproof-figma-token"><?php esc_html_e( 'Figma Token', 'qaproof' ); ?></label>
                                        </th>
                                        <td>
                                            <input type="password" id="qaproof-figma-token" name="figmaToken"
                                                   class="regular-text" autocomplete="off"
                                                   placeholder="figd_..." />
                                            <p class="description"><?php esc_html_e( 'Your Figma Personal Access Token.', 'qaproof' ); ?></p>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <p class="submit">
                                <button type="submit" id="qaproof-submit-btn" class="button button-primary button-hero">
                                    <?php esc_html_e( 'Analyze Design Fidelity', 'qaproof' ); ?>
                                </button>
                            </p>
                        </div>

                        <!-- Figma Design Preview Panel -->
                        <div class="qaproof-form-right" id="qaproof-figma-preview-wrap">
                            <!-- Backdrop for expanded inspector mode -->
                            <div class="qaproof-inspector-backdrop" id="qaproof-inspector-backdrop"></div>
                            <div class="qaproof-preview-panel" id="qaproof-figma-preview-panel">
                                <div class="qaproof-preview-header">
                                    <span class="dashicons dashicons-visibility"></span>
                                    <?php esc_html_e( 'Design Preview', 'qaproof' ); ?>
                                    <button type="button" class="qaproof-inspector-close" id="qaproof-inspector-close" title="<?php esc_attr_e( 'Close Inspector', 'qaproof' ); ?>" style="display:none">×</button>
                                </div>
                                <div class="qaproof-preview-body">
                                    <!-- Empty state -->
                                    <div class="qaproof-preview-empty" id="qaproof-preview-empty">
                                        <span class="dashicons dashicons-format-image"></span>
                                        <p><?php esc_html_e( 'Enter your Figma Token and URL to preview the design before testing.', 'qaproof' ); ?></p>
                                    </div>
                                    <!-- Loading state -->
                                    <div class="qaproof-preview-loading hidden" id="qaproof-preview-loading">
                                        <div class="qaproof-preview-spinner"></div>
                                        <p><?php esc_html_e( 'Loading preview...', 'qaproof' ); ?></p>
                                    </div>
                                    <!-- Error state -->
                                    <div class="qaproof-preview-error hidden" id="qaproof-preview-error">
                                        <span class="dashicons dashicons-warning"></span>
                                        <p id="qaproof-preview-error-msg"></p>
                                    </div>
                                    <!-- Success state -->
                                    <div class="qaproof-preview-success hidden" id="qaproof-preview-success">
                                        <div class="qaproof-preview-image-wrap" id="qaproof-preview-image-wrap">
                                            <div class="qaproof-preview-image-inner">
                                                <img id="qaproof-preview-image" alt="Figma Design Preview" />
                                                <div class="qaproof-element-overlays" id="qaproof-element-overlays"></div>
                                            </div>
                                        </div>
                                        <!-- Inspector sidebar: visible only in expanded mode -->
                                        <div class="qaproof-inspector-sidebar" id="qaproof-inspector-sidebar">
                                            <div class="qaproof-preview-meta" id="qaproof-preview-meta"></div>
                                            <div class="qaproof-element-controls" id="qaproof-element-controls">
                                                <button type="button" class="qaproof-detect-btn" id="qaproof-detect-elements-btn">
                                                    <span class="dashicons dashicons-screenoptions"></span>
                                                    <span class="qaproof-detect-btn-label"><?php esc_html_e( 'Detect Elements', 'qaproof' ); ?></span>
                                                    <span class="qaproof-element-count hidden" id="qaproof-element-count"></span>
                                                </button>
                                                <button type="button" class="qaproof-fullpage-btn active" id="qaproof-fullpage-btn">
                                                    <span class="dashicons dashicons-desktop"></span>
                                                    <?php esc_html_e( 'Full Page', 'qaproof' ); ?>
                                                </button>
                                                <button type="button" class="qaproof-inspector-expand" id="qaproof-inspector-expand">
                                                    <span class="dashicons dashicons-editor-expand"></span>
                                                    <?php esc_html_e( 'Expand', 'qaproof' ); ?>
                                                </button>
                                            </div>
                                            <div class="qaproof-depth-filters hidden" id="qaproof-depth-filters"></div>
                                            <div class="qaproof-element-detecting hidden" id="qaproof-element-detecting">
                                                <div class="qaproof-preview-spinner"></div>
                                                <p><?php esc_html_e( 'AI detecting elements...', 'qaproof' ); ?></p>
                                            </div>
                                            <div class="qaproof-detect-error hidden" id="qaproof-detect-error"></div>
                                            <div class="qaproof-selected-element hidden" id="qaproof-selected-element">
                                                <span class="dashicons dashicons-yes-alt"></span>
                                                <span id="qaproof-selected-element-label"></span>
                                                <button type="button" class="qaproof-clear-selection" id="qaproof-clear-selection">×</button>
                                            </div>
                                            <div class="qaproof-element-list" id="qaproof-element-list"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

            </div>

            <!-- Loading -->
            <div id="qaproof-loading" class="hidden">
                <div class="qaproof-loading-inner">
                    <div class="qaproof-loading-left">
                        <div class="qaproof-loading-spinner"></div>
                        <div class="qaproof-loading-info">
                            <strong id="qaproof-loading-text"><?php esc_html_e( 'Analyzing...', 'qaproof' ); ?></strong>
                            <p class="description" id="qaproof-loading-subtext"><?php esc_html_e( 'This may take 1-3 minutes.', 'qaproof' ); ?></p>
                        </div>
                    </div>
                    <div class="qaproof-loading-steps" id="qaproof-loading-steps"></div>
                </div>
            </div>

            <!-- Error -->
            <div id="qaproof-error" class="notice notice-error inline hidden">
                <p id="qaproof-error-message"></p>
            </div>

            <!-- Results (populated by JS) -->
            <div id="qaproof-results" class="hidden"></div>

            <!-- Test History -->
            <div id="qaproof-history-section" class="qaproof-history-section is-collapsed">
                <div class="qaproof-history-header">
                    <h2>
                        <span class="dashicons dashicons-backup"></span>
                        <?php esc_html_e( 'Test History', 'qaproof' ); ?>
                    </h2>
                    <button type="button" id="qaproof-history-toggle" class="button button-small">
                        <span class="dashicons dashicons-arrow-down-alt2"></span>
                    </button>
                </div>
                <div id="qaproof-history-content" class="qaproof-history-content">
                    <div class="qaproof-history-filters" id="qaproof-history-filters">
                        <button type="button" class="qaproof-filter-btn active" data-type="">All</button>
                        <button type="button" class="qaproof-filter-btn" data-type="fidelity">Fidelity</button>
                        <button type="button" class="qaproof-filter-btn" data-type="responsive">Responsive</button>
                        <button type="button" class="qaproof-filter-btn" data-type="design-audit">Design Audit</button>
                    </div>
                    <div id="qaproof-history-list"></div>
                    <div id="qaproof-history-loading" class="qaproof-history-loading-state hidden">
                        <span class="spinner is-active" style="float:none;margin:0 8px 0 0;"></span> <?php esc_html_e( 'Loading...', 'qaproof' ); ?>
                    </div>
                    <div id="qaproof-history-empty" class="qaproof-history-empty-state hidden">
                        <span class="dashicons dashicons-clock"></span>
                        <?php esc_html_e( 'No test history yet. Run a test to see results here.', 'qaproof' ); ?>
                    </div>
                    <div class="qaproof-history-load-more-wrap">
                        <button type="button" id="qaproof-history-load-more" class="button hidden">
                            <?php esc_html_e( 'Load More', 'qaproof' ); ?>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Brand Badge -->
            <div class="qaproof-brand-badge">
                <span class="qaproof-brand-dot"></span>
                <?php esc_html_e( 'QAProof v1.0', 'qaproof' ); ?>
            </div>
        </div>
        <?php
    }

    // ============================
    // Accessibility Page
    // ============================
    public static function render_accessibility_page() {
        if ( ! current_user_can( self::CAPABILITY ) ) return;
        ?>
        <div class="wrap" id="qaproof-app">
            <?php self::render_theme_toggle(); ?>
            <h1><?php esc_html_e( 'Accessibility Audit', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle"><?php esc_html_e( 'WCAG 2.1 compliance analysis for your web pages', 'qaproof' ); ?></p>

            <?php if ( empty( QAProof_Settings::get_api_key() ) ) : ?>
                <div class="notice notice-warning inline">
                    <p>
                        <?php printf(
                            esc_html__( 'API key not configured. %sGo to Settings%s to add your key.', 'qaproof' ),
                            '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::SETTINGS_SLUG ) ) . '">',
                            '</a>'
                        ); ?>
                    </p>
                </div>
            <?php endif; ?>

            <div class="qaproof-card">
                <form id="qaproof-a11y-form" onsubmit="return false;">
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="qaproof-a11y-url"><?php esc_html_e( 'Page URL', 'qaproof' ); ?></label>
                            </th>
                            <td>
                                <input type="url" id="qaproof-a11y-url" name="pageUrl"
                                       class="regular-text" required
                                       placeholder="https://example.com"
                                       value="<?php echo esc_url( home_url( '/' ) ); ?>" />
                                <p class="description"><?php esc_html_e( 'The page URL to audit for accessibility issues.', 'qaproof' ); ?></p>
                            </td>
                        </tr>
                    </table>

                    <p class="submit">
                        <button type="submit" id="qaproof-a11y-submit-btn" class="button button-primary button-hero" style="display:inline-flex;align-items:center;gap:6px;">
                            <span class="dashicons dashicons-universal-access" style="line-height:inherit;"></span>
                            <?php esc_html_e( 'Run Accessibility Audit', 'qaproof' ); ?>
                        </button>
                    </p>
                </form>
            </div>

            <!-- Loading -->
            <div id="qaproof-a11y-loading" class="hidden">
                <div class="qaproof-loading-inner">
                    <div class="qaproof-loading-left">
                        <div class="qaproof-loading-spinner"></div>
                        <div class="qaproof-loading-info">
                            <strong id="qaproof-a11y-loading-text"><?php esc_html_e( 'Auditing accessibility...', 'qaproof' ); ?></strong>
                            <p class="description" id="qaproof-a11y-loading-subtext"><?php esc_html_e( 'This may take 1-3 minutes.', 'qaproof' ); ?></p>
                        </div>
                    </div>
                    <div class="qaproof-loading-steps" id="qaproof-a11y-loading-steps"></div>
                </div>
            </div>

            <!-- Error -->
            <div id="qaproof-a11y-error" class="notice notice-error inline hidden">
                <p id="qaproof-a11y-error-message"></p>
            </div>

            <!-- Results -->
            <div id="qaproof-a11y-results" class="hidden"></div>

            <!-- Test History -->
            <?php self::render_test_history_section( 'a11y', [] ); ?>

            <!-- Brand Badge -->
            <div class="qaproof-brand-badge">
                <span class="dashicons dashicons-shield"></span>
                <span>QAProof v<?php echo esc_html( QAPROOF_VERSION ); ?></span>
            </div>
        </div>
        <?php
    }

    // ============================
    // Reusable Test History Section
    // ============================

    /**
     * Renders a collapsible test history section.
     *
     * @param string $prefix  Unique prefix for element IDs (e.g. 'a11y', 'history' for Tests page).
     * @param array  $filters Optional filter tabs. Each entry: ['type' => '', 'label' => 'All'].
     *                        Empty array = no filter tabs shown.
     */
    private static function render_test_history_section( $prefix, $filters = [] ) {
        $id = function ( $suffix ) use ( $prefix ) {
            return 'qaproof-' . $prefix . '-history-' . $suffix;
        };
        ?>
        <div id="<?php echo esc_attr( $id( 'section' ) ); ?>" class="qaproof-history-section is-collapsed">
            <div class="qaproof-history-header">
                <h2>
                    <span class="dashicons dashicons-backup"></span>
                    <?php esc_html_e( 'Test History', 'qaproof' ); ?>
                </h2>
                <button type="button" id="<?php echo esc_attr( $id( 'toggle' ) ); ?>" class="button button-small">
                    <span class="dashicons dashicons-arrow-down-alt2"></span>
                </button>
            </div>
            <div id="<?php echo esc_attr( $id( 'content' ) ); ?>" class="qaproof-history-content">
                <?php if ( ! empty( $filters ) ) : ?>
                    <div class="qaproof-history-filters" id="<?php echo esc_attr( $id( 'filters' ) ); ?>">
                        <?php foreach ( $filters as $f ) : ?>
                            <button type="button" class="qaproof-filter-btn<?php echo empty( $f['type'] ) ? ' active' : ''; ?>"
                                    data-type="<?php echo esc_attr( $f['type'] ); ?>">
                                <?php echo esc_html( $f['label'] ); ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
                <div id="<?php echo esc_attr( $id( 'list' ) ); ?>"></div>
                <div id="<?php echo esc_attr( $id( 'loading' ) ); ?>" class="qaproof-history-loading-state hidden">
                    <span class="spinner is-active" style="float:none;margin:0 8px 0 0;"></span> <?php esc_html_e( 'Loading...', 'qaproof' ); ?>
                </div>
                <div id="<?php echo esc_attr( $id( 'empty' ) ); ?>" class="qaproof-history-empty-state hidden">
                    <span class="dashicons dashicons-clock"></span>
                    <?php esc_html_e( 'No test history yet. Run a test to see results here.', 'qaproof' ); ?>
                </div>
                <div class="qaproof-history-load-more-wrap">
                    <button type="button" id="<?php echo esc_attr( $id( 'load-more' ) ); ?>" class="button hidden">
                        <?php esc_html_e( 'Load More', 'qaproof' ); ?>
                    </button>
                </div>
            </div>
        </div>
        <?php
    }
}
