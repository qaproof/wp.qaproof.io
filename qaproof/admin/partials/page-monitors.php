<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Monitors page partial.
 *
 * Expected variables:
 *   $settings_url (string)
 */
?>
<div class="wrap" id="qaproof-app">
    <?php include __DIR__ . '/partial-theme-toggle.php'; ?>
    <h1><?php esc_html_e( 'Visual Regression Monitors', 'qaproof' ); ?></h1>
    <p class="qaproof-subtitle"><?php esc_html_e( 'Monitor pages for unintended visual changes.', 'qaproof' ); ?></p>

    <?php if ( empty( QAProof_Settings::get_api_key() ) ) : ?>
        <div class="notice notice-warning inline">
            <p>
                <?php
                    echo wp_kses_post( sprintf(
                    /* translators: %1$s: opening anchor tag, %2$s: closing anchor tag */
                    __( 'API key not configured. %1$sGo to Settings%2$s to add your key.', 'qaproof' ),
                    '<a href="' . esc_url( $settings_url ) . '">',
                    '</a>'
                ) );
                ?>
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
                               value="" />
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
                        <label for="qaproof-monitor-scheduled-at"><?php esc_html_e( 'Start Date', 'qaproof' ); ?></label>
                    </th>
                    <td>
                        <div class="qaproof-datepicker-wrap" id="qaproof-datepicker-wrap">
                            <input type="hidden" id="qaproof-monitor-scheduled-at" />
                            <button type="button" class="qaproof-datepicker-trigger" id="qaproof-datepicker-trigger">
                                <span id="qaproof-datepicker-label"><?php esc_html_e( 'Now', 'qaproof' ); ?></span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </button>
                            <div class="qaproof-datepicker-dropdown hidden" id="qaproof-datepicker-dropdown"></div>
                        </div>
                        <p class="description"><?php esc_html_e( 'When to start checking. Defaults to now.', 'qaproof' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="qaproof-monitor-threshold"><?php esc_html_e( 'Threshold Score', 'qaproof' ); ?></label>
                    </th>
                    <td>
                        <input type="number" id="qaproof-monitor-threshold" min="0" max="100" step="1"
                               value="<?php echo esc_attr( get_option( 'qaproof_default_threshold', 95 ) ); ?>" class="small-text" />
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
                <tr>
                    <th scope="row">
                        <label for="qaproof-monitor-notify-on"><?php esc_html_e( 'Send when', 'qaproof' ); ?></label>
                    </th>
                    <td>
                        <select id="qaproof-monitor-notify-on">
                            <option value="failures"><?php esc_html_e( 'Only on failures (score below threshold)', 'qaproof' ); ?></option>
                            <option value="all"><?php esc_html_e( 'Every run (always)', 'qaproof' ); ?></option>
                        </select>
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
        <div class="qaproof-loading-inner">
            <div class="qaproof-loading-left">
                <div class="qaproof-loading-spinner"></div>
                <div class="qaproof-loading-info">
                    <strong id="qaproof-monitors-loading-text"><?php esc_html_e( 'Loading monitors...', 'qaproof' ); ?></strong>
                </div>
            </div>
        </div>
    </div>

    <!-- Monitors Table -->
    <div id="qaproof-monitors-list"></div>

    <!-- Monitor Detail (results view) -->
    <div id="qaproof-monitor-detail" class="hidden"></div>

    <!-- Brand Badge -->
    <div class="qaproof-brand-badge">
        <?php include QAPROOF_PLUGIN_DIR . 'admin/partials/partial-brand-icon.php'; ?>
        <span>QAProof v<?php echo esc_html( QAPROOF_VERSION ); ?></span>
    </div>
</div>
