<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Settings {

    const OPTION_GROUP           = 'qaproof_settings';
    const GROUP_GENERAL          = 'qaproof_group_general';
    const GROUP_MONITORS         = 'qaproof_group_monitors';
    const GROUP_TESTS_GENERAL    = 'qaproof_group_tests_general';
    const GROUP_TESTS_FIDELITY   = 'qaproof_group_tests_fidelity';
    const GROUP_TESTS_RESPONSIVE = 'qaproof_group_tests_responsive';
    const GROUP_TESTS_A11Y       = 'qaproof_group_tests_a11y';
    const GROUP_UNINSTALL        = 'qaproof_group_uninstall';
    const PAGE_SLUG              = 'qaproof-settings';

    public static function init() {
        add_action( 'admin_init', [ __CLASS__, 'register_settings' ] );
        // register_setting() has no autoload flag — keep these options out of
        // alloptions on every save (API key for attack surface, saved designs
        // for size: the latter holds base64-cached preview images).
        add_action( 'update_option_qaproof_api_key', [ __CLASS__, 'ensure_api_key_not_autoloaded' ], 10, 0 );
        add_action( 'add_option_qaproof_api_key',    [ __CLASS__, 'ensure_api_key_not_autoloaded' ], 10, 0 );
        add_action( 'update_option_qaproof_saved_designs', [ __CLASS__, 'flush_saved_designs_cache' ], 10, 0 );
        add_action( 'add_option_qaproof_saved_designs',    [ __CLASS__, 'flush_saved_designs_cache' ], 10, 0 );
        add_action( 'update_option_qaproof_saved_designs', [ __CLASS__, 'ensure_saved_designs_not_autoloaded' ], 11, 0 );
        add_action( 'add_option_qaproof_saved_designs',    [ __CLASS__, 'ensure_saved_designs_not_autoloaded' ], 11, 0 );
    }

    public static function ensure_api_key_not_autoloaded() {
        global $wpdb;
        remove_action( 'update_option_qaproof_api_key', [ __CLASS__, 'ensure_api_key_not_autoloaded' ], 10 );
        remove_action( 'add_option_qaproof_api_key',    [ __CLASS__, 'ensure_api_key_not_autoloaded' ], 10 );
        $wpdb->update(
            $wpdb->options,
            [ 'autoload' => 'no' ],
            [ 'option_name' => 'qaproof_api_key' ]
        );
        wp_cache_delete( 'qaproof_api_key', 'options' );
        wp_cache_delete( 'alloptions', 'options' );
    }

    public static function ensure_saved_designs_not_autoloaded() {
        global $wpdb;
        remove_action( 'update_option_qaproof_saved_designs', [ __CLASS__, 'ensure_saved_designs_not_autoloaded' ], 11 );
        remove_action( 'add_option_qaproof_saved_designs',    [ __CLASS__, 'ensure_saved_designs_not_autoloaded' ], 11 );
        $wpdb->update(
            $wpdb->options,
            [ 'autoload' => 'no' ],
            [ 'option_name' => 'qaproof_saved_designs' ]
        );
        wp_cache_delete( 'qaproof_saved_designs', 'options' );
        wp_cache_delete( 'alloptions', 'options' );
    }

    public static function register_settings() {
        register_setting( self::GROUP_GENERAL, 'qaproof_api_key', [
            'type'              => 'string',
            'sanitize_callback' => [ __CLASS__, 'sanitize_api_key' ],
            'default'           => '',
            'show_in_rest'      => false,
        ]);

        add_settings_section(
            'qaproof_general_section',
            __( 'API Configuration', 'qaproof' ),
            [ __CLASS__, 'render_section_description' ],
            'qaproof-settings-general'
        );

        add_settings_field(
            'qaproof_api_key',
            __( 'API Key', 'qaproof' ),
            [ __CLASS__, 'render_api_key_field' ],
            'qaproof-settings-general',
            'qaproof_general_section'
        );

        register_setting( self::GROUP_MONITORS, 'qaproof_notify_email', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_email',
            'default'           => '',
        ]);

        register_setting( self::GROUP_MONITORS, 'qaproof_notify_email_enabled', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);

        register_setting( self::GROUP_MONITORS, 'qaproof_notify_admin_enabled', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);

        register_setting( self::GROUP_MONITORS, 'qaproof_default_threshold', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 90,
        ]);

        register_setting( self::GROUP_MONITORS, 'qaproof_cron_hour', [
            'type'              => 'integer',
            'sanitize_callback' => function( $val ) {
                $val = (int) $val;
                return max( 0, min( 23, $val ) );
            },
            'default'           => 8,
        ]);

        add_settings_section(
            'qaproof_monitoring_section',
            __( 'Monitoring Defaults', 'qaproof' ),
            [ __CLASS__, 'render_monitoring_section_description' ],
            'qaproof-settings-monitors'
        );

        add_settings_field(
            'qaproof_notify_email',
            __( 'Notification Email', 'qaproof' ),
            [ __CLASS__, 'render_notify_email_field' ],
            'qaproof-settings-monitors',
            'qaproof_monitoring_section'
        );

        add_settings_field(
            'qaproof_notify_email_enabled',
            __( 'Email Notifications', 'qaproof' ),
            [ __CLASS__, 'render_notify_email_enabled_field' ],
            'qaproof-settings-monitors',
            'qaproof_monitoring_section'
        );

        add_settings_field(
            'qaproof_notify_admin_enabled',
            __( 'Admin Badge Notifications', 'qaproof' ),
            [ __CLASS__, 'render_notify_admin_enabled_field' ],
            'qaproof-settings-monitors',
            'qaproof_monitoring_section'
        );

        add_settings_field(
            'qaproof_default_threshold',
            __( 'Default Threshold Score', 'qaproof' ),
            [ __CLASS__, 'render_default_threshold_field' ],
            'qaproof-settings-monitors',
            'qaproof_monitoring_section'
        );

        add_settings_field(
            'qaproof_cron_hour',
            __( 'Report Delivery Time', 'qaproof' ),
            [ __CLASS__, 'render_cron_hour_field' ],
            'qaproof-settings-monitors',
            'qaproof_monitoring_section'
        );

        register_setting( self::GROUP_TESTS_GENERAL, 'qaproof_default_test_type', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => 'fidelity',
        ]);

        register_setting( self::GROUP_TESTS_GENERAL, 'qaproof_auto_save_history', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);

        register_setting( self::GROUP_TESTS_GENERAL, 'qaproof_max_history', [
            'type'              => 'integer',
            'sanitize_callback' => [ __CLASS__, 'sanitize_max_history' ],
            'default'           => 30,
        ]);

        add_settings_section(
            'qaproof_tests_general_section',
            __( 'General Test Settings', 'qaproof' ),
            function () {
                echo '<p>' . esc_html__( 'Default behavior for all test types.', 'qaproof' ) . '</p>';
            },
            'qaproof-settings-tests-general'
        );

        add_settings_field(
            'qaproof_default_test_type',
            __( 'Default Test Type', 'qaproof' ),
            [ __CLASS__, 'render_default_test_type_field' ],
            'qaproof-settings-tests-general',
            'qaproof_tests_general_section'
        );

        add_settings_field(
            'qaproof_auto_save_history',
            __( 'Auto-Save Results', 'qaproof' ),
            [ __CLASS__, 'render_auto_save_history_field' ],
            'qaproof-settings-tests-general',
            'qaproof_tests_general_section'
        );

        add_settings_field(
            'qaproof_max_history',
            __( 'Max History Entries', 'qaproof' ),
            [ __CLASS__, 'render_max_history_field' ],
            'qaproof-settings-tests-general',
            'qaproof_tests_general_section'
        );

        register_setting( self::GROUP_TESTS_FIDELITY, 'qaproof_saved_designs', [
            'type'              => 'string',
            'sanitize_callback' => [ __CLASS__, 'sanitize_saved_designs' ],
            'default'           => '[]',
        ]);

        register_setting( self::GROUP_TESTS_FIDELITY, 'qaproof_fidelity_ignore_text', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);

        add_settings_section(
            'qaproof_tests_fidelity_section',
            __( 'Design Fidelity', 'qaproof' ),
            function () {
                echo '<p>' . esc_html__( 'Settings for design fidelity comparisons (Figma vs live page).', 'qaproof' ) . '</p>';

                $service_email = 'figma@qaproof.io';
                ?>
                <div class="qaproof-figma-conn-card" id="qaproof-figma-conn-card" data-state="loading">
                    <div class="qaproof-figma-conn-header">
                        <h3 class="qaproof-figma-conn-title"><?php esc_html_e( 'Figma connection', 'qaproof' ); ?></h3>
                        <span class="qaproof-figma-conn-badge" data-conn-badge></span>
                    </div>
                    <div class="qaproof-figma-conn-body" data-conn-body>
                        <p class="qaproof-figma-conn-loading"><?php esc_html_e( 'Checking connection…', 'qaproof' ); ?></p>
                    </div>
                </div>

                <details class="qaproof-figma-access-card qaproof-figma-access-card--alt" id="qaproof-figma-access-fallback">
                    <summary class="qaproof-figma-access-summary">
                        <?php esc_html_e( 'Alternative: share files manually with our service account', 'qaproof' ); ?>
                    </summary>
                    <p class="qaproof-figma-access-lead"><?php esc_html_e( 'Prefer not to connect an account? Share each file you want to test with the address below. Works on any Figma plan.', 'qaproof' ); ?></p>
                    <div class="qaproof-figma-access-email">
                        <label class="qaproof-figma-access-email-label"><?php esc_html_e( 'Service email', 'qaproof' ); ?></label>
                        <code class="qaproof-figma-access-email-value"><?php echo esc_html( $service_email ); ?></code>
                        <button type="button" class="button qaproof-copy-email-btn" data-copy="<?php echo esc_attr( $service_email ); ?>">
                            <?php esc_html_e( 'Copy', 'qaproof' ); ?>
                        </button>
                        <button type="button" class="button qaproof-figma-guide-open">
                            <?php esc_html_e( 'Show me how →', 'qaproof' ); ?>
                        </button>
                    </div>
                    <ol class="qaproof-figma-access-steps">
                        <li><?php esc_html_e( 'Open your Figma file and click Share in the top-right corner.', 'qaproof' ); ?></li>
                        <li><?php
                            // translators: %s is the service email address (figma@qaproof.io).
                            printf( esc_html__( 'Paste %s into the invite field and set the permission to Can view.', 'qaproof' ), '<code>' . esc_html( $service_email ) . '</code>' );
                        ?></li>
                        <li><?php esc_html_e( 'Send the invite, then paste the file URL into a saved design below.', 'qaproof' ); ?></li>
                        <li><?php esc_html_e( 'Click Verify access to confirm the link works.', 'qaproof' ); ?></li>
                    </ol>
                </details>
                <?php
            },
            'qaproof-settings-tests-fidelity'
        );

        add_settings_field(
            'qaproof_saved_designs',
            __( 'Saved Designs', 'qaproof' ),
            [ __CLASS__, 'render_saved_designs_field' ],
            'qaproof-settings-tests-fidelity',
            'qaproof_tests_fidelity_section'
        );

        add_settings_field(
            'qaproof_fidelity_ignore_text',
            __( 'Ignore Text Differences', 'qaproof' ),
            [ __CLASS__, 'render_fidelity_ignore_text_field' ],
            'qaproof-settings-tests-fidelity',
            'qaproof_tests_fidelity_section'
        );

        register_setting( self::GROUP_TESTS_RESPONSIVE, 'qaproof_viewport_desktop', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 1920,
        ]);

        register_setting( self::GROUP_TESTS_RESPONSIVE, 'qaproof_viewport_tablet', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 768,
        ]);

        register_setting( self::GROUP_TESTS_RESPONSIVE, 'qaproof_viewport_mobile', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 375,
        ]);

        add_settings_section(
            'qaproof_tests_responsive_section',
            __( 'Responsive Test', 'qaproof' ),
            function () {
                echo '<p>' . esc_html__( 'Settings for responsive testing across viewports.', 'qaproof' ) . '</p>';
            },
            'qaproof-settings-tests-responsive'
        );

        add_settings_field(
            'qaproof_viewports',
            __( 'Viewport Widths (px)', 'qaproof' ),
            [ __CLASS__, 'render_viewports_field' ],
            'qaproof-settings-tests-responsive',
            'qaproof_tests_responsive_section'
        );

        // ============================
        // Tests tab — Accessibility
        // ============================
        register_setting( self::GROUP_TESTS_A11Y, 'qaproof_wcag_level', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => 'AA',
        ]);

        add_settings_section(
            'qaproof_tests_accessibility_section',
            __( 'Accessibility Audit', 'qaproof' ),
            function () {
                echo '<p>' . esc_html__( 'Settings for WCAG accessibility testing.', 'qaproof' ) . '</p>';
            },
            'qaproof-settings-tests-accessibility'
        );

        add_settings_field(
            'qaproof_wcag_level',
            __( 'WCAG Conformance Level', 'qaproof' ),
            [ __CLASS__, 'render_wcag_level_field' ],
            'qaproof-settings-tests-accessibility',
            'qaproof_tests_accessibility_section'
        );

        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_api_key', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => false,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_settings', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => false,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_saved_designs', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => false,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_test_history', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => false,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_monitors', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => false,
        ]);

        add_settings_section(
            'qaproof_uninstall_section',
            __( 'Data Cleanup on Uninstall', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_section_description' ],
            'qaproof-settings-uninstall'
        );

        add_settings_field(
            'qaproof_uninstall_delete_api_key',
            __( 'API Key', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_api_key_field' ],
            'qaproof-settings-uninstall',
            'qaproof_uninstall_section'
        );

        add_settings_field(
            'qaproof_uninstall_delete_settings',
            __( 'Plugin Settings', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_settings_field' ],
            'qaproof-settings-uninstall',
            'qaproof_uninstall_section'
        );

        add_settings_field(
            'qaproof_uninstall_delete_saved_designs',
            __( 'Saved Designs', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_saved_designs_field' ],
            'qaproof-settings-uninstall',
            'qaproof_uninstall_section'
        );

        add_settings_field(
            'qaproof_uninstall_delete_test_history',
            __( 'Test History', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_test_history_field' ],
            'qaproof-settings-uninstall',
            'qaproof_uninstall_section'
        );

        add_settings_field(
            'qaproof_uninstall_delete_monitors',
            __( 'Monitors & Results', 'qaproof' ),
            [ __CLASS__, 'render_uninstall_monitors_field' ],
            'qaproof-settings-uninstall',
            'qaproof_uninstall_section'
        );
    }

    public static function render_section_description() {
        echo '<p>';
        echo esc_html__( 'Enter your API key to connect this plugin to your QAProof account.', 'qaproof' );
        echo ' <a href="https://qaproof.io/app/api-keys" target="_blank" rel="noopener noreferrer">';
        echo esc_html__( 'Get your API key at qaproof.io/app/api-keys →', 'qaproof' );
        echo '</a>';
        echo '</p>';
    }

    public static function render_api_key_field() {
        $value = get_option( 'qaproof_api_key', '' );
        echo '<div class="qaproof-api-key-wrapper">';
        echo '  <input type="password" id="qaproof_api_key" name="qaproof_api_key" value="' . esc_attr( $value ) . '" class="regular-text" autocomplete="off" placeholder="qap_live_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />';
        echo '  <button type="button" class="qaproof-eye-toggle" title="' . esc_attr__( 'Show/Hide API Key', 'qaproof' ) . '">';
        echo '    <svg class="qaproof-eye-icon qaproof-eye-off" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        echo '    <svg class="qaproof-eye-icon qaproof-eye-on" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        echo '  </button>';
        echo '  <span class="qaproof-key-fade"></span>';
        echo '</div>';
        echo '<p class="qaproof-api-key-error" style="display:none;"></p>';

        echo '<div id="qaproof-account-info" class="qaproof-account-info" style="display:none;">';
        echo '  <div class="qaproof-account-info__loading" id="qaproof-account-info-loading">';
        echo '    <span class="qaproof-account-info__spinner"></span>';
        echo '    <span>' . esc_html__( 'Fetching account info...', 'qaproof' ) . '</span>';
        echo '  </div>';
        echo '  <div class="qaproof-account-info__body" id="qaproof-account-info-body" style="display:none;">';
        echo '    <div class="qaproof-account-info__row qaproof-account-info__header">';
        echo '      <div class="qaproof-account-info__user">';
        echo '        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        echo '        <span id="qaproof-account-email"></span>';
        echo '      </div>';
        echo '      <span id="qaproof-account-plan-badge" class="qaproof-plan-badge"></span>';
        echo '    </div>';

        echo '    <div class="qaproof-account-info__stat">';
        echo '      <div class="qaproof-account-info__stat-header">';
        echo '        <span class="qaproof-account-info__stat-label">' . esc_html__( 'AI Generations', 'qaproof' ) . '</span>';
        echo '        <span class="qaproof-account-info__stat-value" id="qaproof-account-gen-text"></span>';
        echo '      </div>';
        echo '      <div class="qaproof-account-info__progress-track">';
        echo '        <div class="qaproof-account-info__progress-bar" id="qaproof-account-gen-bar"></div>';
        echo '      </div>';
        echo '      <div class="qaproof-account-info__stat-sub" id="qaproof-account-gen-remaining"></div>';
        echo '    </div>';

        echo '    <div class="qaproof-account-info__row qaproof-account-info__meta">';
        echo '      <div class="qaproof-account-info__meta-item">';
        echo '        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
        echo '        <span id="qaproof-account-monitors"></span>';
        echo '      </div>';
        echo '      <div class="qaproof-account-info__meta-item">';
        echo '        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        echo '        <span id="qaproof-account-history"></span>';
        echo '      </div>';
        echo '      <a href="https://qaproof.io/app/settings/billing" target="_blank" rel="noopener noreferrer" class="qaproof-account-info__manage-link">';
        echo '        ' . esc_html__( 'Manage plan →', 'qaproof' );
        echo '      </a>';
        echo '    </div>';

        echo '  </div>';
        echo '  <div class="qaproof-account-info__error" id="qaproof-account-info-error" style="display:none;"></div>';
        echo '</div>';
    }

    public static function render_monitoring_section_description() {
        echo '<p>' . esc_html__( 'Configure default settings for visual regression monitors.', 'qaproof' ) . '</p>';
    }

    public static function render_notify_email_field() {
        $value = get_option( 'qaproof_notify_email', get_option( 'admin_email' ) );
        echo '<input type="email" name="qaproof_notify_email" value="' . esc_attr( $value ) . '" class="regular-text" />';
        echo '<p class="description">' . esc_html__( 'Email address for regression alerts. Defaults to admin email.', 'qaproof' ) . '</p>';
    }

    public static function render_notify_email_enabled_field() {
        $value = get_option( 'qaproof_notify_email_enabled', true );
        echo '<label><input type="checkbox" name="qaproof_notify_email_enabled" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Send email notifications when regressions are detected.', 'qaproof' ) . '</label>';
    }

    public static function render_notify_admin_enabled_field() {
        $value = get_option( 'qaproof_notify_admin_enabled', true );
        echo '<label><input type="checkbox" name="qaproof_notify_admin_enabled" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Show badge on QAProof menu when regressions are detected.', 'qaproof' ) . '</label>';
    }

    public static function render_default_threshold_field() {
        $value = get_option( 'qaproof_default_threshold', 95 );
        echo '<input type="number" name="qaproof_default_threshold" value="' . esc_attr( $value ) . '" min="0" max="100" step="1" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Score below this threshold triggers notifications. 0-100, default 95.', 'qaproof' ) . '</p>';
    }

    public static function render_cron_hour_field() {
        $value    = (int) get_option( 'qaproof_cron_hour', 8 );
        $site_tz  = wp_timezone_string();
        $sections = [
            [ 'icon' => '🌙', 'label' => __( 'Night',     'qaproof' ), 'start' => 0,  'end' => 5  ],
            [ 'icon' => '🌅', 'label' => __( 'Morning',   'qaproof' ), 'start' => 6,  'end' => 11 ],
            [ 'icon' => '☀️', 'label' => __( 'Afternoon', 'qaproof' ), 'start' => 12, 'end' => 17 ],
            [ 'icon' => '🌆', 'label' => __( 'Evening',   'qaproof' ), 'start' => 18, 'end' => 23 ],
        ];
        ?>
        <div class="qaproof-hour-picker" data-field="qaproof_cron_hour">
            <?php foreach ( $sections as $section ) : ?>
            <div class="qaproof-hour-section">
                <div class="qaproof-hour-section-label">
                    <span class="qaproof-hour-section-icon"><?php echo esc_html( $section['icon'] ); ?></span>
                    <span><?php echo esc_html( $section['label'] ); ?></span>
                </div>
                <div class="qaproof-hour-section-pills">
                    <?php for ( $h = $section['start']; $h <= $section['end']; $h++ ) : ?>
                        <button type="button"
                                class="qaproof-hour-btn<?php echo $value === $h ? ' active' : ''; ?>"
                                data-hour="<?php echo $h; ?>">
                            <?php echo sprintf( '%02d', $h ); ?>
                        </button>
                    <?php endfor; ?>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <input type="hidden" name="qaproof_cron_hour" id="qaproof_cron_hour" value="<?php echo esc_attr( $value ); ?>">
        <p class="description" style="margin-top: 10px;">
            <?php
            printf(
                /* translators: 1: selected hour, 2: timezone string */
                esc_html__( 'Monitors run at %s:00 (%s). Changes apply from the next scheduled run.', 'qaproof' ),
                '<strong id="qaproof-hour-display">' . sprintf( '%02d', $value ) . '</strong>',
                '<strong>' . esc_html( $site_tz ) . '</strong>'
            );
            ?>
        </p>
        <?php
    }

    public static function render_default_test_type_field() {
        $value = get_option( 'qaproof_default_test_type', 'fidelity' );
        ?>
        <select name="qaproof_default_test_type">
            <option value="fidelity" <?php selected( $value, 'fidelity' ); ?>><?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?></option>
            <option value="responsive" <?php selected( $value, 'responsive' ); ?>><?php esc_html_e( 'Responsive Test', 'qaproof' ); ?></option>
            <option value="accessibility" <?php selected( $value, 'accessibility' ); ?>><?php esc_html_e( 'Accessibility Audit', 'qaproof' ); ?></option>
        </select>
        <p class="description"><?php esc_html_e( 'Pre-selected test type on the Tests page.', 'qaproof' ); ?></p>
        <?php
    }

    public static function render_auto_save_history_field() {
        $value = get_option( 'qaproof_auto_save_history', true );
        echo '<label><input type="checkbox" name="qaproof_auto_save_history" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Automatically save test results to history.', 'qaproof' ) . '</label>';
    }

    public static function render_max_history_field() {
        $value = get_option( 'qaproof_max_history', 30 );
        echo '<input type="number" name="qaproof_max_history" value="' . esc_attr( $value ) . '" min="5" max="30" step="5" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Maximum number of test results to keep. Oldest results are pruned automatically.', 'qaproof' ) . '</p>';
    }

    public static function sanitize_saved_designs( $input ) {
        if ( empty( $input ) ) return '[]';
        $designs = json_decode( stripslashes( $input ), true );
        if ( ! is_array( $designs ) ) return '[]';

        $clean = [];
        foreach ( $designs as $d ) {
            if ( empty( $d['name'] ) ) continue;
            $entry = [
                'id'       => isset( $d['id'] ) ? sanitize_text_field( $d['id'] ) : bin2hex( random_bytes( 4 ) ),
                'name'     => sanitize_text_field( $d['name'] ),
                'pageUrl'  => isset( $d['pageUrl'] ) ? sanitize_url( $d['pageUrl'] ) : '',
                'figmaUrl' => isset( $d['figmaUrl'] ) ? self::sanitize_figma_url( $d['figmaUrl'] ) : '',
            ];
            // Preserve cached image + detected elements (not posted by the settings form).
            if ( ! empty( $d['imageBase64'] ) ) {
                $entry['imageBase64'] = $d['imageBase64'];
            }
            if ( ! empty( $d['elementsJson'] ) ) {
                $entry['elementsJson'] = $d['elementsJson'];
            }
            if ( ! empty( $d['elementsSource'] ) ) {
                $entry['elementsSource'] = sanitize_text_field( $d['elementsSource'] );
            }
            $clean[] = $entry;
        }
        return wp_json_encode( $clean );
    }

    /** Request-level cache. null = not yet loaded. Reset via flush_saved_designs_cache(). */
    private static $saved_designs_cache = null;

    public static function get_saved_designs() {
        if ( self::$saved_designs_cache !== null ) {
            return self::$saved_designs_cache;
        }
        $raw     = get_option( 'qaproof_saved_designs', '[]' );
        $designs = json_decode( $raw, true );
        self::$saved_designs_cache = is_array( $designs ) ? $designs : [];
        return self::$saved_designs_cache;
    }

    public static function flush_saved_designs_cache() {
        self::$saved_designs_cache = null;
    }

    /** Per-month Figma API usage counter — stored as JSON in wp_options. */
    const FIGMA_USAGE_OPTION = 'qaproof_figma_api_usage';

    /**
     * Extract the Figma fileKey from a /design|file|proto|board/{key}/ URL.
     */
    public static function extract_figma_file_key( $figma_url ) {
        if ( ! is_string( $figma_url ) || $figma_url === '' ) return '';
        if ( preg_match( '#figma\.com/(?:design|file|proto|board)/([A-Za-z0-9]+)#i', $figma_url, $m ) ) {
            return $m[1];
        }
        return '';
    }

    public static function get_figma_api_usage() {
        $raw = get_option( self::FIGMA_USAGE_OPTION, '' );
        $data = $raw ? json_decode( $raw, true ) : null;
        $current_month = gmdate( 'Y-m' );
        if ( ! is_array( $data ) || ! isset( $data['month'] ) || $data['month'] !== $current_month ) {
            $data = [
                'month'      => $current_month,
                'byFile'     => [],
                'lastCallAt' => 0,
            ];
        }
        if ( ! isset( $data['byFile'] ) || ! is_array( $data['byFile'] ) ) {
            $data['byFile'] = [];
        }
        $total = 0;
        $byType = [];
        foreach ( $data['byFile'] as $file_entry ) {
            if ( ! is_array( $file_entry ) ) continue;
            $total += (int) ( $file_entry['total'] ?? 0 );
            $ft = $file_entry['byType'] ?? [];
            if ( is_array( $ft ) ) {
                foreach ( $ft as $k => $v ) {
                    $byType[ $k ] = ( $byType[ $k ] ?? 0 ) + (int) $v;
                }
            }
        }
        $data['total']  = $total;
        $data['byType'] = $byType;
        return $data;
    }

    /**
     * Bucket Figma API call counters per fileKey (rate limits apply per workspace/file).
     *
     * @param  string $file_key Figma file identifier; empty = ignore.
     * @param  string $type     'image'|'nodes'.
     * @param  bool   $ok       Whether the call succeeded.
     */
    public static function track_figma_api_call( $file_key, $type = 'image', $ok = true ) {
        $file_key = is_string( $file_key ) ? trim( $file_key ) : '';
        if ( $file_key === '' ) return self::get_figma_api_usage();

        $data = self::get_figma_api_usage();
        $files = isset( $data['byFile'] ) && is_array( $data['byFile'] ) ? $data['byFile'] : [];
        $entry = isset( $files[ $file_key ] ) && is_array( $files[ $file_key ] ) ? $files[ $file_key ] : [
            'total'      => 0,
            'byType'     => [],
            'recent'     => [],
            'lastCallAt' => 0,
            'rateLimit'  => [ 'retryAt' => 0, 'observedAt' => 0, 'rawRetryAfter' => '' ],
        ];
        $entry['total']  = (int) ( $entry['total'] ?? 0 ) + 1;
        $bt              = $entry['byType'] ?? [];
        $bt[ $type ]     = (int) ( $bt[ $type ] ?? 0 ) + 1;
        $entry['byType'] = $bt;
        $entry['lastCallAt'] = time();
        $recent = isset( $entry['recent'] ) && is_array( $entry['recent'] ) ? $entry['recent'] : [];
        array_unshift( $recent, [ 't' => $type, 'ts' => time(), 'ok' => (bool) $ok ] );
        $entry['recent'] = array_slice( $recent, 0, 20 );
        $files[ $file_key ] = $entry;
        $data['byFile']     = $files;
        $data['lastCallAt'] = time();
        unset( $data['total'], $data['byType'] ); // derived — don't persist
        update_option( self::FIGMA_USAGE_OPTION, wp_json_encode( $data ) );
        return self::get_figma_api_usage();
    }

    public static function reset_figma_api_usage() {
        delete_option( self::FIGMA_USAGE_OPTION );
        delete_option( self::FIGMA_RATE_LIMIT_OPTION );
    }

    /** Legacy global rate-limit option — cleaned out on reset. */
    const FIGMA_RATE_LIMIT_OPTION = 'qaproof_figma_rate_limit';

    public static function get_figma_rate_limit( $file_key = '' ) {
        $empty = [ 'retryAt' => 0, 'observedAt' => 0, 'rawRetryAfter' => '' ];
        $file_key = is_string( $file_key ) ? trim( $file_key ) : '';
        if ( $file_key === '' ) return $empty;

        $data = self::get_figma_api_usage();
        $entry = $data['byFile'][ $file_key ] ?? null;
        if ( ! is_array( $entry ) || empty( $entry['rateLimit'] ) ) return $empty;
        $rl = $entry['rateLimit'];
        return [
            'retryAt'       => (int) ( $rl['retryAt'] ?? 0 ),
            'observedAt'    => (int) ( $rl['observedAt'] ?? 0 ),
            'rawRetryAfter' => (string) ( $rl['rawRetryAfter'] ?? '' ),
        ];
    }

    public static function record_figma_rate_limit( $file_key, $retry_at_ms, $raw_retry_after = '' ) {
        $file_key    = is_string( $file_key ) ? trim( $file_key ) : '';
        $retry_at_ms = (int) $retry_at_ms;
        if ( $file_key === '' || $retry_at_ms <= 0 || $retry_at_ms <= time() * 1000 ) {
            return;
        }
        $data  = self::get_figma_api_usage();
        $files = isset( $data['byFile'] ) && is_array( $data['byFile'] ) ? $data['byFile'] : [];
        $entry = isset( $files[ $file_key ] ) && is_array( $files[ $file_key ] ) ? $files[ $file_key ] : [
            'total' => 0, 'byType' => [], 'recent' => [], 'lastCallAt' => 0,
        ];
        $entry['rateLimit'] = [
            'retryAt'       => $retry_at_ms,
            'observedAt'    => time() * 1000,
            'rawRetryAfter' => (string) $raw_retry_after,
        ];
        $files[ $file_key ] = $entry;
        $data['byFile']     = $files;
        unset( $data['total'], $data['byType'] );
        update_option( self::FIGMA_USAGE_OPTION, wp_json_encode( $data ) );
    }

    public static function clear_figma_rate_limit( $file_key = '' ) {
        $file_key = is_string( $file_key ) ? trim( $file_key ) : '';
        if ( $file_key === '' ) return;
        $data  = self::get_figma_api_usage();
        if ( ! isset( $data['byFile'][ $file_key ] ) ) return;
        if ( isset( $data['byFile'][ $file_key ]['rateLimit'] ) ) {
            $data['byFile'][ $file_key ]['rateLimit'] = [ 'retryAt' => 0, 'observedAt' => 0, 'rawRetryAfter' => '' ];
        }
        unset( $data['total'], $data['byType'] );
        update_option( self::FIGMA_USAGE_OPTION, wp_json_encode( $data ) );
    }

    /**
     * Returns retryAt (ms) when this file is under a known 429 window, else 0.
     */
    public static function figma_rate_limit_active_until( $file_key = '' ) {
        $file_key = is_string( $file_key ) ? trim( $file_key ) : '';
        if ( $file_key === '' ) return 0;
        $rl = self::get_figma_rate_limit( $file_key );
        $retry_at = (int) $rl['retryAt'];
        if ( $retry_at > 0 && $retry_at > time() * 1000 ) {
            return $retry_at;
        }
        if ( $retry_at > 0 && $retry_at <= time() * 1000 ) {
            self::clear_figma_rate_limit( $file_key );
        }
        return 0;
    }

    public static function update_saved_design_image( $design_id, $image_b64 ) {
        $designs = self::get_saved_designs();
        $found   = false;
        foreach ( $designs as &$d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                $d['imageBase64'] = $image_b64;
                $found = true;
                break;
            }
        }
        unset( $d );
        if ( ! $found ) return false;
        update_option( 'qaproof_saved_designs', wp_json_encode( $designs ) );
        return true;
    }

    public static function clear_saved_design_image( $design_id ) {
        $designs = self::get_saved_designs();
        $found   = false;
        foreach ( $designs as &$d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                unset( $d['imageBase64'] );
                $found = true;
                break;
            }
        }
        unset( $d );
        if ( ! $found ) return false;
        update_option( 'qaproof_saved_designs', wp_json_encode( $designs ) );
        return true;
    }

    public static function update_saved_design_elements( $design_id, $elements, $source = '' ) {
        $designs = self::get_saved_designs();
        $found   = false;
        foreach ( $designs as &$d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                $d['elementsJson'] = wp_json_encode( $elements );
                $d['elementsSource'] = $source;
                $found = true;
                break;
            }
        }
        unset( $d );
        if ( ! $found ) return false;
        update_option( 'qaproof_saved_designs', wp_json_encode( $designs ) );
        return true;
    }

    public static function clear_saved_design_elements( $design_id ) {
        $designs = self::get_saved_designs();
        $found   = false;
        foreach ( $designs as &$d ) {
            if ( isset( $d['id'] ) && $d['id'] === $design_id ) {
                unset( $d['elementsJson'] );
                unset( $d['elementsSource'] );
                $found = true;
                break;
            }
        }
        unset( $d );
        if ( ! $found ) return false;
        update_option( 'qaproof_saved_designs', wp_json_encode( $designs ) );
        return true;
    }

    public static function render_saved_designs_field() {
        $designs = self::get_saved_designs();
        ?>
        <div id="qaproof-saved-designs-wrap">
            <div id="qaproof-saved-designs-list">
                <?php if ( empty( $designs ) ) : ?>
                    <p class="description qaproof-no-designs"><?php esc_html_e( 'No saved designs yet. Click "Add Design" to create one.', 'qaproof' ); ?></p>
                <?php endif; ?>
                <?php foreach ( $designs as $i => $d ) :
                    $has_image    = ! empty( $d['imageBase64'] );
                    $has_elements = ! empty( $d['elementsJson'] );
                    $elements_count = 0;
                    if ( $has_elements ) {
                        $decoded = json_decode( $d['elementsJson'], true );
                        if ( is_array( $decoded ) ) {
                            $elements_count = count( $decoded );
                        }
                    }
                    $source = ! empty( $d['elementsSource'] ) ? $d['elementsSource'] : '';
                    // Force re-detection on Figma-sourced designs cached with ai-vision —
                    // we'd rather get pixel-perfect Figma-API overlays.
                    $has_figma_source = ! empty( $d['figmaUrl'] );
                    $is_stale_ai      = ( $source === 'ai-vision' ) && $has_figma_source;
                    if ( $has_image && $has_elements && ! $is_stale_ai ) {
                        $status       = 'ready';
                        $status_label = sprintf( __( 'Ready · %d elements', 'qaproof' ), $elements_count );
                        if ( $source ) $status_label .= ' (' . esc_html( $source ) . ')';
                    } elseif ( $has_image ) {
                        $status       = 'partial';
                        $status_label = __( 'Image cached · elements missing', 'qaproof' );
                    } else {
                        $status       = 'empty';
                        $status_label = __( 'Not cached — open Tests page and click Save', 'qaproof' );
                    }
                ?>
                <div class="qaproof-design-row" data-index="<?php echo $i; ?>" data-design-id="<?php echo esc_attr( $d['id'] ); ?>">
                    <div class="qaproof-design-row-fields">
                        <input type="text" placeholder="<?php esc_attr_e( 'Design Name', 'qaproof' ); ?>" value="<?php echo esc_attr( $d['name'] ); ?>" data-field="name" class="regular-text" />
                        <input type="url" placeholder="<?php esc_attr_e( 'Figma URL', 'qaproof' ); ?>" value="<?php echo esc_url( $d['figmaUrl'] ); ?>" data-field="figmaUrl" class="regular-text" />
                        <button type="button" class="button qaproof-design-verify-btn" data-design-id="<?php echo esc_attr( $d['id'] ); ?>" title="<?php esc_attr_e( 'Check that QAProof can read this file', 'qaproof' ); ?>">
                            <?php esc_html_e( 'Verify access', 'qaproof' ); ?>
                        </button>
                        <input type="hidden" value="<?php echo esc_attr( $d['id'] ); ?>" data-field="id" />
                    </div>
                    <div class="qaproof-design-status qaproof-status-<?php echo esc_attr( $status ); ?>" data-status="<?php echo esc_attr( $status ); ?>" title="<?php echo esc_attr( $status_label ); ?>">
                        <span class="qaproof-design-status-dot"></span>
                        <span class="qaproof-design-status-label"><?php echo esc_html( $status_label ); ?></span>
                    </div>
                    <button type="button" class="button qaproof-design-remove" title="<?php esc_attr_e( 'Remove', 'qaproof' ); ?>">
                        <span class="dashicons dashicons-trash"></span>
                    </button>
                </div>
                <?php endforeach; ?>
            </div>
            <button type="button" id="qaproof-add-design" class="button">
                <span class="dashicons dashicons-plus-alt2"></span>
                <?php esc_html_e( 'Add Design', 'qaproof' ); ?>
            </button>
            <input type="hidden" name="qaproof_saved_designs" id="qaproof-saved-designs-json" value="<?php echo esc_attr( wp_json_encode( $designs ) ); ?>" />
        </div>
        <p class="description">
            <?php
                printf(
                    /* translators: %s: link to Tests page */
                    esc_html__( 'Save your designs here, then select them by name on the %s page.', 'qaproof' ),
                    '<a href="' . esc_url( admin_url( 'admin.php?page=qaproof-tests' ) ) . '">' . esc_html__( 'Design Fidelity Test', 'qaproof' ) . '</a>'
                );
            ?>
        </p>
        <?php
    }

    public static function render_fidelity_ignore_text_field() {
        $value = get_option( 'qaproof_fidelity_ignore_text', true );
        echo '<label><input type="checkbox" name="qaproof_fidelity_ignore_text" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Ignore text content differences (focus on visual layout only).', 'qaproof' ) . '</label>';
        echo '<p class="description">' . esc_html__( 'When enabled, AI analysis focuses on layout, colors, and spacing rather than text accuracy.', 'qaproof' ) . '</p>';
    }

    public static function render_viewports_field() {
        $desktop = get_option( 'qaproof_viewport_desktop', 1920 );
        $tablet  = get_option( 'qaproof_viewport_tablet', 768 );
        $mobile  = get_option( 'qaproof_viewport_mobile', 375 );
        ?>
        <fieldset class="qaproof-viewport-fields">
            <label>
                <?php esc_html_e( 'Desktop:', 'qaproof' ); ?>
                <span class="qaproof-input-suffix"><input type="number" name="qaproof_viewport_desktop" value="<?php echo esc_attr( $desktop ); ?>" min="800" max="3840" step="1" class="small-text" /><span class="qaproof-suffix">px</span></span>
            </label>
            <label>
                <?php esc_html_e( 'Tablet:', 'qaproof' ); ?>
                <span class="qaproof-input-suffix"><input type="number" name="qaproof_viewport_tablet" value="<?php echo esc_attr( $tablet ); ?>" min="320" max="1200" step="1" class="small-text" /><span class="qaproof-suffix">px</span></span>
            </label>
            <label>
                <?php esc_html_e( 'Mobile:', 'qaproof' ); ?>
                <span class="qaproof-input-suffix"><input type="number" name="qaproof_viewport_mobile" value="<?php echo esc_attr( $mobile ); ?>" min="280" max="480" step="1" class="small-text" /><span class="qaproof-suffix">px</span></span>
            </label>
        </fieldset>
        <p class="description"><?php esc_html_e( 'Viewport widths (in pixels) used for responsive screenshots.', 'qaproof' ); ?></p>
        <?php
    }

    public static function render_wcag_level_field() {
        $value = get_option( 'qaproof_wcag_level', 'AA' );
        ?>
        <select name="qaproof_wcag_level">
            <option value="A" <?php selected( $value, 'A' ); ?>>Level A (minimum)</option>
            <option value="AA" <?php selected( $value, 'AA' ); ?>>Level AA (recommended)</option>
            <option value="AAA" <?php selected( $value, 'AAA' ); ?>>Level AAA (enhanced)</option>
        </select>
        <p class="description"><?php esc_html_e( 'Default WCAG 2.1 conformance level used on the Accessibility Test page. AA is the standard for most websites.', 'qaproof' ); ?></p>
        <?php
    }

    // ============================
    // Data Cleanup — Uninstall Fields
    // ============================
    public static function render_uninstall_section_description() {
        echo '<p>' . esc_html__( 'Choose which data to delete when the plugin is removed. Unchecked items will be preserved in the database so they are available if you reinstall later.', 'qaproof' ) . '</p>';
    }

    public static function render_uninstall_api_key_field() {
        $value = get_option( 'qaproof_uninstall_delete_api_key', false );
        echo '<input type="hidden" name="qaproof_uninstall_delete_api_key" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_api_key" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete API key on uninstall', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_settings_field() {
        $value = get_option( 'qaproof_uninstall_delete_settings', false );
        echo '<input type="hidden" name="qaproof_uninstall_delete_settings" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_settings" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete notification, threshold, viewport, and test settings', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_saved_designs_field() {
        $value = get_option( 'qaproof_uninstall_delete_saved_designs', false );
        echo '<input type="hidden" name="qaproof_uninstall_delete_saved_designs" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_saved_designs" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete saved designs (including cached images)', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_test_history_field() {
        $value = get_option( 'qaproof_uninstall_delete_test_history', false );
        echo '<input type="hidden" name="qaproof_uninstall_delete_test_history" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_test_history" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete all test history records', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_monitors_field() {
        $value = get_option( 'qaproof_uninstall_delete_monitors', false );
        echo '<input type="hidden" name="qaproof_uninstall_delete_monitors" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_monitors" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete all monitors and their regression results', 'qaproof' ) . '</label>';
    }

    public static function sanitize_api_key( $value ) {
        $value = sanitize_text_field( $value );

        if ( '' === $value ) {
            return $value;
        }

        // Legacy: qap_<64 hex>. Current: qap_(live|test)_sk_<48 hex>.
        $legacy  = '/^qap_[0-9a-f]{64}$/i';
        $current = '/^qap_(?:live|test)_sk_[0-9a-f]{48}$/i';
        if ( ! preg_match( $legacy, $value ) && ! preg_match( $current, $value ) ) {
            add_settings_error(
                'qaproof_api_key',
                'invalid_format',
                __( 'Invalid API key format. Expected a key starting with "qap_live_sk_" or "qap_test_sk_". Get your key at qaproof.io/app/api-keys.', 'qaproof' ),
                'error'
            );
            return get_option( 'qaproof_api_key', '' );
        }

        return $value;
    }

    /**
     * 16-char hash of the API key. Used to scope local rows per-account
     * without storing the key itself.
     */
    public static function get_api_key_hash( $key = null ) {
        $key = ( $key !== null ) ? $key : self::get_api_key();
        if ( empty( $key ) ) {
            return '';
        }
        return substr( hash( 'sha256', $key ), 0, 16 );
    }

    public static function sanitize_max_history( $value ) {
        $value = absint( $value );
        return max( 5, min( 30, $value ) );
    }

    public static function get_api_key() {
        return get_option( 'qaproof_api_key', '' );
    }

    /**
     * Sanitize a Figma URL with a host-allowlist (figma.com / figma-gov.com).
     * Returns the URL on match, '' otherwise.
     */
    public static function sanitize_figma_url( $raw ) {
        if ( ! is_string( $raw ) ) return '';
        $url = sanitize_url( $raw );
        if ( $url === '' ) return '';
        $host = wp_parse_url( $url, PHP_URL_HOST );
        if ( ! is_string( $host ) ) return '';
        $host = strtolower( $host );
        if ( $host === 'figma.com' || $host === 'www.figma.com' ||
             $host === 'figma-gov.com' || $host === 'www.figma-gov.com' ) {
            return $url;
        }
        return '';
    }

    /**
     * Get the API endpoint (no trailing slash). Defaults to api.qaproof.io;
     * site operators can override via the QAPROOF_API_ENDPOINT constant in
     * wp-config.php (env vars are intentionally NOT honored). Malformed
     * overrides fall back to the default.
     */
    public static function get_api_endpoint() {
        if ( defined( 'QAPROOF_API_ENDPOINT' ) ) {
            $override = (string) QAPROOF_API_ENDPOINT;
            $parts = wp_parse_url( $override );
            if ( is_array( $parts )
                && isset( $parts['scheme'], $parts['host'] )
                && in_array( strtolower( $parts['scheme'] ), [ 'http', 'https' ], true )
                && $parts['host'] !== ''
                && empty( $parts['user'] )
                && empty( $parts['pass'] )
            ) {
                $rebuilt = $parts['scheme'] . '://' . $parts['host'];
                if ( ! empty( $parts['port'] ) ) {
                    $rebuilt .= ':' . (int) $parts['port'];
                }
                if ( ! empty( $parts['path'] ) && strpos( $parts['path'], '..' ) === false ) {
                    $rebuilt .= rtrim( $parts['path'], '/' );
                }
                return $rebuilt;
            }
            if ( function_exists( 'qaproof_debug_log' ) ) {
                qaproof_debug_log( '[QAProof] QAPROOF_API_ENDPOINT override rejected (malformed URL): ' . $override );
            }
        }
        return 'https://api.qaproof.io';
    }
}
