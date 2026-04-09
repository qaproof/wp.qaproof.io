<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Tests page partial.
 *
 * Expected variables:
 *   $settings_url (string)
 */
?>
<div class="wrap" id="qaproof-app">
    <div class="qaproof-page-header">
        <div class="qaproof-page-header-left">
            <h1><?php esc_html_e( 'Tests', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle"><?php esc_html_e( 'Analyze design fidelity, responsive behavior, and design consistency', 'qaproof' ); ?></p>
        </div>
        <div class="qaproof-page-header-right">
            <div class="qaproof-page-tabs" id="qaproof-page-tabs">
                <button type="button" class="qaproof-page-tab active" data-tab="test">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    <?php esc_html_e( 'Test', 'qaproof' ); ?>
                </button>
                <button type="button" class="qaproof-page-tab" data-tab="history">
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

    <!-- Tab: Test -->
    <div class="qaproof-tab-panel active" id="qaproof-tab-test" data-tab-panel="test">

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
                    <!-- Design source (hidden for responsive) -->
                    <div id="qaproof-figma-fields">
                        <table class="form-table">
                            <tr>
                                <th scope="row">
                                    <label><?php esc_html_e( 'Design Source', 'qaproof' ); ?></label>
                                </th>
                                <td>
                                    <div class="qaproof-source-toggle" id="qaproof-source-toggle">
                                        <button type="button" class="qaproof-source-btn active" data-source="saved">
                                            <?php esc_html_e( 'Saved Design', 'qaproof' ); ?>
                                        </button>
                                        <button type="button" class="qaproof-source-btn" data-source="upload">
                                            <?php esc_html_e( 'Upload Image', 'qaproof' ); ?>
                                        </button>
                                    </div>
                                    <!-- Saved design source -->
                                    <div id="qaproof-source-saved" style="margin-top: 16px;">
                                        <select id="qaproof-saved-design" class="regular-text">
                                            <option value=""><?php esc_html_e( '-- Select Design --', 'qaproof' ); ?></option>
                                        </select>
                                        <p class="description" style="margin-top: 6px;">
                                            <a href="<?php echo esc_url( admin_url( 'admin.php?page=qaproof-settings&tab=tests&subtab=fidelity' ) ); ?>"><?php esc_html_e( 'Manage designs in Settings', 'qaproof' ); ?></a>
                                        </p>
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
                                       value="" />
                                <p class="description"><?php esc_html_e( 'The live page URL to test.', 'qaproof' ); ?></p>
                            </td>
                        </tr>
                    </table>

                    <p class="submit">
                        <button type="submit" id="qaproof-submit-btn" class="button button-primary button-hero">
                            <?php esc_html_e( 'Analyze Design Fidelity', 'qaproof' ); ?>
                        </button>
                    </p>
                </div>

                <!-- Figma Design Preview Panel -->
                <div class="qaproof-form-right" id="qaproof-figma-preview-wrap">
                    <div class="qaproof-preview-panel" id="qaproof-figma-preview-panel">
                        <div class="qaproof-preview-header">
                            <span class="dashicons dashicons-visibility"></span>
                            <?php esc_html_e( 'Design Preview', 'qaproof' ); ?>
                            <button type="button" class="qaproof-save-design-btn" id="qaproof-save-design-btn" title="<?php esc_attr_e( 'Save image to selected design (no more API calls)', 'qaproof' ); ?>" style="display:none">
                                <span class="dashicons dashicons-download"></span>
                                <span class="qaproof-save-design-label"><?php esc_html_e( 'Save', 'qaproof' ); ?></span>
                            </button>
                            <button type="button" class="qaproof-refresh-figma-btn" id="qaproof-refresh-figma-btn" title="<?php esc_attr_e( 'Refresh from Figma (bypass cache)', 'qaproof' ); ?>" style="display:none">
                                <span class="dashicons dashicons-update"></span>
                            </button>
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

    </div><!-- /.qaproof-tab-panel #qaproof-tab-test -->

    <!-- Tab: History -->
    <div class="qaproof-tab-panel" id="qaproof-tab-history" data-tab-panel="history">
        <div id="qaproof-history-section" class="qaproof-history-section qaproof-history-inline">
            <div id="qaproof-history-content" class="qaproof-history-content">
                <div class="qaproof-history-filters" id="qaproof-history-filters">
                    <button type="button" class="qaproof-filter-btn active" data-type="">All</button>
                    <button type="button" class="qaproof-filter-btn" data-type="fidelity">Fidelity</button>
                    <button type="button" class="qaproof-filter-btn" data-type="responsive">Responsive</button>
                    <button type="button" class="qaproof-filter-btn" data-type="design-audit">Design Audit</button>
                </div>
                <div id="qaproof-history-list"></div>
                <div id="qaproof-history-loading" class="qaproof-history-loading-state hidden">
                    <span class="qaproof-spinner"></span> <?php esc_html_e( 'Loading...', 'qaproof' ); ?>
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
    </div><!-- /.qaproof-tab-panel #qaproof-tab-history -->

    <!-- Brand Badge -->
    <div class="qaproof-brand-badge">
        <span class="qaproof-brand-dot"></span>
        <?php esc_html_e( 'QAProof v1.0', 'qaproof' ); ?>
    </div>
</div>
