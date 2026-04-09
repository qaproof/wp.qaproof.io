<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Dashboard page partial.
 *
 * Expected variables:
 *   $monitors         (array)
 *   $total_monitors   (int)
 *   $active_monitors  (int)
 *   $total_tests      (int)
 *   $avg_score        (int|null)
 *   $has_api_key      (bool)
 *   $ring_radius      (int)
 *   $circumference    (float)
 *   $dash_offset      (float)
 *   $ring_color       (string)
 *   $tests_slug       (string)
 *   $accessibility_slug (string)
 *   $monitors_slug    (string)
 *   $settings_slug    (string)
 */
?>
<div class="wrap" id="qaproof-app">
    <?php include __DIR__ . '/partial-theme-toggle.php'; ?>
    <div class="qaproof-dash">

        <!-- Hero with integrated score ring -->
        <div class="qaproof-dash-hero">
            <div class="qaproof-dash-hero-left">
                <h1><?php esc_html_e( 'QAProof', 'qaproof' ); ?></h1>
                <p class="qaproof-dash-hero-tagline"><?php esc_html_e( 'AI-powered web quality assurance platform', 'qaproof' ); ?></p>
                <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $tests_slug ) ); ?>" class="qaproof-dash-hero-cta">
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
                        '<a href="' . esc_url( admin_url( 'admin.php?page=' . $settings_slug ) ) . '">',
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
                        '<a href="' . esc_url( admin_url( 'admin.php?page=' . $monitors_slug ) ) . '">',
                        '</a>'
                    ); ?></p>
                </div>
            </div>
        <?php endif; ?>

        <!-- Stats row -->
        <div class="qaproof-dash-stats">
            <div class="qaproof-dash-stat">
                <div class="qaproof-dash-stat-icon icon-tests"><span class="dashicons dashicons-chart-bar"></span></div>
                <div>
                    <div class="qaproof-dash-stat-val"><?php echo esc_html( $total_tests ); ?></div>
                    <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Total Tests', 'qaproof' ); ?></div>
                </div>
            </div>
            <div class="qaproof-dash-stat">
                <div class="qaproof-dash-stat-icon icon-score"><span class="dashicons dashicons-chart-area"></span></div>
                <div>
                    <div class="qaproof-dash-stat-val <?php echo $avg_score !== null ? esc_attr( QAProof_Admin::get_score_class( $avg_score ) ) : ''; ?>">
                        <?php echo $avg_score !== null ? esc_html( $avg_score ) : '—'; ?>
                    </div>
                    <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Avg Score', 'qaproof' ); ?></div>
                </div>
            </div>
            <div class="qaproof-dash-stat">
                <div class="qaproof-dash-stat-icon icon-monitors"><span class="dashicons dashicons-desktop"></span></div>
                <div>
                    <div class="qaproof-dash-stat-val"><?php echo esc_html( $active_monitors . '/' . $total_monitors ); ?></div>
                    <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Monitors', 'qaproof' ); ?></div>
                </div>
            </div>
            <div class="qaproof-dash-stat">
                <div class="qaproof-dash-stat-icon icon-tokens"><span class="dashicons dashicons-database"></span></div>
                <div>
                    <div class="qaproof-dash-stat-val"><?php echo esc_html( '4,280' ); ?></div>
                    <div class="qaproof-dash-stat-name"><?php esc_html_e( 'Tokens Used', 'qaproof' ); ?></div>
                </div>
            </div>
        </div>

        <!-- Token Usage -->
        <div class="qaproof-dash-usage">
            <div class="qaproof-dash-usage-header">
                <div class="qaproof-dash-usage-title">
                    <span class="dashicons dashicons-chart-pie"></span>
                    <?php esc_html_e( 'Token Usage', 'qaproof' ); ?>
                </div>
                <div class="qaproof-dash-usage-plan">
                    <span class="qaproof-dash-plan-badge">Pro</span>
                    <?php esc_html_e( 'Plan', 'qaproof' ); ?>
                </div>
            </div>
            <div class="qaproof-dash-usage-bar-wrap">
                <div class="qaproof-dash-usage-bar">
                    <div class="qaproof-dash-usage-bar-fill" style="width: 42.8%;"></div>
                </div>
                <div class="qaproof-dash-usage-nums">
                    <span><strong>4,280</strong> <?php esc_html_e( 'used', 'qaproof' ); ?></span>
                    <span><strong>10,000</strong> <?php esc_html_e( 'total', 'qaproof' ); ?></span>
                </div>
            </div>
            <div class="qaproof-dash-usage-breakdown">
                <div class="qaproof-dash-usage-item" data-color="teal">
                    <span class="qaproof-dash-usage-dot"></span>
                    <span class="qaproof-dash-usage-label"><?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?></span>
                    <span class="qaproof-dash-usage-count">1,420</span>
                </div>
                <div class="qaproof-dash-usage-item" data-color="blue">
                    <span class="qaproof-dash-usage-dot"></span>
                    <span class="qaproof-dash-usage-label"><?php esc_html_e( 'Responsive', 'qaproof' ); ?></span>
                    <span class="qaproof-dash-usage-count">980</span>
                </div>
                <div class="qaproof-dash-usage-item" data-color="purple">
                    <span class="qaproof-dash-usage-dot"></span>
                    <span class="qaproof-dash-usage-label"><?php esc_html_e( 'Accessibility', 'qaproof' ); ?></span>
                    <span class="qaproof-dash-usage-count">860</span>
                </div>
                <div class="qaproof-dash-usage-item" data-color="green">
                    <span class="qaproof-dash-usage-dot"></span>
                    <span class="qaproof-dash-usage-label"><?php esc_html_e( 'Design Audit', 'qaproof' ); ?></span>
                    <span class="qaproof-dash-usage-count">620</span>
                </div>
                <div class="qaproof-dash-usage-item" data-color="amber">
                    <span class="qaproof-dash-usage-dot"></span>
                    <span class="qaproof-dash-usage-label"><?php esc_html_e( 'Regression', 'qaproof' ); ?></span>
                    <span class="qaproof-dash-usage-count">400</span>
                </div>
            </div>
            <div class="qaproof-dash-usage-footer">
                <?php esc_html_e( 'Resets on May 1, 2026', 'qaproof' ); ?>
                <span class="qaproof-dash-usage-sep">&middot;</span>
                <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $settings_slug ) ); ?>"><?php esc_html_e( 'Upgrade Plan', 'qaproof' ); ?></a>
            </div>
        </div>

        <!-- Testing Tools -->
        <h2 class="qaproof-dash-section"><?php esc_html_e( 'Testing Tools', 'qaproof' ); ?></h2>

        <!-- Row 1: Three design test tools -->
        <div class="qaproof-dash-tools-top">
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $tests_slug ) ); ?>" class="qaproof-dash-tool" data-color="teal">
                <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-art"></span></div>
                <h3><?php esc_html_e( 'Design Fidelity', 'qaproof' ); ?></h3>
                <p><?php esc_html_e( 'Compare Figma mockups against live pages using AI vision analysis.', 'qaproof' ); ?></p>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
            </a>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $tests_slug ) ); ?>" class="qaproof-dash-tool" data-color="blue">
                <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-smartphone"></span></div>
                <h3><?php esc_html_e( 'Responsive Testing', 'qaproof' ); ?></h3>
                <p><?php esc_html_e( 'Analyze layout adaptation across desktop, tablet, and mobile viewports.', 'qaproof' ); ?></p>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
            </a>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $tests_slug ) ); ?>" class="qaproof-dash-tool" data-color="green">
                <div class="qaproof-dash-tool-icon"><span class="dashicons dashicons-analytics"></span></div>
                <h3><?php esc_html_e( 'Design Audit', 'qaproof' ); ?></h3>
                <p><?php esc_html_e( 'Extract design tokens and score system consistency with Design Debt Score.', 'qaproof' ); ?></p>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
            </a>
        </div>

        <!-- Row 2: Two wider horizontal cards -->
        <div class="qaproof-dash-tools-bottom">
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $accessibility_slug ) ); ?>" class="qaproof-dash-tool-wide" data-color="purple">
                <div class="qaproof-dash-tool-wide-icon"><span class="dashicons dashicons-universal-access"></span></div>
                <div class="qaproof-dash-tool-wide-content">
                    <h3><?php esc_html_e( 'Accessibility Audit', 'qaproof' ); ?></h3>
                    <p><?php esc_html_e( 'WCAG 2.1 compliance check — color contrast, ARIA, keyboard navigation, semantic HTML.', 'qaproof' ); ?></p>
                </div>
                <div class="qaproof-dash-tool-wide-tags">
                    <span class="qaproof-dash-tag">Level A</span>
                    <span class="qaproof-dash-tag">Level AA</span>
                    <span class="qaproof-dash-tag">Level AAA</span>
                </div>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
            </a>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $monitors_slug ) ); ?>" class="qaproof-dash-tool-wide" data-color="amber">
                <div class="qaproof-dash-tool-wide-icon"><span class="dashicons dashicons-visibility"></span></div>
                <div class="qaproof-dash-tool-wide-content">
                    <h3><?php esc_html_e( 'Visual Regression', 'qaproof' ); ?></h3>
                    <p><?php esc_html_e( 'Scheduled monitoring with baseline comparison and automated email alerts.', 'qaproof' ); ?></p>
                </div>
                <div class="qaproof-dash-tool-wide-tags">
                    <span class="qaproof-dash-tag">Daily</span>
                    <span class="qaproof-dash-tag">Weekly</span>
                    <span class="qaproof-dash-tag">Monthly</span>
                </div>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-tool-arrow"></span>
            </a>
        </div>

        <!-- Quick Links -->
        <h2 class="qaproof-dash-section"><?php esc_html_e( 'Quick Links', 'qaproof' ); ?></h2>
        <div class="qaproof-dash-links">
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $settings_slug ) ); ?>" class="qaproof-dash-link">
                <div class="qaproof-dash-link-icon"><span class="dashicons dashicons-admin-generic"></span></div>
                <div class="qaproof-dash-link-info">
                    <div class="qaproof-dash-link-title"><?php esc_html_e( 'Settings', 'qaproof' ); ?></div>
                    <div class="qaproof-dash-link-desc"><?php esc_html_e( 'API configuration, thresholds, and notification preferences', 'qaproof' ); ?></div>
                </div>
                <span class="dashicons dashicons-arrow-right-alt2 qaproof-dash-link-arrow"></span>
            </a>
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $monitors_slug ) ); ?>" class="qaproof-dash-link">
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
