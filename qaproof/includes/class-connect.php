<?php
/**
 * One-click account connection.
 *
 * Getting an API key into a site used to mean leaving WordPress, signing up,
 * verifying an email, opening the API keys page, copying a key and pasting it
 * back — six steps across two sites, and the last place most people stopped.
 *
 * This replaces that with: click, sign in on qaproof.io, land back here
 * connected.
 *
 * How it stays safe:
 *   - We generate a random `state`, keep it in a transient for ten minutes,
 *     and require it back. A code that arrives without the matching state is
 *     refused, so a code alone — leaked from a browser history or a referrer —
 *     is worth nothing.
 *   - The API key never travels through the browser. The callback receives a
 *     one-time code, and THIS server swaps it for the key over HTTPS.
 *   - Both hops are restricted to administrators of this site, and the
 *     callback checks the nonce WordPress gave us on the way out.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class QAProof_Connect {

    const STATE_TRANSIENT = 'qaproof_connect_state';
    const STATE_TTL       = 600; // seconds

    public static function init() {
        add_action( 'admin_post_qaproof_connect_start',    [ __CLASS__, 'handle_start' ] );
        add_action( 'admin_post_qaproof_connect_callback', [ __CLASS__, 'handle_callback' ] );
    }

    /** Where qaproof.io lives, honouring a local override for development. */
    private static function site_base() {
        $api = QAProof_Settings::get_api_endpoint();
        // api.qaproof.io → qaproof.io. Any other host (a dev override) is used
        // as-is, minus an `api.` prefix if it has one.
        $host = wp_parse_url( $api, PHP_URL_HOST );
        $scheme = wp_parse_url( $api, PHP_URL_SCHEME ) ?: 'https';
        if ( is_string( $host ) && strpos( $host, 'api.' ) === 0 ) {
            $host = substr( $host, 4 );
        }
        $port = wp_parse_url( $api, PHP_URL_PORT );
        return $scheme . '://' . $host . ( $port ? ':' . $port : '' );
    }

    private static function settings_url( $args = [] ) {
        return add_query_arg( $args, admin_url( 'admin.php?page=' . QAProof_Admin::SETTINGS_SLUG ) );
    }

    /**
     * Step one: remember a state and send the admin to qaproof.io.
     */
    public static function handle_start() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You do not have permission to connect this site.', 'qaproof' ), 403 );
        }
        check_admin_referer( 'qaproof_connect' );

        $state = wp_generate_password( 48, false, false );
        set_transient( self::STATE_TRANSIENT, $state, self::STATE_TTL );

        // NOT wp_nonce_url(): it escapes the separator for HTML output, so the
        // URL comes back with `&amp;_wpnonce`. That is fine in an href and
        // wrong here — this URL is about to be urlencoded into a query
        // parameter, and the nonce would arrive named `amp;_wpnonce`, failing
        // every check on the way back.
        $callback = add_query_arg(
            [
                'action'   => 'qaproof_connect_callback',
                '_wpnonce' => wp_create_nonce( 'qaproof_connect_callback' ),
            ],
            admin_url( 'admin-post.php' )
        );

        wp_redirect( add_query_arg(
            [
                'state'  => rawurlencode( $state ),
                'site'   => rawurlencode( home_url( '/' ) ),
                'return' => rawurlencode( $callback ),
            ],
            self::site_base() . '/connect'
        ) );
        exit;
    }

    /**
     * Step two: swap the code for the key, server to server, and save it.
     */
    public static function handle_callback() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You do not have permission to connect this site.', 'qaproof' ), 403 );
        }
        check_admin_referer( 'qaproof_connect_callback' );

        $expected = get_transient( self::STATE_TRANSIENT );
        delete_transient( self::STATE_TRANSIENT );

        $state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
        $code  = isset( $_GET['code'] )  ? sanitize_text_field( wp_unslash( $_GET['code'] ) )  : '';

        // hash_equals, not ===, because this compares a secret.
        if ( empty( $expected ) || empty( $state ) || ! hash_equals( (string) $expected, $state ) ) {
            wp_safe_redirect( self::settings_url( [ 'qaproof_connect' => 'state' ] ) );
            exit;
        }
        if ( ! preg_match( '/^[a-f0-9]{64}$/', $code ) ) {
            wp_safe_redirect( self::settings_url( [ 'qaproof_connect' => 'code' ] ) );
            exit;
        }

        $response = wp_remote_post(
            QAProof_Settings::get_api_endpoint() . '/api/plugin/connect/exchange',
            [
                'headers'   => [ 'Content-Type' => 'application/json' ],
                'body'      => wp_json_encode( [ 'code' => $code, 'state' => $state ] ),
                'timeout'   => 20,
                'sslverify' => true,
            ]
        );

        if ( is_wp_error( $response ) ) {
            wp_safe_redirect( self::settings_url( [ 'qaproof_connect' => 'network' ] ) );
            exit;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        if ( ! is_array( $body ) || empty( $body['success'] ) || empty( $body['data']['apiKey'] ) ) {
            wp_safe_redirect( self::settings_url( [ 'qaproof_connect' => 'exchange' ] ) );
            exit;
        }

        update_option( 'qaproof_api_key', sanitize_text_field( $body['data']['apiKey'] ), false );

        wp_safe_redirect( self::settings_url( [ 'qaproof_connect' => 'ok' ] ) );
        exit;
    }

    /** The URL the "Connect" buttons point at. */
    public static function start_url() {
        return wp_nonce_url(
            admin_url( 'admin-post.php?action=qaproof_connect_start' ),
            'qaproof_connect'
        );
    }

    /** Human-readable outcome for the notice on the settings page. */
    public static function notice() {
        if ( ! isset( $_GET['qaproof_connect'] ) ) {
            return null;
        }
        switch ( sanitize_key( wp_unslash( $_GET['qaproof_connect'] ) ) ) {
            case 'ok':
                return [ 'success', __( 'Connected. Your API key is in place — you can run a test now.', 'qaproof' ) ];
            case 'state':
                return [ 'error', __( 'That connection attempt expired or did not match. Please try connecting again.', 'qaproof' ) ];
            case 'code':
                return [ 'error', __( 'The connection link was malformed. Please try connecting again.', 'qaproof' ) ];
            case 'network':
                return [ 'error', __( 'We could not reach qaproof.io to finish connecting. Please try again.', 'qaproof' ) ];
            case 'exchange':
                return [ 'error', __( 'That connection link was already used or has expired. Please try connecting again.', 'qaproof' ) ];
        }
        return null;
    }
}
