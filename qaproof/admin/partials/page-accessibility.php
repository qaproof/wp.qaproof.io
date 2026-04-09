<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Accessibility page partial.
 *
 * Expected variables:
 *   $settings_url (string)
 *   $prefix       (string) 'a11y'
 *   $filters      (array)
 *   $inline       (bool)
 */
?>
<div class="wrap" id="qaproof-app">
    <div class="qaproof-page-header">
        <div class="qaproof-page-header-left">
            <h1><?php esc_html_e( 'Accessibility Audit', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle"><?php esc_html_e( 'WCAG 2.1 compliance analysis for your web pages', 'qaproof' ); ?></p>
        </div>
        <div class="qaproof-page-header-right">
            <div class="qaproof-page-tabs" id="qaproof-a11y-page-tabs">
                <button type="button" class="qaproof-page-tab active" data-tab="a11y-audit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                    <?php esc_html_e( 'Audit', 'qaproof' ); ?>
                </button>
                <button type="button" class="qaproof-page-tab" data-tab="a11y-history">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <?php esc_html_e( 'History', 'qaproof' ); ?>
                </button>
            </div>
            <?php include __DIR__ . '/partial-theme-toggle.php'; ?>
        </div>
    </div>

    <?php if ( empty( QAProof_Settings::get_api_key() ) ) : ?>
        <div class="notice notice-warning inline">
            <p>
                <?php printf(
                    esc_html__( 'API key not configured. %sGo to Settings%s to add your key.', 'qaproof' ),
                    '<a href="' . esc_url( $settings_url ) . '">',
                    '</a>'
                ); ?>
            </p>
        </div>
    <?php endif; ?>

    <!-- Tab: Audit -->
    <div class="qaproof-tab-panel active" id="qaproof-tab-a11y-audit" data-tab-panel="a11y-audit">

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

    </div><!-- /.qaproof-tab-panel #qaproof-tab-a11y-audit -->

    <!-- Tab: History -->
    <div class="qaproof-tab-panel" id="qaproof-tab-a11y-history" data-tab-panel="a11y-history">
        <?php
        $prefix  = 'a11y';
        $filters = [];
        $inline  = true;
        include __DIR__ . '/partial-test-history.php';
        ?>
    </div><!-- /.qaproof-tab-panel #qaproof-tab-a11y-history -->

    <!-- Brand Badge -->
    <div class="qaproof-brand-badge">
        <span class="qaproof-brand-dot"></span>
        <span>QAProof v<?php echo esc_html( QAPROOF_VERSION ); ?></span>
    </div>
</div>
