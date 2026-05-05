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

<<<<<<< HEAD
define( 'QAPROOF_VERSION', '1.2.27' );
=======
define( 'QAPROOF_VERSION', '1.2.33' );
>>>>>>> origin/main
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
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-assets.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-ajax.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-tests.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-monitors.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-designs.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-history.php';

// Initialize
add_action( 'plugins_loaded', function() {
    load_plugin_textdomain( 'qaproof', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
    QAProof_Settings::init();
    QAProof_Admin::init();
    QAProof_Scheduler::init();
    QAProof_Notifications::init();

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

// Add "Settings" link on
