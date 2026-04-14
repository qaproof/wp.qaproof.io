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
    }

    public static function register_settings() {
        register_setting( self::GROUP_GENERAL, 'qaproof_api_key', [
            'type'              => 'string',
            'sanitize_callback' => [ __CLASS__, 'sanitize_api_key' ],
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

        // ============================
        // Tests tab — Design Fidelity
        // ============================
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
                echo '<div class="qaproof-figma-plan-notice" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin: 12px 0 20px; border-radius: 4px;">';
                echo '<strong>' . esc_html__( 'Figma API Limits', 'qaproof' ) . '</strong><br>';
                echo esc_html__( 'Each saved design requires only 1 Figma API call — once fetched, the image and detected elements are cached in WordPress and reused for all future tests (zero API calls). However, Figma enforces strict rate limits by plan: Starter (~6 requests/month), Professional (~unlimited). If you hit the limit, you can always export your design as an image and use "Upload Image" on the Tests page instead.', 'qaproof' );
                echo '</div>';
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

        // ============================
        // Tests tab — Responsive
        // ============================
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

        // ============================
        // Data Cleanup tab — Uninstall preferences
        // ============================
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_api_key', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_settings', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_saved_designs', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_test_history', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
        ]);
        register_setting( self::GROUP_UNINSTALL, 'qaproof_uninstall_delete_monitors', [
            'type'              => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default'           => true,
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
        echo '<p>' . esc_html__( 'Enter your API credentials to connect to the QAProof service.', 'qaproof' ) . '</p>';
    }

    public static function render_api_key_field() {
        $value = get_option( 'qaproof_api_key', '' );
        echo '<div class="qaproof-api-key-wrapper">';
        echo '  <input type="password" id="qaproof_api_key" name="qaproof_api_key" value="' . esc_attr( $value ) . '" class="regular-text" autocomplete="off" placeholder="qap_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />';
        echo '  <button type="button" class="qaproof-eye-toggle" title="' . esc_attr__( 'Show/Hide API Key', 'qaproof' ) . '">';
        echo '    <svg class="qaproof-eye-icon qaproof-eye-off" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        echo '    <svg class="qaproof-eye-icon qaproof-eye-on" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        echo '  </button>';
        echo '  <span class="qaproof-key-fade"></span>';
        echo '</div>';
        echo '<p class="qaproof-api-key-error" style="display:none;"></p>';
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
        $value = get_option( 'qaproof_max_history', 30 );
        echo '<input type="number" name="qaproof_max_history" value="' . esc_attr( $value ) . '" min="5" max="30" step="5" class="small-text" />';
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
            $entry = [
                'id'         => isset( $d['id'] ) ? sanitize_text_field( $d['id'] ) : bin2hex( random_bytes( 4 ) ),
                'name'       => sanitize_text_field( $d['name'] ),
                'pageUrl'    => isset( $d['pageUrl'] ) ? sanitize_url( $d['pageUrl'] ) : '',
                'figmaToken' => isset( $d['figmaToken'] ) ? sanitize_text_field( $d['figmaToken'] ) : '',
                'figmaUrl'   => isset( $d['figmaUrl'] ) ? sanitize_url( $d['figmaUrl'] ) : '',
            ];
            // Preserve cached image + detected elements (not submitted through settings form)
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

    public static function get_saved_designs() {
        $raw = get_option( 'qaproof_saved_designs', '[]' );
        $designs = json_decode( $raw, true );
        return is_array( $designs ) ? $designs : [];
    }

    /**
     * Update the cached image for a specific saved design.
     *
     * @param string $design_id  The design's unique ID.
     * @param string $image_b64  The full data-URL (data:image/png;base64,...).
     * @return bool True if updated, false if design not found.
     */
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

    /**
     * Clear the cached image for a specific saved design.
     *
     * @param string $design_id  The design's unique ID.
     * @return bool True if cleared, false if design not found.
     */
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

    /**
     * Store cached element detection data for a saved design.
     *
     * @param string $design_id  The design's unique ID.
     * @param array  $elements   Array of detected elements (from detect-elements API).
     * @param string $source     Detection source ('figma-api' or 'ai-vision').
     * @return bool True if saved, false if design not found.
     */
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

    /**
     * Clear cached element detection data for a saved design.
     *
     * @param string $design_id  The design's unique ID.
     * @return bool True if cleared, false if design not found.
     */
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
                    // Stale ai-vision cache upgrade path: if the design has a
                    // Figma URL, force re-detection so we get pixel-perfect
                    // Figma-API overlays instead of approximate AI vision ones.
                    $has_figma_source = ! empty( $d['figmaUrl'] ) && ! empty( $d['figmaToken'] );
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
                        <div class="qaproof-token-field-wrap">
                            <input type="password" placeholder="<?php esc_attr_e( 'Figma Token (figd_...)', 'qaproof' ); ?>" value="<?php echo esc_attr( $d['figmaToken'] ); ?>" data-field="figmaToken" class="regular-text" autocomplete="off" />
                            <button type="button" class="qaproof-token-toggle" title="<?php esc_attr_e( 'Show / Hide token', 'qaproof' ); ?>">
                                <svg class="qaproof-eye-icon qaproof-eye-off" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                <svg class="qaproof-eye-icon qaproof-eye-on" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <span class="qaproof-token-fade"></span>
                        </div>
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

    // ============================
    // Tests — Responsive Fields
    // ============================
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

    // ============================
    // Tests — Accessibility Fields
    // ============================
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
        $value = get_option( 'qaproof_uninstall_delete_api_key', true );
        echo '<input type="hidden" name="qaproof_uninstall_delete_api_key" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_api_key" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete API key on uninstall', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_settings_field() {
        $value = get_option( 'qaproof_uninstall_delete_settings', true );
        echo '<input type="hidden" name="qaproof_uninstall_delete_settings" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_settings" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete notification, threshold, viewport, and test settings', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_saved_designs_field() {
        $value = get_option( 'qaproof_uninstall_delete_saved_designs', true );
        echo '<input type="hidden" name="qaproof_uninstall_delete_saved_designs" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_saved_designs" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete saved designs (including cached images)', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_test_history_field() {
        $value = get_option( 'qaproof_uninstall_delete_test_history', true );
        echo '<input type="hidden" name="qaproof_uninstall_delete_test_history" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_test_history" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete all test history records', 'qaproof' ) . '</label>';
    }

    public static function render_uninstall_monitors_field() {
        $value = get_option( 'qaproof_uninstall_delete_monitors', true );
        echo '<input type="hidden" name="qaproof_uninstall_delete_monitors" value="0" />';
        echo '<label><input type="checkbox" name="qaproof_uninstall_delete_monitors" value="1" ' . checked( $value, true, false ) . ' /> ';
        echo esc_html__( 'Delete all monitors and their regression results', 'qaproof' ) . '</label>';
    }

    /**
     * Sanitize and validate the API key on save.
     */
    public static function sanitize_api_key( $value ) {
        $value = sanitize_text_field( $value );

        // Allow empty value (clearing the key).
        if ( '' === $value ) {
            return $value;
        }

        // Must match format: prefix_ followed by 64 hex characters (e.g. qap_..., uiux_...).
        if ( ! preg_match( '/^[a-z0-9]+_[0-9a-f]{64}$/i', $value ) ) {
            add_settings_error(
                'qaproof_api_key',
                'invalid_format',
                __( 'Invalid API key format: must be a prefix followed by underscore and 64 hexadecimal characters.', 'qaproof' ),
                'error'
            );
            return get_option( 'qaproof_api_key', '' );
        }

        return $value;
    }

    /**
     * Sanitize max history — clamp between 5 and 30.
     */
    public static function sanitize_max_history( $value ) {
        $value = absint( $value );
        return max( 5, min( 30, $value ) );
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
