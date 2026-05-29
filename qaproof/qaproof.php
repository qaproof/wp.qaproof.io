<?php
/**
 * Plugin Name:       QAProof
 * Plugin URI:        https://github.com/qaproof/wp.qaproof.io
 * Description:       Compare live pages against Figma, audit accessibility, detect visual regressions, analyze responsive behavior — AI vision powered.
 * Version:           1.0.18
 * Author:            QAProof
 * Author URI:        https://qaproof.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       qaproof
 * Domain Path:       /languages
 * Requires at least: 6.0
 * Tested up to:      7.0
 * Requires PHP:      8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Hard PHP version gate.
 *
 * The plugin uses arrow functions and typed properties throughout, so anything
 * older than 8.0 hits a fatal at class-load time and the admin gets a WSOD on
 * the plugins.php screen. WP itself only emits a soft "Requires PHP" warning;
 * an explicit guard prevents the fatal and gives the user a clear message.
 *
 * Runs on every request because activation hooks don't fire when a plugin is
 * loaded by `mu-plugins` autoload or `must-use` patterns — better to no-op
 * the rest of bootstrap entirely.
 */
if ( PHP_VERSION_ID < 80000 ) {
    add_action( 'admin_notices', function() {
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static literal text, no user input.
        echo '<div class="notice notice-error"><p>'
           . esc_html__( 'QAProof requires PHP 8.0 or higher. Please upgrade your PHP version or contact your host.', 'qaproof' )
           . '</p></div>';
    } );
    if ( function_exists( 'is_admin' ) && is_admin() && function_exists( 'deactivate_plugins' ) ) {
        // Auto-deactivate so the plugin's broken state doesn't surface again
        // on the next page load. Safe to call repeatedly; no-op when already
        // deactivated.
        deactivate_plugins( plugin_basename( __FILE__ ) );
    }
    return;
}

/*
 * Single source of truth for the version is the `Version:` header at the top
 * of this file. Derive the runtime constant from it via get_file_data() so
 * the two can NEVER drift again. QAPROOF_VERSION feeds the admin footer
 * badge, the asset cache-bust query string (class-admin-assets.php), and the
 * API-client User-Agent (class-api-client.php). Through v1.0.7 this was a
 * hardcoded '1.0.3' that the release process forgot to bump for four
 * releases — the footer reported the wrong version the whole time. The
 * '1.0.7' fallback only applies if get_file_data() is somehow unavailable.
 */
if ( ! defined( 'QAPROOF_VERSION' ) ) {
    $qaproof_header = function_exists( 'get_file_data' )
        ? get_file_data( __FILE__, array( 'Version' => 'Version' ) )
        : array();
    define( 'QAPROOF_VERSION', ! empty( $qaproof_header['Version'] ) ? $qaproof_header['Version'] : '1.0.7' );
}
define( 'QAPROOF_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'QAPROOF_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'QAPROOF_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

if ( ! function_exists( 'qaproof_debug_log' ) ) {
    /**
     * Debug-logger. Gated on WP_DEBUG + WP_DEBUG_LOG so it's a no-op in
     * production. URLs in the message are stripped of their query strings
     * before writing because some hosts leave `debug.log` web-accessible
     * and the URLs we log routinely carry login tokens / session keys.
     */
    function qaproof_debug_log( $message ) {
        if ( ! ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) ) {
            return;
        }
        if ( ! is_string( $message ) ) {
            $message = wp_json_encode( $message );
        }
        // Redact query strings and URL fragments to avoid leaking secrets
        // through debug.log. Matches http(s) URLs and trims everything
        // after `?` or `#`. Delimiter is `~` so we don't conflict with the
        // literal `#` we want to match inside the pattern.
        $redacted = preg_replace( '~(https?://[^\s\'"<>?#]+)[?#][^\s\'"<>]*~', '$1?…', (string) $message );
        $message  = is_string( $redacted ) ? $redacted : (string) $message;
        // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- gated on WP_DEBUG + WP_DEBUG_LOG.
        error_log( $message );
    }
}

require_once QAPROOF_PLUGIN_DIR . 'includes/class-api-client.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-settings.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-database.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-notifications.php';
require_once QAPROOF_PLUGIN_DIR . 'includes/class-privacy.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-assets.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-ajax.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-tests.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-monitors.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-designs.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-figma-oauth.php';
require_once QAPROOF_PLUGIN_DIR . 'admin/class-admin-rest-history.php';

add_action( 'plugins_loaded', function() {
    QAProof_Settings::init();
    QAProof_Admin::init();
    QAProof_Notifications::init();
    QAProof_Privacy::init();
    QAProof_API_Client::register_user_agent_filter();
    QAProof_Database::maybe_upgrade();
});

add_filter( 'plugin_action_links_' . QAPROOF_PLUGIN_BASENAME, function ( $links ) {
    $settings_url  = admin_url( 'admin.php?page=qaproof-settings' );
    $settings_link = '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'qaproof' ) . '</a>';
    array_unshift( $links, $settings_link );
    return $links;
});
