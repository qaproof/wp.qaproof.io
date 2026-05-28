<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_Assets {

    public static function enqueue_assets( $hook ) {
        $our_pages = [
            QAProof_Admin::MENU_SLUG,
            QAProof_Admin::TESTS_SLUG,
            QAProof_Admin::ACCESSIBILITY_SLUG,
            QAProof_Admin::MONITORS_SLUG,
            QAProof_Admin::SETTINGS_SLUG,
        ];
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

        // Cache-bust on file mtime.
        $asset_ver = function ( $rel_path ) {
            $full = QAPROOF_PLUGIN_DIR . $rel_path;
            if ( file_exists( $full ) ) {
                return QAPROOF_VERSION . '.' . filemtime( $full );
            }
            return QAPROOF_VERSION;
        };

        // Each partial enqueued individually — @import URLs don't get the ?ver=
        // query, so browsers would cache them indefinitely. _fonts goes first.
        $css_partials = [
            '_fonts',
            '_variables',
            '_base',
            '_forms',
            '_scores',
            '_categories',
            '_screenshots',
            '_differences',
            '_components',
            '_dashboard',
            '_ui',
            '_dark-mode',
            '_monitors',
        ];
        $prev_handle = '';
        foreach ( $css_partials as $partial ) {
            $handle  = 'qaproof-' . ltrim( $partial, '_' );
            $rel     = 'admin/css/partials/' . $partial . '.css';
            wp_enqueue_style(
                $handle,
                QAPROOF_PLUGIN_URL . $rel,
                $prev_handle === '' ? [] : [ $prev_handle ],
                $asset_ver( $rel )
            );
            $prev_handle = $handle;
        }

        // Locally bundled vendor libs (MIT). See THIRD-PARTY-NOTICES.txt.
        // Handles are namespaced with the `qaproof-` prefix so they cannot
        // collide with another plugin that ships a different jsPDF / Chart.js
        // version under a generic handle — wp.org's handle-namespace guideline.
        $vendor_base = QAPROOF_PLUGIN_URL . 'admin/js/vendor/';
        wp_enqueue_script( 'qaproof-chartjs',
            $vendor_base . 'chart.umd.min.js',
            [],
            '4.5.1',
            true );
        wp_enqueue_script( 'qaproof-jspdf',
            $vendor_base . 'jspdf.umd.min.js',
            [],
            '3.0.3',
            true );
        wp_enqueue_script( 'qaproof-jspdf-autotable',
            $vendor_base . 'jspdf.plugin.autotable.min.js',
            [ 'qaproof-jspdf' ],
            '5.0.2',
            true );

        // JS modules — load order matters (dependency chain).
        $js_base = QAPROOF_PLUGIN_URL . 'admin/js/modules/';

        wp_enqueue_script( 'qaproof-helpers',  $js_base . 'helpers.js',  [],                   $asset_ver( 'admin/js/modules/helpers.js' ), true );
        wp_enqueue_script( 'qaproof-state',    $js_base . 'state.js',    [ 'qaproof-helpers' ], $asset_ver( 'admin/js/modules/state.js' ), true );
        wp_enqueue_script( 'qaproof-theme',    $js_base . 'theme.js',    [],                   $asset_ver( 'admin/js/modules/theme.js' ), true );
        wp_enqueue_script( 'qaproof-polling',  $js_base . 'polling.js',  [ 'qaproof-helpers' ], $asset_ver( 'admin/js/modules/polling.js' ), true );
        wp_enqueue_script( 'qaproof-results',  $js_base . 'results.js',  [ 'qaproof-state', 'qaproof-chartjs' ], $asset_ver( 'admin/js/modules/results.js' ), true );
        wp_enqueue_script( 'qaproof-pdf',      $js_base . 'pdf.js',      [ 'qaproof-helpers', 'qaproof-jspdf', 'qaproof-jspdf-autotable' ], $asset_ver( 'admin/js/modules/pdf.js' ), true );
        wp_enqueue_script( 'qaproof-monitors', $js_base . 'monitors.js', [ 'qaproof-state', 'qaproof-results' ], $asset_ver( 'admin/js/modules/monitors.js' ), true );
        wp_enqueue_script( 'qaproof-history',  $js_base . 'history.js',  [ 'qaproof-state', 'qaproof-results' ], $asset_ver( 'admin/js/modules/history.js' ), true );
        wp_enqueue_script( 'qaproof-form',         $js_base . 'form.js',         [ 'qaproof-state', 'qaproof-polling', 'qaproof-results' ], $asset_ver( 'admin/js/modules/form.js' ), true );
        wp_enqueue_script( 'qaproof-figma-oauth',  $js_base . 'figma-oauth.js',  [ 'qaproof-helpers' ], $asset_ver( 'admin/js/modules/figma-oauth.js' ), true );
        wp_enqueue_script( 'qaproof-init',         $js_base . 'init.js',         [ 'qaproof-state', 'qaproof-history', 'qaproof-form', 'qaproof-polling', 'qaproof-results' ], $asset_ver( 'admin/js/modules/init.js' ), true );

        wp_localize_script( 'qaproof-helpers', 'qaproof', [
            'pluginUrl'     => QAPROOF_PLUGIN_URL,
            'restUrl'       => rest_url( QAProof_Admin::REST_NAMESPACE . '/run-test' ),
            'restBase'      => untrailingslashit( rest_url( QAProof_Admin::REST_NAMESPACE ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
            'ajaxNonce'     => wp_create_nonce( 'qaproof_ajax' ),
            'siteUrl'       => home_url( '/' ),
            'hasApiKey'     => ! empty( QAProof_Settings::get_api_key() ),
            // Fingerprint used by JS to discard stale active jobs when the key changes.
            'apiKeyFp'      => substr( md5( QAProof_Settings::get_api_key() ), 0, 8 ),
            'dashboardUrl'  => admin_url( 'admin.php?page=' . QAProof_Admin::MENU_SLUG ),
            'testsUrl'      => admin_url( 'admin.php?page=' . QAProof_Admin::TESTS_SLUG ),
            'settingsUrl'   => admin_url( 'admin.php?page=' . QAProof_Admin::SETTINGS_SLUG ),
            'monitorsUrl'   => admin_url( 'admin.php?page=' . QAProof_Admin::MONITORS_SLUG ),
            'defaultThreshold'  => (int) get_option( 'qaproof_default_threshold', 95 ),
            'defaultTestType'   => get_option( 'qaproof_default_test_type', 'fidelity' ),
            'savedDesigns'      => self::get_saved_designs_for_js(),
            'autoSaveHistory'   => (bool) get_option( 'qaproof_auto_save_history', true ),
            'maxHistory'        => (int) get_option( 'qaproof_max_history', 30 ),
            'wcagLevel'         => get_option( 'qaproof_wcag_level', 'AA' ),
            'adminEmail'        => wp_get_current_user()->user_email ?: get_option( 'qaproof_notify_email', get_option( 'admin_email' ) ),
            'fidelityIgnoreText' => (bool) get_option( 'qaproof_fidelity_ignore_text', true ),
            // Used by figma-oauth.js to validate event.origin on OAuth popup postMessages.
            'apiOrigin'         => self::derive_api_origin(),
            'figmaApiUsage'     => QAProof_Settings::get_figma_api_usage(),
            'figmaApiCap'       => 6,
            'i18n' => [
                'errHttp'            => __( 'Server returned HTTP ', 'qaproof' ),
                'err404'             => __( 'REST API endpoint not found (404). Check that the plugin is activated and permalinks are flushed (Settings → Permalinks → Save).', 'qaproof' ),
                'err403'             => __( 'Access denied (403). Your login session may have expired — try refreshing the page.', 'qaproof' ),
                'err500'             => __( 'Internal server error (500). Check the server error log for details.', 'qaproof' ),
                'errInvalidJson'     => __( 'Invalid JSON response from server. The API endpoint may be misconfigured.', 'qaproof' ),
                // form.js — button labels
                'btnAnalyzeFidelity'     => __( 'Analyze Design Fidelity', 'qaproof' ),
                'btnTestResponsive'      => __( 'Test Responsive', 'qaproof' ),
                'btnRunAccessibility'    => __( 'Run Accessibility Audit', 'qaproof' ),
                'btnRunDesignAudit'      => __( 'Run Design Audit', 'qaproof' ),
                'btnRunTest'             => __( 'Run Test', 'qaproof' ),
                'btnAnalyzeElement'      => __( 'Analyze Element Fidelity', 'qaproof' ),
                // form.js — Figma preview
                'previewSelectDesign'    => __( 'Select a saved design to preview.', 'qaproof' ),
                'previewCouldNotLoad'    => __( 'Could not load preview.', 'qaproof' ),
                'previewRetry'           => __( 'Retry', 'qaproof' ),
                'previewCouldNotRefresh' => __( 'Could not refresh preview.', 'qaproof' ),
                'previewFileLabel'       => __( 'File: ', 'qaproof' ),
                'previewNodeLabel'       => __( 'Node: ', 'qaproof' ),
                // form.js — Figma error map (OAuth-only since v1.0.7)
                'figmaNotShared'         => __( 'Your connected Figma account does not have access to this file. Open it in Figma (or reconnect a different account) and try again.', 'qaproof' ),
                'figmaNotConfigured'     => __( 'Figma is not connected. Connect Figma in Settings → Tests → Design Fidelity.', 'qaproof' ),
                'figmaFileNotFound'      => __( 'File not found. Check the URL.', 'qaproof' ),
                'figmaRateLimited'       => __( 'Figma temporarily throttled our requests. Try again in a minute.', 'qaproof' ),
                'figmaRenderTimeout'     => __( 'Design too complex to preview.', 'qaproof' ),
                'figmaExportFailed'      => __( 'Figma could not export this design.', 'qaproof' ),
                'figmaNodeNotRenderable' => __( 'This node cannot be rendered. Try a different frame.', 'qaproof' ),
                'figmaNoFramesFound'     => __( 'No frames found. Add a node-id to the URL.', 'qaproof' ),
                // init.js — verify access (per saved-design row)
                'verifyChecking'         => __( 'Checking...', 'qaproof' ),
                'verifyAccessOk'         => __( 'Access OK', 'qaproof' ),
                'verifyAccessLabel'      => __( 'Verify access', 'qaproof' ),
                'verifyNoUrl'            => __( 'Add the Figma URL first.', 'qaproof' ),
                // figma-oauth.js — connection card states
                'figmaOAuthBadgeConnected'    => __( 'Connected', 'qaproof' ),
                'figmaOAuthBadgeNotConnected' => __( 'Not connected', 'qaproof' ),
                'figmaOAuthBadgeRevoked'      => __( 'Reconnect needed', 'qaproof' ),
                'figmaOAuthBadgeError'        => __( 'Error', 'qaproof' ),
                'figmaOAuthBadgeDisabled'     => __( 'Disabled', 'qaproof' ),
                'figmaOAuthConnect'           => __( 'Connect Figma →', 'qaproof' ),
                'figmaOAuthReconnect'         => __( 'Reconnect Figma →', 'qaproof' ),
                'figmaOAuthDisconnect'        => __( 'Disconnect', 'qaproof' ),
                'figmaOAuthDisconnecting'     => __( 'Disconnecting…', 'qaproof' ),
                'figmaOAuthOpening'           => __( 'Opening Figma…', 'qaproof' ),
                'figmaOAuthConnectedAs'       => __( 'Connected as', 'qaproof' ),
                'figmaOAuthReadsOnDemand'     => __( 'QAProof reads files only when you run a test against them.', 'qaproof' ),
                'figmaOAuthLinkSharingNote'   => __( 'Note: files shared via "Anyone with the link" don\'t work through Figma\'s API. To test them, the owner must invite this account directly, or the file must live in your account / team.', 'qaproof' ),
                'figmaOAuthDisconnectedBlurb' => __( 'One-click connection. After you authorize QAProof in Figma, every file you can open is testable — no per-file sharing needed.', 'qaproof' ),
                'figmaOAuthRevokedExplain'    => __( 'Your Figma connection is no longer valid (the app may have been removed in Figma settings). Reconnect to continue running fidelity tests.', 'qaproof' ),
                'figmaOAuthPreviouslyConnectedAs' => __( 'Previously connected as', 'qaproof' ),
                'figmaOAuthDisabledExplain'   => __( 'Figma OAuth is not enabled on this QAProof server. Contact support to turn it on.', 'qaproof' ),
                'figmaOAuthApiKeyMissing'     => __( 'Set your QAProof API key in Settings → API to use OAuth.', 'qaproof' ),
                'figmaOAuthDisconnectConfirm' => __( 'Disconnect Figma? Fidelity tests that fetch from Figma will stop working until you reconnect. Saved designs with a cached image keep working.', 'qaproof' ),
                'figmaOAuthMetaAccount'       => __( 'Account', 'qaproof' ),
                'figmaOAuthMetaScopes'        => __( 'Scopes', 'qaproof' ),
                'figmaOAuthMetaRefreshes'     => __( 'Token refreshes', 'qaproof' ),
                'figmaOAuthMetaConnected'     => __( 'Connected', 'qaproof' ),
                'figmaOAuthInDays'            => __( 'auto-renews in', 'qaproof' ),
                'figmaOAuthInHours'           => __( 'auto-renews in', 'qaproof' ),
                'figmaOAuthDays'              => __( 'days', 'qaproof' ),
                'figmaOAuthHours'             => __( 'hours', 'qaproof' ),
                'figmaOAuthSoon'              => __( 'on next test', 'qaproof' ),
                'figmaOAuthUnknownUser'       => __( 'Figma user', 'qaproof' ),
                'figmaOAuthLoadFailed'        => __( 'Could not load Figma connection status.', 'qaproof' ),
                'figmaOAuthStartFailed'       => __( 'Could not start Figma OAuth.', 'qaproof' ),
                'figmaOAuthMissingUrl'        => __( 'Server did not return an authorize URL.', 'qaproof' ),
                'figmaOAuthPopupBlocked'      => __( 'Popup was blocked. Allow popups for this site and try again.', 'qaproof' ),
                'figmaOAuthConnectFailed'     => __( 'Failed to connect Figma.', 'qaproof' ),
                'figmaOAuthNetwork'           => __( 'Network error. Try again.', 'qaproof' ),
                // form.js — detect elements
                'detectBtnLabel'         => __( 'Detect Elements', 'qaproof' ),
                'detectBtnDetected'      => __( 'Elements detected:', 'qaproof' ),
                'detectNoElements'       => __( 'No elements detected. Try a different design image.', 'qaproof' ),
                'detectFailed'           => __( 'Detection failed. Check your connection and try again.', 'qaproof' ),
                'detectFigmaRateLimit'   => __( 'Figma API rate-limited — showing approximate detection. Try again later for pixel-perfect results.', 'qaproof' ),
                // form.js — depth filter labels
                'depthAll'               => __( 'All', 'qaproof' ),
                'depthSections'          => __( 'Sections', 'qaproof' ),
                'depthComponents'        => __( 'Components', 'qaproof' ),
                'depthSubComponents'     => __( 'Sub-components', 'qaproof' ),
                // form.js — element testing
                'testingElement'         => __( 'Testing: ', 'qaproof' ),
                // form.js — expand/collapse
                'btnCollapse'            => __( ' Collapse', 'qaproof' ),
                'btnExpand'              => __( ' Expand', 'qaproof' ),
                // form.js — email report
                'emailSendTo'            => __( 'Send to ', 'qaproof' ),
                'emailCancel'            => __( 'Cancel', 'qaproof' ),
                'emailConfirm'           => __( ' Confirm', 'qaproof' ),
                'emailSending'           => __( ' Sending...', 'qaproof' ),
                'emailSent'              => __( ' Sent!', 'qaproof' ),
                // form.js — loading states
                'loadingResponsive'      => __( 'Capturing 3 viewport sizes and analyzing responsive behavior...', 'qaproof' ),
                'loadingResponsiveSub'   => __( 'This may take 1-2 minutes (3 screenshots + AI analysis)', 'qaproof' ),
                'loadingAccessibility'   => __( 'Capturing page and running accessibility audit...', 'qaproof' ),
                'loadingDesignAudit'     => __( 'Scanning page and extracting design tokens...', 'qaproof' ),
                'loadingDesignAuditSub'  => __( 'Analyzing design system consistency (1-2 minutes)', 'qaproof' ),
                'loadingElement'         => __( 'Analyzing element: ', 'qaproof' ),
                'loadingElementSub'      => __( 'Cropping design region, finding match on live page, comparing (30-60 seconds)', 'qaproof' ),
                'loadingDefault'         => __( 'Capturing screenshots and analyzing design...', 'qaproof' ),
                'loadingDefaultSub'      => __( 'This may take 15-30 seconds', 'qaproof' ),
                // form.js — validation & errors
                'errTestRunning'         => __( 'A test is already running. Please wait for it to finish.', 'qaproof' ),
                /* translators: %s: value */
                'errNoApiKey'            => __( 'API key not configured. <a href="%s">Go to Settings</a> to add your key.', 'qaproof' ),
                'errNoDesign'            => __( 'Please select a saved design.', 'qaproof' ),
                'errNoConnection'        => __( 'Could not reach the server. Check your connection. Reload the page to retry.', 'qaproof' ),
                // form.js — loading steps (design-audit)
                'stepCaptureScreenshot'  => __( 'Capturing page screenshot', 'qaproof' ),
                'stepExtractTokens'      => __( 'Extracting design tokens from DOM', 'qaproof' ),
                'stepAnalyzeDesign'      => __( 'Analyzing color palette & typography', 'qaproof' ),
                'stepAuditConsistency'   => __( 'AI auditing design consistency', 'qaproof' ),
                'stepBuildDebtReport'    => __( 'Building design debt report', 'qaproof' ),
                'stepProcessImages'      => __( 'Processing images', 'qaproof' ),
                'stepRunAnalysis'        => __( 'Running AI analysis', 'qaproof' ),
                'stepGenerateReport'     => __( 'Generating report', 'qaproof' ),
                'stepFinalizeResults'    => __( 'Finalizing results', 'qaproof' ),
                'loadingDuration'        => __( 'This may take 1-3 minutes', 'qaproof' ),
                'loadingAlmostDone'      => __( 'Almost done', 'qaproof' ),
                // monitors.js — month/day names
                'monthNames'             => [
                    __( 'January', 'qaproof' ), __( 'February', 'qaproof' ), __( 'March', 'qaproof' ),
                    __( 'April', 'qaproof' ),   __( 'May', 'qaproof' ),     __( 'June', 'qaproof' ),
                    __( 'July', 'qaproof' ),    __( 'August', 'qaproof' ),  __( 'September', 'qaproof' ),
                    __( 'October', 'qaproof' ), __( 'November', 'qaproof' ),__( 'December', 'qaproof' ),
                ],
                'dayNames'               => [
                    __( 'Su', 'qaproof' ), __( 'Mo', 'qaproof' ), __( 'Tu', 'qaproof' ),
                    __( 'We', 'qaproof' ), __( 'Th', 'qaproof' ), __( 'Fr', 'qaproof' ), __( 'Sa', 'qaproof' ),
                ],
                'datePickerNow'          => __( 'Now', 'qaproof' ),
                // monitors.js — UI
                'noMonitors'             => __( 'No monitors yet. Click "Add Monitor" to get started.', 'qaproof' ),
                'colUrl'                 => __( 'URL', 'qaproof' ),
                'colSchedule'            => __( 'Schedule', 'qaproof' ),
                'colLastScore'           => __( 'Last Score', 'qaproof' ),
                'colLastRun'             => __( 'Last Run', 'qaproof' ),
                'colStatus'              => __( 'Status', 'qaproof' ),
                'colActions'             => __( 'Actions', 'qaproof' ),
                'monitorNever'           => __( 'Never', 'qaproof' ),
                'monitorActive'          => __( 'Active', 'qaproof' ),
                'monitorPaused'          => __( 'Paused', 'qaproof' ),
                'monitorBtnRun'          => __( 'Check Now', 'qaproof' ),
                'monitorBtnRunning'      => __( '⟳ Running', 'qaproof' ),
                'monitorBtnSetup'        => __( 'Set Up', 'qaproof' ),
                'monitorBtnRun2'         => __( 'Run', 'qaproof' ),
                'monitorBtnPause'        => __( 'Pause', 'qaproof' ),
                'monitorBtnEnable'       => __( 'Enable', 'qaproof' ),
                'monitorFormTitleEdit'   => __( 'Edit Monitor', 'qaproof' ),
                'monitorFormTitleAdd'    => __( 'Add Monitor', 'qaproof' ),
                'monitorSaveFailed'      => __( 'Failed to save monitor.', 'qaproof' ),
                'monitorDeleteConfirm'   => __( 'Delete this monitor and all its results?', 'qaproof' ),
                'monitorDeleteYes'       => __( 'Delete', 'qaproof' ),
                'monitorDeleteNo'        => __( 'Cancel', 'qaproof' ),
                /* translators: %s: domain name of the monitor that was deleted */
                'monitorDeleted'         => __( 'Monitor for %s was deleted.', 'qaproof' ),
                'monitorTimeout'         => __( 'Test timed out. Check back later.', 'qaproof' ),
                'monitorRunFailed'       => __( 'Failed to run monitor.', 'qaproof' ),
                'monitorLoading'         => __( 'Loading monitor...', 'qaproof' ),
                'monitorNotFound'        => __( 'Monitor not found.', 'qaproof' ),
                'monitorLoadingTest'     => __( 'Loading regression test...', 'qaproof' ),
                'monitorTestStarted'     => __( 'Test started. Waiting for results...', 'qaproof' ),
                'monitorRunning'         => __( 'Running...', 'qaproof' ),
                'monitorApproving'       => __( 'Approving...', 'qaproof' ),
                'monitorApproveChanges'  => __( 'Approve Changes', 'qaproof' ),
                'monitorApproveConfirm'  => __( 'Approve these changes? This will update the baseline to the current page state.', 'qaproof' ),
                'monitorApproveFailed'   => __( 'Failed to approve.', 'qaproof' ),
                'monitorLoadingResult'   => __( 'Loading result...', 'qaproof' ),
                'monitorResultNotFound'  => __( 'Result not found.', 'qaproof' ),
                'monitorRunFailed2'      => __( 'Run Failed', 'qaproof' ),
                'monitorUnknownError'    => __( 'Unknown error', 'qaproof' ),
                'monitorNoResults'       => __( 'No results yet. Click "Run Now" to run the first check.', 'qaproof' ),
                'monitorResultsHistory'  => __( 'Results History', 'qaproof' ),
                'monitorBackToList'      => __( 'Back to Monitors', 'qaproof' ),
                'monitorRegressionScore' => __( 'Regression Score', 'qaproof' ),
                'monitorDownloadPdf'     => __( 'Download PDF Report', 'qaproof' ),
                'monitorSendEmail'       => __( 'Send to Email', 'qaproof' ),
                'monitorCategories'      => __( 'Categories', 'qaproof' ),
                'monitorVisualComp'      => __( 'Visual Comparison', 'qaproof' ),
                'monitorMarkers'         => __( 'Markers', 'qaproof' ),
                'monitorSyncScroll'      => __( 'Sync Scroll', 'qaproof' ),
                'monitorBaseline'        => __( 'Baseline', 'qaproof' ),
                'monitorCurrent'         => __( 'Current', 'qaproof' ),
                'monitorDifferences'     => __( 'Differences', 'qaproof' ),
                'monitorAll'             => __( 'All', 'qaproof' ),
                'monitorHigh'            => __( 'High', 'qaproof' ),
                'monitorMedium'          => __( 'Medium', 'qaproof' ),
                'monitorLow'             => __( 'Low', 'qaproof' ),
                'monitorRecommendations' => __( 'Recommendations', 'qaproof' ),
                // monitors.js — category names
                'catLayout'              => __( 'Layout & Structure', 'qaproof' ),
                'catStyling'             => __( 'Styling & Colors', 'qaproof' ),
                'catTypography'          => __( 'Typography & Content', 'qaproof' ),
                'catImages'              => __( 'Images & Media', 'qaproof' ),
                'catComponents'          => __( 'Components & UI', 'qaproof' ),
                // history.js
                'histTestTypeFidelity'   => __( 'Fidelity', 'qaproof' ),
                'histTestTypeResponsive' => __( 'Responsive', 'qaproof' ),
                'histTestTypeA11y'       => __( 'Accessibility', 'qaproof' ),
                'histTestTypeRegression' => __( 'Regression', 'qaproof' ),
                'histTestTypeDesignAudit'=> __( 'Design Audit', 'qaproof' ),
                'histLoadingResult'      => __( 'Loading test result...', 'qaproof' ),
                'histCouldNotLoad'       => __( 'Could not load test result.', 'qaproof' ),
                'histFailedLoad'         => __( 'Failed to load test result.', 'qaproof' ),
                'histDeleteConfirm'      => __( 'Delete this test result?', 'qaproof' ),
                'histViewReport'         => __( 'View report', 'qaproof' ),
                'histDownloadPdf'        => __( 'Download PDF report', 'qaproof' ),
                'histDelete'             => __( 'Delete', 'qaproof' ),
                'histView'               => __( 'View', 'qaproof' ),
                'histFailedDownload'     => __( 'Failed to download report.', 'qaproof' ),
                // init.js
                'apiTesting'             => __( 'Testing...', 'qaproof' ),
                'apiConnected'           => __( 'Connected! API status: ', 'qaproof' ),
                'apiFailed'              => __( 'Failed: ', 'qaproof' ),
                'apiNetworkError'        => __( 'Network error — could not reach API.', 'qaproof' ),
                'apiKeyStartError'       => __( 'API key must start with "qap_"', 'qaproof' ),
                'apiKeyLengthError'      => __( ' characters — expected 68 (qap_ + 64 hex chars)', 'qaproof' ),
                'apiKeyCharError'        => __( 'Key contains invalid characters — only 0-9 and a-f are allowed after "qap_"', 'qaproof' ),
                'designRemove'           => __( 'Remove', 'qaproof' ),
                'resetFigmaConfirm'      => __( "Reset the Figma API call counter for this month?\n\n(This only resets the local tracker in this plugin — it does NOT reset Figma's actual quota on their side.)", 'qaproof' ),
                'resumingTest'           => __( 'Resuming test — waiting for results...', 'qaproof' ),
                'resumingTestSub'        => __( 'Test is still running on the server', 'qaproof' ),
                'resumingA11y'           => __( 'Resuming accessibility test — waiting for results...', 'qaproof' ),
                'stepA11yCapture'        => __( 'Capturing page screenshot', 'qaproof' ),
                'stepA11yProcess'        => __( 'Processing images', 'qaproof' ),
                'stepA11yAnalysis'       => __( 'Running accessibility analysis', 'qaproof' ),
                'stepA11yWcag'           => __( 'Evaluating WCAG compliance', 'qaproof' ),
                'stepA11yReport'         => __( 'Generating audit report', 'qaproof' ),
                'testSubmissionFailed'   => __( 'Test submission failed after multiple retries. Please try again.', 'qaproof' ),
                'settingsSaved'          => __( 'Settings saved successfully', 'qaproof' ),
                'fieldRequired'          => __( 'This field is required.', 'qaproof' ),
                'invalidEmail'           => __( 'Please enter a valid email address.', 'qaproof' ),
                'invalidUrl'             => __( 'Please enter a valid URL starting with http:// or https://', 'qaproof' ),
                'invalidNumber'          => __( 'Please enter a valid number.', 'qaproof' ),
                'minValue'               => __( 'Value must be at least ', 'qaproof' ),
                'maxValue'               => __( 'Value must be no more than ', 'qaproof' ),
                // polling.js
                'screenshotsLoadError'   => __( 'Screenshots could not be loaded.', 'qaproof' ),
                // pdf.js
                'pdfLibraryError'        => __( 'PDF library failed to load. Please refresh the page and try again.', 'qaproof' ),
                'pdfLabelFidelity'       => __( 'Design Fidelity Analysis', 'qaproof' ),
                'pdfLabelResponsive'     => __( 'Responsive Testing Report', 'qaproof' ),
                'pdfLabelAccessibility'  => __( 'Accessibility Audit Report', 'qaproof' ),
                'pdfLabelRegression'     => __( 'Visual Regression Report', 'qaproof' ),
                'pdfLabelDesignAudit'    => __( 'Design System Audit Report', 'qaproof' ),
                'pdfLabelDefault'        => __( 'QA Analysis Report', 'qaproof' ),
                'pdfDescFidelity'        => __( 'Pixel-level comparison of design mockup against live implementation', 'qaproof' ),
                'pdfDescResponsive'      => __( 'Cross-viewport layout and usability analysis across breakpoints', 'qaproof' ),
                /* translators: %s: value */
                'pdfDescAccessibility'   => sprintf( __( 'WCAG 2.1 Level %s compliance evaluation and remediation guidance', 'qaproof' ), get_option( 'qaproof_wcag_level', 'AA' ) ),
                'pdfDescRegression'      => __( 'Visual change detection against previously established baseline', 'qaproof' ),
                'pdfDescDesignAudit'     => __( 'Automated design system discovery, consistency audit, and design debt analysis', 'qaproof' ),
                'pdfVerdictPass'         => __( 'PASS', 'qaproof' ),
                'pdfVerdictNeedsWork'    => __( 'NEEDS WORK', 'qaproof' ),
                'pdfVerdictFail'         => __( 'FAIL', 'qaproof' ),
                'pdfTargetUrl'           => __( 'TARGET URL', 'qaproof' ),
                'pdfNA'                  => __( 'N/A', 'qaproof' ),
                'pdfOverallScore'        => __( 'OVERALL SCORE', 'qaproof' ),
                'pdfGrade'               => __( 'Grade: ', 'qaproof' ),
                'pdfCategories'          => __( 'categories', 'qaproof' ),
                'pdfIssues'              => __( 'issues', 'qaproof' ),
                'pdfExecutiveSummary'    => __( 'Executive Summary', 'qaproof' ),
                'pdfScoreOverview'       => __( 'Score Overview', 'qaproof' ),
                'pdfCategoryBreakdown'   => __( 'Category Breakdown', 'qaproof' ),
                'pdfColCategory'         => __( 'Category', 'qaproof' ),
                'pdfColScore'            => __( 'Score', 'qaproof' ),
                'pdfColStatus'           => __( 'Status', 'qaproof' ),
                'pdfColNotes'            => __( 'Notes', 'qaproof' ),
                'pdfStatusPass'          => __( 'Pass', 'qaproof' ),
                'pdfStatusWarning'       => __( 'Warning', 'qaproof' ),
                'pdfStatusFail'          => __( 'Fail', 'qaproof' ),
                'pdfIssuesFound'         => __( 'Issues Found', 'qaproof' ),
                'pdfTotal'               => __( 'total', 'qaproof' ),
                'pdfSeverityCritical'    => __( 'Critical / High', 'qaproof' ),
                'pdfSeverityMedium'      => __( 'Medium', 'qaproof' ),
                'pdfSeverityLow'         => __( 'Low', 'qaproof' ),
                'pdfColNum'              => __( '#', 'qaproof' ),
                'pdfColSeverity'         => __( 'Severity', 'qaproof' ),
                'pdfColDescription'      => __( 'Description', 'qaproof' ),
                'pdfRecommendations'     => __( 'Recommendations', 'qaproof' ),
                'pdfItems'               => __( 'items', 'qaproof' ),
                'pdfMethodology'         => __( 'Methodology & Standards', 'qaproof' ),
                'pdfTestingMethod'       => __( 'Testing Methodology', 'qaproof' ),
                'pdfMethodStep1'         => __( 'Automated screenshot capture of the target URL', 'qaproof' ),
                'pdfMethodStep2'         => __( 'AI-powered visual analysis using Claude Vision', 'qaproof' ),
                'pdfMethodStep3'         => __( 'Pattern matching against WCAG 2.1 Level AA criteria', 'qaproof' ),
                'pdfMethodStep4'         => __( 'Severity classification based on user impact', 'qaproof' ),
                'pdfStandards'           => __( 'Standards Reference', 'qaproof' ),
                'pdfFooter'              => __( 'QAProof  |  Automated Web Quality Assurance  |  qaproof.io', 'qaproof' ),
                'pdfReportId'            => __( 'Report ID: ', 'qaproof' ),
                'pdfGenerated'           => __( 'Generated: ', 'qaproof' ),
                'pdfOf'                  => __( 'of ', 'qaproof' ),
                'pdfQaproofVerified'     => __( 'QAPROOF VERIFIED', 'qaproof' ),
                'pdfScore'               => __( 'Score: ', 'qaproof' ),
                'pdfDisclaimerA11y'      => __( 'This report was generated by QAProof automated testing. Results are based on AI-powered visual analysis and may not capture all issues. Manual testing by accessibility experts is recommended for comprehensive compliance verification. This report does not constitute legal advice regarding ADA, Section 508, or EN 301 549 compliance.', 'qaproof' ),
                'pdfDisclaimerGeneral'   => __( 'This report was generated by QAProof automated testing. Results are based on AI-powered visual analysis and may not capture all issues. Manual testing by accessibility experts is recommended for comprehensive compliance verification. This report does not constitute legal advice regarding regulatory compliance.', 'qaproof' ),
            ],
        ]);
    }

    /** Origin (scheme://host[:port]) of the configured API endpoint, or ''. */
    private static function derive_api_origin() {
        $endpoint = QAProof_Settings::get_api_endpoint();
        if ( empty( $endpoint ) ) return '';
        $parts = wp_parse_url( $endpoint );
        if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) return '';
        $origin = $parts['scheme'] . '://' . $parts['host'];
        if ( ! empty( $parts['port'] ) ) {
            $origin .= ':' . $parts['port'];
        }
        return $origin;
    }

    /**
     * Saved designs trimmed for JS localization — name + figmaUrl per row.
     */
    private static function get_saved_designs_for_js() {
        $designs = QAProof_Settings::get_saved_designs();
        if ( empty( $designs ) ) {
            return [];
        }
        $result = [];
        foreach ( $designs as $d ) {
            $figma_url = isset( $d['figmaUrl'] ) ? $d['figmaUrl'] : '';
            $result[] = [
                'id'              => isset( $d['id'] )         ? $d['id']         : '',
                'name'            => isset( $d['name'] )       ? $d['name']       : '',
                'pageUrl'         => isset( $d['pageUrl'] )    ? $d['pageUrl']    : '',
                'figmaUrl'        => $figma_url,
                'fileKey'         => QAProof_Settings::extract_figma_file_key( $figma_url ),
            ];
        }
        return $result;
    }
}
