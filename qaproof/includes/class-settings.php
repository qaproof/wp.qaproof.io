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
    const PAGE_SLUG              = 'qaproof-settings';

    public static function init() {
        add_action( 'admin_init', [ __CLASS__, 'register_settings' ] );
    }

    public static function register_settings() {
        register_setting( self::GROUP_GENERAL, 'qaproof_api_key', [
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default'           => '',
        ]);

        // General tab — API Configuration
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

        // Monitors tab — Monitoring defaults
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

        // ============================
        // Tests tab — General
        // ============================
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
            'sanitize_callback' => 'absint',
            'default'           => 100,
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

        // ============================
        // Tests tab — Design Fidelity
        // ============================
        register_setting( self::GROUP_TESTS_FIDELITY, 'qaproof_saved_designs', [
            'type'              => 'string',
            'sanitize_callback' => [ __CLASS__, 'sanitize_saved_designs' ],
            'default'           => '[]',
        ]);

        register_setting( self::GROUP_TESTS_FIDELITY, 'qaproof_fidelity_pass_score', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 80,
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
            'qaproof_fidelity_pass_score',
            __( 'Pass Score', 'qaproof' ),
            [ __CLASS__, 'render_fidelity_pass_score_field' ],
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

        // ============================
        // Tests tab — Responsive
        // ============================
        register_setting( self::GROUP_TESTS_RESPONSIVE, 'qaproof_responsive_pass_score', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 80,
        ]);

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
            'qaproof_responsive_pass_score',
            __( 'Pass Score', 'qaproof' ),
            [ __CLASS__, 'render_responsive_pass_score_field' ],
            'qaproof-settings-tests-responsive',
            'qaproof_tests_responsive_section'
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
        register_setting( self::GROUP_TESTS_A11Y, 'qaproof_accessibility_pass_score', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 80,
        ]);

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
            'qaproof_accessibility_pass_score',
            __( 'Pass Score', 'qaproof' ),
            [ __CLASS__, 'render_accessibility_pass_score_field' ],
            'qaproof-settings-tests-accessibility',
            'qaproof_tests_accessibility_section'
        );

        add_settings_field(
            'qaproof_wcag_level',
            __( 'WCAG Conformance Level', 'qaproof' ),
            [ __CLASS__, 'render_wcag_level_field' ],
            'qaproof-settings-tests-accessibility',
            'qaproof_tests_accessibility_section'
        );
    }

    public static function render_section_description() {
        echo '<p>' . esc_html__( 'Enter your API credentials to connect to the QAProof service.', 'qaproof' ) . '</p>';
    }

    public static function render_api_key_field() {
        $value = get_option( 'qaproof_api_key', '' );
        echo '<input type="password" name="qaproof_api_key" value="' . esc_attr( $value ) . '" class="regular-text" autocomplete="off" />';
        echo '<p class="description">' . esc_html__( 'Your API key from the QAProof dashboard.', 'qaproof' ) . '</p>';
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
        $value = get_option( 'qaproof_default_threshold', 90 );
        echo '<input type="number" name="qaproof_default_threshold" value="' . esc_attr( $value ) . '" min="0" max="100" step="1" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Score below this threshold triggers notifications. 0-100, default 90.', 'qaproof' ) . '</p>';
    }

    // ============================
    // Tests — General Fields
    // ============================
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
        $value = get_option( 'qaproof_max_history', 100 );
        echo '<input type="number" name="qaproof_max_history" value="' . esc_attr( $value ) . '" min="10" max="1000" step="10" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Maximum number of test results to keep. Oldest results are pruned automatically.', 'qaproof' ) . '</p>';
    }

    // ============================
    // Tests — Fidelity Fields
    // ============================
    public static function sanitize_saved_designs( $input ) {
        if ( empty( $input ) ) return '[]';
        $designs = json_decode( stripslashes( $input ), true );
        if ( ! is_array( $designs ) ) return '[]';

        $clean = [];
        foreach ( $designs as $d ) {
            if ( empty( $d['name'] ) ) continue;
            $clean[] = [
                'id'         => isset( $d['id'] ) ? sanitize_text_field( $d['id'] ) : bin2hex( random_bytes( 4 ) ),
                'name'       => sanitize_text_field( $d['name'] ),
                'pageUrl'    => isset( $d['pageUrl'] ) ? sanitize_url( $d['pageUrl'] ) : '',
                'figmaToken' => isset( $d['figmaToken'] ) ? sanitize_text_field( $d['figmaToken'] ) : '',
                'figmaUrl'   => isset( $d['figmaUrl'] ) ? sanitize_url( $d['figmaUrl'] ) : '',
            ];
        }
        return wp_json_encode( $clean );
    }

    public static function get_saved_designs() {
        $raw = get_option( 'qaproof_saved_designs', '[]' );
        $designs = json_decode( $raw, true );
        return is_array( $designs ) ? $designs : [];
    }

    public static function render_saved_designs_field() {
        $designs = self::get_saved_designs();
        ?>
        <div id="qaproof-saved-designs-wrap">
            <div id="qaproof-saved-designs-list">
                <?php if ( empty( $designs ) ) : ?>
                    <p class="description qaproof-no-designs"><?php esc_html_e( 'No saved designs yet. Click "Add Design" to create one.', 'qaproof' ); ?></p>
                <?php endif; ?>
                <?php foreach ( $designs as $i => $d ) : ?>
                <div class="qaproof-design-row" data-index="<?php echo $i; ?>">
                    <div class="qaproof-design-row-fields">
                        <input type="text" placeholder="<?php esc_attr_e( 'Design Name', 'qaproof' ); ?>" value="<?php echo esc_attr( $d['name'] ); ?>" data-field="name" class="regular-text" />
                        <input type="url" placeholder="<?php esc_attr_e( 'Page URL', 'qaproof' ); ?>" value="<?php echo esc_url( $d['pageUrl'] ); ?>" data-field="pageUrl" class="regular-text" />
                        <input type="password" placeholder="figd_..." value="<?php echo esc_attr( $d['figmaToken'] ); ?>" data-field="figmaToken" class="regular-text" autocomplete="off" />
                        <input type="url" placeholder="<?php esc_attr_e( 'Figma URL', 'qaproof' ); ?>" value="<?php echo esc_url( $d['figmaUrl'] ); ?>" data-field="figmaUrl" class="regular-text" />
                        <input type="hidden" value="<?php echo esc_attr( $d['id'] ); ?>" data-field="id" />
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
        <p class="description"><?php esc_html_e( 'Save Figma designs here, then select them by name on the Tests page.', 'qaproof' ); ?></p>
        <?php
    }

    public static function render_fidelity_pass_score_field() {
        $value = get_option( 'qaproof_fidelity_pass_score', 80 );
        echo '<input type="number" name="qaproof_fidelity_pass_score" value="' . esc_attr( $value ) . '" min="0" max="100" step="1" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Scores below this value are considered failing. 0-100.', 'qaproof' ) . '</p>';
    }

    public static function render_fidelity_ignore_text_field() {
        $value = get_option( 'qaproof_fidelity_ignore_text', true );
        echo '<label><input type="checkbox" name="qaproof_fidelity_ignore_text" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Ignore text content differences (focus on visual layout only).', 'qaproof' ) . '</label>';
        echo '<p class="description">' . esc_html__( 'When enabled, AI analysis focuses on layout, colors, and spacing rather than text accuracy.', 'qaproof' ) . '</p>';
    }

    // ============================
    // Tests — Responsive Fields
    // ============================
    public static function render_responsive_pass_score_field() {
        $value = get_option( 'qaproof_responsive_pass_score', 80 );
        echo '<input type="number" name="qaproof_responsive_pass_score" value="' . esc_attr( $value ) . '" min="0" max="100" step="1" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Scores below this value are considered failing. 0-100.', 'qaproof' ) . '</p>';
    }

    public static function render_viewports_field() {
        $desktop = get_option( 'qaproof_viewport_desktop', 1920 );
        $tablet  = get_option( 'qaproof_viewport_tablet', 768 );
        $mobile  = get_option( 'qaproof_viewport_mobile', 375 );
        ?>
        <fieldset>
            <label>
                <?php esc_html_e( 'Desktop:', 'qaproof' ); ?>
                <input type="number" name="qaproof_viewport_desktop" value="<?php echo esc_attr( $desktop ); ?>" min="800" max="3840" step="1" class="small-text" />
            </label>
            <br />
            <label>
                <?php esc_html_e( 'Tablet:', 'qaproof' ); ?>
                <input type="number" name="qaproof_viewport_tablet" value="<?php echo esc_attr( $tablet ); ?>" min="320" max="1200" step="1" class="small-text" style="margin-left: 12px;" />
            </label>
            <br />
            <label>
                <?php esc_html_e( 'Mobile:', 'qaproof' ); ?>
                <input type="number" name="qaproof_viewport_mobile" value="<?php echo esc_attr( $mobile ); ?>" min="280" max="480" step="1" class="small-text" style="margin-left: 8px;" />
            </label>
        </fieldset>
        <p class="description"><?php esc_html_e( 'Viewport widths (in pixels) used for responsive screenshots.', 'qaproof' ); ?></p>
        <?php
    }

    // ============================
    // Tests — Accessibility Fields
    // ============================
    public static function render_accessibility_pass_score_field() {
        $value = get_option( 'qaproof_accessibility_pass_score', 80 );
        echo '<input type="number" name="qaproof_accessibility_pass_score" value="' . esc_attr( $value ) . '" min="0" max="100" step="1" class="small-text" />';
        echo '<p class="description">' . esc_html__( 'Scores below this value are considered failing. 0-100.', 'qaproof' ) . '</p>';
    }

    public static function render_wcag_level_field() {
        $value = get_option( 'qaproof_wcag_level', 'AA' );
        ?>
        <select name="qaproof_wcag_level">
            <option value="A" <?php selected( $value, 'A' ); ?>>Level A (minimum)</option>
            <option value="AA" <?php selected( $value, 'AA' ); ?>>Level AA (recommended)</option>
            <option value="AAA" <?php selected( $value, 'AAA' ); ?>>Level AAA (enhanced)</option>
        </select>
        <p class="description"><?php esc_html_e( 'WCAG 2.1 conformance level to test against. AA is the standard for most websites.', 'qaproof' ); ?></p>
        <?php
    }

    /**
     * Get the configured API key.
     */
    public static function get_api_key() {
        return get_option( 'qaproof_api_key', '' );
    }

    /**
     * Get the configured API endpoint (no trailing slash).
     */
    public static function get_api_endpoint() {
        $env = getenv( 'QAPROOF_API_ENDPOINT' );
        return $env ? rtrim( $env, '/' ) : 'https://api.qaproof.io';
    }
}
