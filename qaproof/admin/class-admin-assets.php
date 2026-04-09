<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Admin_Assets {

    public static function enqueue_assets( $hook ) {
        // Only load on our plugin pages
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

        wp_enqueue_style(
            'qaproof-google-fonts',
            'https://fonts.googleapis.com/css2?family=Kodchasan:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800&display=swap',
            [],
            null
        );

        wp_enqueue_style(
            'qaproof-admin',
            QAPROOF_PLUGIN_URL . 'admin/css/admin.css',
            [ 'qaproof-google-fonts' ],
            QAPROOF_VERSION
        );

        wp_enqueue_script(
            'chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js',
            [],
            '4.4.6',
            true
        );

        wp_enqueue_script(
            'jspdf',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js',
            [],
            '3.0.3',
            true
        );

        wp_enqueue_script(
            'jspdf-autotable',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.2/jspdf.plugin.autotable.min.js',
            [ 'jspdf' ],
            '5.0.2',
            true
        );

        // JS Modules (load order matters — dependency chain)
        $js_base = QAPROOF_PLUGIN_URL . 'admin/js/modules/';

        wp_enqueue_script( 'qaproof-helpers',  $js_base . 'helpers.js',  [],                   QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-state',    $js_base . 'state.js',    [ 'qaproof-helpers' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-theme',    $js_base . 'theme.js',    [],                   QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-polling',  $js_base . 'polling.js',  [ 'qaproof-helpers' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-results',  $js_base . 'results.js',  [ 'qaproof-state', 'chartjs' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-pdf',      $js_base . 'pdf.js',      [ 'qaproof-helpers', 'jspdf', 'jspdf-autotable' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-monitors', $js_base . 'monitors.js', [ 'qaproof-state', 'qaproof-results' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-history',  $js_base . 'history.js',  [ 'qaproof-state', 'qaproof-results' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-form',     $js_base . 'form.js',     [ 'qaproof-state', 'qaproof-polling', 'qaproof-results' ], QAPROOF_VERSION, true );
        wp_enqueue_script( 'qaproof-init',     $js_base . 'init.js',     [ 'qaproof-state', 'qaproof-history', 'qaproof-form', 'qaproof-polling', 'qaproof-results' ], QAPROOF_VERSION, true );

        wp_localize_script( 'qaproof-helpers', 'qaproof', [
            'restUrl'       => rest_url( QAProof_Admin::REST_NAMESPACE . '/run-test' ),
            'restBase'      => untrailingslashit( rest_url( QAProof_Admin::REST_NAMESPACE ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
            'ajaxNonce'     => wp_create_nonce( 'qaproof_ajax' ),
            'siteUrl'       => home_url( '/' ),
            'hasApiKey'     => ! empty( QAProof_Settings::get_api_key() ),
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
            'fidelityIgnoreText' => (bool) get_option( 'qaproof_fidelity_ignore_text', true ),
            // apiEndpoint and apiKey removed — browser no longer calls API directly
            // All requests go through WP proxy (job queue pattern)
        ]);
    }

    /**
     * Get saved designs for JS localization — strips large imageBase64 data
     * and replaces with a boolean hasImage flag to keep page load fast.
     */
    private static function get_saved_designs_for_js() {
        $designs = QAProof_Settings::get_saved_designs();
        if ( empty( $designs ) ) {
            return [];
        }
        $result = [];
        foreach ( $designs as $d ) {
            $result[] = [
                'id'              => isset( $d['id'] )         ? $d['id']         : '',
                'name'            => isset( $d['name'] )       ? $d['name']       : '',
                'pageUrl'         => isset( $d['pageUrl'] )    ? $d['pageUrl']    : '',
                'figmaToken'      => isset( $d['figmaToken'] ) ? $d['figmaToken'] : '',
                'figmaUrl'        => isset( $d['figmaUrl'] )   ? $d['figmaUrl']   : '',
                'hasImage'        => ! empty( $d['imageBase64'] ),
                'hasElements'     => ! empty( $d['elementsJson'] ),
                'elementsSource'  => isset( $d['elementsSource'] ) ? $d['elementsSource'] : '',
            ];
        }
        return $result;
    }
}
