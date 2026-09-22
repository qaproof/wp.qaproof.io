<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Site Audit page partial.
 *
 * Three states, one visible at a time — start, progress, report — because a
 * run takes 10–35 minutes and "is it stuck?" is the question the screen has
 * to keep answering. The audit id is kept in the URL and in localStorage, so
 * closing wp-admin does not lose the run.
 *
 * The report leads with the two things a person can act on: what changed
 * since the last audit, and which single fix covers the most pages.
 *
 * Expected variables:
 *   $settings_url (string)
 *   $site_url     (string) this WordPress site, pre-filled into the form
 */
?>
<div class="wrap" id="qaproof-app">
    <h1 class="screen-reader-text"><?php esc_html_e( 'Site Audit', 'qaproof' ); ?></h1>
    <?php include __DIR__ . '/partial-theme-toggle.php'; ?>

    <div class="qaproof-page-header">
        <div class="qaproof-page-header-left">
            <h1><?php esc_html_e( 'Site Audit', 'qaproof' ); ?></h1>
            <p class="qaproof-subtitle">
                <?php esc_html_e( 'Check every page of this site against WCAG 2.1 AA and see which fixes cover the most pages', 'qaproof' ); ?>
            </p>
        </div>
    </div>

    <!-- ── State 1: start ──────────────────────────────────────────────── -->
    <div id="qasa-start" class="qaproof-card">
        <form id="qasa-form">
            <label class="qasa-label" for="qasa-url"><?php esc_html_e( 'Site URL', 'qaproof' ); ?></label>
            <div class="qasa-row">
                <input type="url" id="qasa-url" class="regular-text"
                       value="<?php echo esc_attr( $site_url ); ?>"
                       placeholder="https://example.com" spellcheck="false" />
                <button type="submit" class="button button-primary" id="qasa-submit">
                    <?php esc_html_e( 'Audit this site', 'qaproof' ); ?>
                </button>
            </div>
            <p class="description" id="qasa-hint" style="display:none;">
                <?php esc_html_e( "We read the site's sitemap to find pages. Up to", 'qaproof' ); ?>
                <strong id="qasa-budget"></strong>
                <?php esc_html_e( 'pages on your plan.', 'qaproof' ); ?>
            </p>
            <div class="qasa-error notice notice-error" id="qasa-error" role="alert" style="display:none;">
                <p id="qasa-error-text"></p>
            </div>
        </form>

        <div class="qasa-recent" id="qasa-recent" style="display:none;">
            <h2 class="qasa-recent-title"><?php esc_html_e( 'Recent audits', 'qaproof' ); ?></h2>
            <div id="qasa-recent-list"></div>
        </div>
    </div>

    <!-- ── State 2: progress ───────────────────────────────────────────── -->
    <div id="qasa-progress" class="qaproof-card" style="display:none;">
        <div class="qasa-prog-head">
            <div>
                <div class="qasa-prog-phase" id="qasa-phase"><?php esc_html_e( 'Finding pages…', 'qaproof' ); ?></div>
                <div class="qasa-prog-url" id="qasa-prog-url"></div>
            </div>
            <button type="button" class="button" id="qasa-back"><?php esc_html_e( 'Back', 'qaproof' ); ?></button>
        </div>

        <div class="qasa-bar"><div class="qasa-bar-fill" id="qasa-bar-fill"></div></div>
        <div class="qasa-prog-meta">
            <span id="qasa-prog-count">0 / 0</span>
            <span id="qasa-prog-eta"></span>
        </div>

        <p class="description">
            <?php esc_html_e( 'This keeps running if you close this page — come back any time.', 'qaproof' ); ?>
        </p>

        <div class="qasa-pagelist" id="qasa-prog-pages"></div>
    </div>

    <!-- ── State 3: report ─────────────────────────────────────────────── -->
    <div id="qasa-report" style="display:none;">
        <div class="qaproof-card qasa-summary">
            <div class="qasa-summary-left">
                <div class="qasa-score-ring"><span id="qasa-score">&mdash;</span></div>
                <div>
                    <div class="qasa-summary-host" id="qasa-host"></div>
                    <div class="qasa-summary-sub" id="qasa-coverage"></div>
                </div>
            </div>
            <div class="qasa-summary-right">
                <div class="qasa-stat"><strong id="qasa-stat-high">0</strong><span><?php esc_html_e( 'High', 'qaproof' ); ?></span></div>
                <div class="qasa-stat"><strong id="qasa-stat-medium">0</strong><span><?php esc_html_e( 'Medium', 'qaproof' ); ?></span></div>
                <div class="qasa-stat"><strong id="qasa-stat-low">0</strong><span><?php esc_html_e( 'Low', 'qaproof' ); ?></span></div>
                <div class="qasa-stat qasa-stat-review"><strong id="qasa-stat-review">0</strong><span><?php esc_html_e( 'Unverified', 'qaproof' ); ?></span></div>
            </div>
        </div>

        <!-- Proof of fix. Hidden until this site has been audited before —
             there is nothing honest to say on a first run. -->
        <div class="qaproof-card qasa-diff" id="qasa-diff" style="display:none;">
            <h2 class="qasa-h2"><?php esc_html_e( 'Since your last audit', 'qaproof' ); ?></h2>
            <p class="qasa-h2-sub" id="qasa-diff-sub"></p>
            <div class="qasa-diff-stats">
                <div class="qasa-diff-stat qasa-diff-fixed">
                    <strong id="qasa-diff-resolved">0</strong><span><?php esc_html_e( 'resolved', 'qaproof' ); ?></span>
                </div>
                <div class="qasa-diff-stat qasa-diff-new">
                    <strong id="qasa-diff-new">0</strong><span><?php esc_html_e( 'new', 'qaproof' ); ?></span>
                </div>
                <div class="qasa-diff-stat">
                    <strong id="qasa-diff-unchanged">0</strong><span><?php esc_html_e( 'still open', 'qaproof' ); ?></span>
                </div>
            </div>
            <div id="qasa-diff-lists"></div>
        </div>

        <div class="qaproof-card">
            <h2 class="qasa-h2"><?php esc_html_e( 'Fixes that cover the most pages', 'qaproof' ); ?></h2>
            <p class="qasa-h2-sub"><?php esc_html_e( 'The same defect on many pages is usually one template. Start at the top.', 'qaproof' ); ?></p>
            <div id="qasa-groups"></div>
        </div>

        <div class="qaproof-card">
            <h2 class="qasa-h2"><?php esc_html_e( 'Pages', 'qaproof' ); ?></h2>
            <div class="qasa-pagelist" id="qasa-report-pages"></div>
        </div>

        <p class="submit">
            <button type="button" class="button" id="qasa-new"><?php esc_html_e( 'Run another audit', 'qaproof' ); ?></button>
        </p>
    </div>

    <?php include __DIR__ . '/partial-brand-icon.php'; ?>
</div>
