<?php
/**
 * Plugin Name: QAProof
 * Plugin URI:  https://qaproof.io
 * Description: Automated design fidelity and responsive testing powered by AI. Compare your live pages against Figma designs or analyze responsive behavior across devices.
 * Version:     1.0.0
 * Author:      QAProof
 * Author URI:  https://qaproof.io
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: qaproof
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'QAPROOF_VERSION', '1.2.1' );
define( 'QAPROOF_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'QAPROOF_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'QAPROOF_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// Includes
require_once QAPROOF_PLUGIN_DIR . 'includes/class-api-client.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-settings.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-database.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-monitor.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-result.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-test-history.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-scheduler.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-notifications.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin.php';

// Initialize
add_action( 'plugins_loaded', function() {
    QAProof_Settings::init();
    QAProof_Admin::init();
    QAProof_Scheduler::init();
    QAProof_Notifications::init();

    // Auto-upgrade DB schema if plugin was updated without deactivation
    $installed_db_version = get_option( 'qaproof_db_version', '0' );
    if ( version_compare( $installed_db_version, '1.2.0', '<' ) ) {
        QAProof_Database::create_tables();
    }
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

// Add "Settings" link on plugins list page
add_filter( 'plugin_action_links_' . QAPROOF_PLUGIN_BASENAME, function( $links ) {
    $settings_link = '<a href="' . admin_url( 'admin.php?page=qaproof-settings' ) . '">'
        . __( 'Settings', 'qaproof' ) . '</a>';
    array_unshift( $links, $settings_link );
    return $links;
});
