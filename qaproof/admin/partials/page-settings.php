<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Settings page partial.
 *
 * Expected variables:
 *   $active_tab    (string)
 *   $active_subtab (string)
 *   $base_url      (string)
 */
?>
<div class="wrap" id="qaproof-app">
    <?php include __DIR__ . '/partial-theme-toggle.php'; ?>
    <h1><?php esc_html_e( 'Settings', 'qaproof' ); ?></h1>

    <!-- Settings Tabs -->
    <div class="qaproof-settings-tabs">
        <a href="<?php echo esc_url( $base_url . '&tab=general' ); ?>"
           class="qaproof-settings-tab <?php echo esc_attr( $active_tab === 'general' ? 'active' : '' ); ?>">
            <?php esc_html_e( 'General', 'qaproof' ); ?>
        </a>
        <a href="<?php echo esc_url( $base_url . '&tab=tests' ); ?>"
           class="qaproof-settings-tab <?php echo esc_attr( $active_tab === 'tests' ? 'active' : '' ); ?>">
            <?php esc_html_e( 'Tests', 'qaproof' ); ?>
        </a>
        <a href="<?php echo esc_url( $base_url . '&tab=monitors' ); ?>"
           class="qaproof-settings-tab <?php echo esc_attr( $active_tab === 'monitors' ? 'active' : '' ); ?>">
            <?php esc_html_e( 'Monitors', 'qaproof' ); ?>
        </a>
        <a href="<?php echo esc_url( $base_url . '&tab=uninstall' ); ?>"
           class="qaproof-settings-tab <?php echo esc_attr( $active_tab === 'uninstall' ? 'active' : '' ); ?>">
            <?php esc_html_e( 'Data Cleanup', 'qaproof' ); ?>
        </a>
    </div>

    <div class="qaproof-card">
        <?php if ( $active_tab === 'tests' ) : ?>
            <!-- Test Subtabs -->
            <div class="qaproof-settings-subtabs">
                <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=general' ); ?>"
                   class="qaproof-settings-subtab <?php echo esc_attr( $active_subtab === 'general' ? 'active' : '' ); ?>">
                    <?php esc_html_e( 'General', 'qaproof' ); ?>
                </a>
                <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=fidelity' ); ?>"
                   class="qaproof-settings-subtab <?php echo esc_attr( $active_subtab === 'fidelity' ? 'active' : '' ); ?>">
                    <?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?>
                </a>
                <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=responsive' ); ?>"
                   class="qaproof-settings-subtab <?php echo esc_attr( $active_subtab === 'responsive' ? 'active' : '' ); ?>">
                    <?php esc_html_e( 'Responsive', 'qaproof' ); ?>
                </a>
                <a href="<?php echo esc_url( $base_url . '&tab=tests&subtab=accessibility' ); ?>"
                   class="qaproof-settings-subtab <?php echo esc_attr( $active_subtab === 'accessibility' ? 'active' : '' ); ?>">
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
            <?php elseif ( $active_tab === 'uninstall' ) : ?>
                <?php settings_fields( QAProof_Settings::GROUP_UNINSTALL ); ?>
                <?php do_settings_sections( 'qaproof-settings-uninstall' ); ?>
            <?php endif; ?>

            <?php submit_button(); ?>
        </form>
    </div>

    <!-- Brand Badge -->
    <div class="qaproof-brand-badge">
        <?php include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-brand-icon.php'; ?>
        <span>QAProof v<?php echo esc_html( QAPROOF_VERSION ); ?></span>
    </div>
</div>
