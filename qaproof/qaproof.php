<?php
/**
 * Plugin Name:       QAProof
 * Plugin URI:        https://github.com/qaproof/wp.qaproof.io
 * Description:       Automated design QA — compare live pages against Figma designs, analyze responsive behavior, audit accessibility, detect visual regressions. Powered by AI vision.
 * Version:           1.0.0
 * Author:            QAProof
 * Author URI:        https://qaproof.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       qaproof
 * Domain Path:       /languages
 * Requires at least: 6.0
 * Tested up to:      6.7
 * Requires PHP:      8.0
 *
 * Update URI:        https://api.qaproof.io/api/wordpress/qaproof
 *
 * The Update URI header (WP 5.8+) routes update checks to our own server
 * instead of wordpress.org. Once approved on wordpress.org, change this
 * to https://wordpress.org/plugins/qaproof/ so WP takes over auto-updates
 * canonically. See includes/class-updater.php for the filter hook.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'QAPROOF_VERSION', '1.0.0' );
define( 'QAPROOF_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'QAPROOF_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'QAPROOF_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

if ( ! function_exists( 'qaproof_debug_log' ) ) {
    /**
     * Gated wrapper around error_log(). Writes only when WP_DEBUG and
     * WP_DEBUG_LOG are both enabled, so production sites with WP_DEBUG off
     * stay quiet (no diagnostic spam in error logs). All internal plugin
     * code uses this instead of error_log() directly.
     */
    function qaproof_debug_log( $message ) {
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
            error_log( is_string( $message ) ? $message : wp_json_encode( $message ) );
        }
    }
}

// Includes
require_once QAPROOF_PLUGIN_DIR . 'includes/class-api-client.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-settings.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-database.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-monitor.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-result.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-test-history.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-scheduler.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-notifications.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-privacy.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-updater.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-assets.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-ajax.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-tests.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-monitors.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-designs.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-figma-oauth.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-history.php';

// Initialize
add_action( 'plugins_loaded', function() {
    load_plugin_textdomain( 'qaproof', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
    QAProof_Settings::init();
    QAProof_Admin::init();
    QAProof_Scheduler::init();
    QAProof_Notifications::init();
    QAProof_Privacy::init();
    QAProof_Updater::init();
    QAProof_API_Client::register_user_agent_filter();

    // Auto-upgrade DB schema if plugin was updated without deactivation
    QAProof_Database::maybe_upgrade();
});

// Activation: create tables and schedule events
register_activation_hook( __FILE__, function() {
    QAProof_Database::create_tables();
    QAProof_Scheduler::schedule_events();
});

// Deactivation: remove scheduled events
register_deactivation_hook( __FILE__, function() {
    QAProof_Scheduler::unschedule_events();
});

// Settings link in plugin list (next to Activate/Deactivate). Pure UX —
// no privilege check needed because WP only renders this row for users
// with the manage_plugins cap; the linked page enforces its own gating.
add_filter( 'plugin_action_links_' . QAPROOF_PLUGIN_BASENAME, function ( $links ) {
    $settings_url  = admin_url( 'admin.php?page=qaproof-settings' );
    $settings_link = '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'qaproof' ) . '</a>';
    array_unshift( $links, $settings_link );
    return $links;
});
