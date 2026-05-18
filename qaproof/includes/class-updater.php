<?php
/**
 * Self-hosted plugin update channel.
 *
 * The plugin's qaproof.php declares
 *     Update URI: https://api.qaproof.io/api/wordpress/qaproof
 * which signals to WordPress (5.8+) that this plugin's updates do NOT come
 * from wordpress.org. WordPress then fires the per-hostname filter
 *     update_plugins_api.qaproof.io
 * which we hook here to inject our own update info. WordPress consumes the
 * returned data identically to a wp.org-served plugin: shows the red
 * "Update available" badge, offers one-click upgrade, etc.
 *
 * Once the plugin is approved on wordpress.org, remove the Update URI
 * header (or change it to https://wordpress.org/plugins/qaproof/) so
 * WordPress takes over and routes updates through the wp.org canonical
 * channel instead.
 *
 * Failure mode: if api.qaproof.io is unreachable, fetch_manifest() returns
 * false and the update check filter is a no-op — WordPress simply doesn't
 * surface an update prompt. The plugin keeps working at its current version.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Updater {

    /** Update-manifest endpoint. Must match the Update URI header in qaproof.php. */
    const UPDATE_URL = 'https://api.qaproof.io/api/wordpress/qaproof';

    /** Transient key for the cached manifest. */
    const CACHE_KEY = 'qaproof_update_manifest';

    /** Cache TTL — 6h. WP's own update check runs ~every 12h, so we refresh
     *  on the cron cycle that wakes our filter. Short enough that new
     *  releases propagate same-day, long enough that we don't hammer the API. */
    const CACHE_TTL = 6 * HOUR_IN_SECONDS;

    public static function init() {
        // Per-hostname filter triggered by the Update URI header. Fires once
        // per plugin during the normal WP update-check cron.
        add_filter( 'update_plugins_api.qaproof.io', [ __CLASS__, 'check_update' ], 10, 4 );

        // plugins_api is hit when the admin clicks "View details" on the
        // Plugins page — populates the modal that shows description,
        // changelog, banner, etc.
        add_filter( 'plugins_api', [ __CLASS__, 'plugin_info' ], 10, 3 );

        // Bust the cache when WP's "Check Again" link on the Updates screen
        // is clicked (or any other forced update check).
        add_action( 'upgrader_process_complete', [ __CLASS__, 'flush_cache' ], 10, 0 );
    }

    /**
     * Filter callback for update_plugins_api.qaproof.io.
     *
     * @param  false|array $update         Whatever upstream filters set; usually false.
     * @param  array       $plugin_data    Plugin headers parsed by WP.
     * @param  string      $plugin_file    Plugin basename (qaproof/qaproof.php).
     * @param  array       $locales        Currently installed locales.
     * @return false|array                 Update info matching WP's expected shape,
     *                                     or the original $update when no upgrade.
     */
    public static function check_update( $update, $plugin_data, $plugin_file, $locales ) {
        unset( $plugin_data, $plugin_file, $locales ); // unused, but WP passes them

        $manifest = self::fetch_manifest();
        if ( ! is_array( $manifest ) || empty( $manifest['version'] ) ) {
            return $update;
        }

        // No upgrade available — return the manifest version anyway so WP knows
        // the plugin "exists" on a non-wp.org channel; otherwise plugins_api
        // modal can't show metadata.
        if ( version_compare( $manifest['version'], QAPROOF_VERSION, '<=' ) ) {
            return [
                'slug'         => 'qaproof',
                'version'      => $manifest['version'],
                'url'          => isset( $manifest['homepage'] ) ? $manifest['homepage'] : '',
                'package'      => '', // empty package = no upgrade button
                'tested'       => isset( $manifest['tested'] ) ? $manifest['tested'] : '',
                'requires_php' => isset( $manifest['requires_php'] ) ? $manifest['requires_php'] : '',
            ];
        }

        // New version available — full update payload.
        return [
            'slug'         => 'qaproof',
            'version'      => $manifest['version'],
            'url'          => isset( $manifest['homepage'] ) ? $manifest['homepage'] : '',
            'package'      => isset( $manifest['download_url'] ) ? $manifest['download_url'] : '',
            'tested'       => isset( $manifest['tested'] ) ? $manifest['tested'] : '',
            'requires'     => isset( $manifest['requires'] ) ? $manifest['requires'] : '',
            'requires_php' => isset( $manifest['requires_php'] ) ? $manifest['requires_php'] : '',
            'icons'        => isset( $manifest['icons'] ) ? $manifest['icons'] : [],
            'banners'      => isset( $manifest['banners'] ) ? $manifest['banners'] : [],
        ];
    }

    /**
     * Filter callback for plugins_api — provides the "View details" modal.
     */
    public static function plugin_info( $result, $action, $args ) {
        if ( $action !== 'plugin_information' ) return $result;
        if ( ! is_object( $args ) || ! isset( $args->slug ) || $args->slug !== 'qaproof' ) return $result;

        $manifest = self::fetch_manifest();
        if ( ! is_array( $manifest ) ) return $result;

        return (object) [
            'name'           => isset( $manifest['name'] ) ? $manifest['name'] : 'QAProof',
            'slug'           => 'qaproof',
            'version'        => isset( $manifest['version'] ) ? $manifest['version'] : QAPROOF_VERSION,
            'author'         => isset( $manifest['author'] ) ? $manifest['author'] : 'QAProof',
            'author_profile' => isset( $manifest['author_profile'] ) ? $manifest['author_profile'] : '',
            'homepage'       => isset( $manifest['homepage'] ) ? $manifest['homepage'] : '',
            'requires'       => isset( $manifest['requires'] ) ? $manifest['requires'] : '',
            'tested'         => isset( $manifest['tested'] ) ? $manifest['tested'] : '',
            'requires_php'   => isset( $manifest['requires_php'] ) ? $manifest['requires_php'] : '',
            'last_updated'   => isset( $manifest['last_updated'] ) ? $manifest['last_updated'] : '',
            'added'          => isset( $manifest['added'] ) ? $manifest['added'] : '',
            'sections'       => isset( $manifest['sections'] ) ? $manifest['sections'] : [],
            'download_link'  => isset( $manifest['download_url'] ) ? $manifest['download_url'] : '',
            'banners'        => isset( $manifest['banners'] ) ? $manifest['banners'] : [],
            'icons'          => isset( $manifest['icons'] ) ? $manifest['icons'] : [],
        ];
    }

    /**
     * Fetch + cache the manifest. Failure modes:
     *   - HTTP error  → return false (caller treats as "no update info")
     *   - non-200     → return false
     *   - invalid JSON → return false
     *
     * The transient is set on success only, so a transient miss + API down
     * just means we retry next cron tick without locking in a bad response.
     */
    private static function fetch_manifest() {
        $cached = get_transient( self::CACHE_KEY );
        if ( is_array( $cached ) ) {
            return $cached;
        }
        $response = wp_remote_get( self::UPDATE_URL, [
            'timeout' => 10,
            'headers' => [ 'Accept' => 'application/json' ],
        ] );
        if ( is_wp_error( $response ) ) {
            qaproof_debug_log( '[QAProof updater] fetch failed: ' . $response->get_error_message() );
            return false;
        }
        $status = (int) wp_remote_retrieve_response_code( $response );
        if ( $status !== 200 ) {
            qaproof_debug_log( '[QAProof updater] non-200: ' . $status );
            return false;
        }
        $body = wp_remote_retrieve_body( $response );
        $data = json_decode( $body, true );
        if ( ! is_array( $data ) || empty( $data['version'] ) ) {
            qaproof_debug_log( '[QAProof updater] manifest malformed' );
            return false;
        }
        set_transient( self::CACHE_KEY, $data, self::CACHE_TTL );
        return $data;
    }

    /** Drop the cached manifest. Called after any plugin upgrade completes. */
    public static function flush_cache() {
        delete_transient( self::CACHE_KEY );
    }
}
