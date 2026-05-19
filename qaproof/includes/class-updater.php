<?php
/**
 * Self-hosted plugin update channel. Hooks the per-hostname filter fired
 * by WP's Update URI header (5.8+) to serve update info from api.qaproof.io.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Updater {

    const UPDATE_URL = 'https://api.qaproof.io/api/wordpress/qaproof';
    const CACHE_KEY  = 'qaproof_update_manifest';
    const CACHE_TTL  = 6 * HOUR_IN_SECONDS;

    public static function init() {
        add_filter( 'update_plugins_api.qaproof.io', [ __CLASS__, 'check_update' ], 10, 4 );
        add_filter( 'plugins_api', [ __CLASS__, 'plugin_info' ], 10, 3 );
        add_action( 'upgrader_process_complete', [ __CLASS__, 'flush_cache' ], 10, 0 );
    }

    public static function check_update( $update, $plugin_data, $plugin_file, $locales ) {
        unset( $plugin_data, $plugin_file, $locales );

        $manifest = self::fetch_manifest();
        if ( ! is_array( $manifest ) || empty( $manifest['version'] ) ) {
            return $update;
        }

        // Return current-version payload so the "View details" modal can populate.
        if ( version_compare( $manifest['version'], QAPROOF_VERSION, '<=' ) ) {
            return [
                'slug'         => 'qaproof',
                'version'      => $manifest['version'],
                'url'          => isset( $manifest['homepage'] ) ? $manifest['homepage'] : '',
                'package'      => '',
                'tested'       => isset( $manifest['tested'] ) ? $manifest['tested'] : '',
                'requires_php' => isset( $manifest['requires_php'] ) ? $manifest['requires_php'] : '',
            ];
        }

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

    public static function flush_cache() {
        delete_transient( self::CACHE_KEY );
    }
}
