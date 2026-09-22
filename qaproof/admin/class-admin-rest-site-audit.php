<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * WP REST handlers for SITE audits — one accessibility audit across many
 * pages of one site.
 *
 * A pure proxy: everything lives in the SaaS API, which owns the crawl, the
 * per-page captures and the scan-to-scan comparison. This class exists only
 * so the browser never has to hold the API key.
 *
 * NOT to be confused with QAProof_Admin_REST_Tests::handle_site_audit(),
 * which is the KEYLESS single-page check shown on a fresh install before the
 * user has an account. That one is deliberately unauthenticated upstream and
 * covers exactly one URL; these routes need a key and cover a whole site.
 * The route names differ by a plural for that reason — /site-audit vs
 * /site-audits — and the two must not be merged.
 */
class QAProof_Admin_REST_Site_Audit {

    /** Turn a WP_Error from the API client into the shape the JS expects. */
    private static function error_response( $err ) {
        $data = $err->get_error_data();
        $http = ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 502;
        return new WP_REST_Response( [
            'success' => false,
            'error'   => [
                'code'    => $err->get_error_code(),
                'message' => $err->get_error_message(),
            ],
        ], $http );
    }

    /**
     * Start an audit. Returns as soon as the audit row exists upstream — the
     * run itself takes 10–35 minutes and is watched by polling handle_get().
     */
    public static function handle_start( WP_REST_Request $request ) {
        $url = trim( (string) $request->get_param( 'url' ) );

        // Default to the site this plugin is installed on. That is the whole
        // point of running the audit from inside WordPress, and it saves the
        // most common case a round of typing.
        if ( $url === '' ) {
            $url = home_url( '/' );
        }

        $pages  = $request->get_param( 'pages' );
        $result = QAProof_API_Client::site_audit_start( $url, $pages ? (int) $pages : null );

        if ( is_wp_error( $result ) ) {
            return self::error_response( $result );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 202 );
    }

    public static function handle_list( WP_REST_Request $request ) {
        $limit  = $request->get_param( 'limit' ) ? (int) $request->get_param( 'limit' ) : 10;
        $result = QAProof_API_Client::site_audit_list( $limit );

        if ( is_wp_error( $result ) ) {
            return self::error_response( $result );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }

    /**
     * Stream the PDF report to the browser.
     *
     * The response is binary, so it cannot go through WP_REST_Response — the
     * REST server would JSON-encode it. Headers are sent by hand and the
     * request ends here.
     *
     * The download is proxied rather than linked directly at the API because
     * the API key lives in PHP and must not reach the browser; the nonce and
     * the manage_options capability are what authorise the caller.
     */
    public static function handle_report_pdf( WP_REST_Request $request ) {
        $id     = sanitize_text_field( (string) $request['id'] );
        $result = QAProof_API_Client::site_audit_report_pdf( $id );

        if ( is_wp_error( $result ) ) {
            return self::error_response( $result );
        }

        // Anything already buffered would corrupt the PDF.
        while ( ob_get_level() > 0 ) {
            ob_end_clean();
        }

        header( 'Content-Type: ' . $result['content_type'] );
        header( 'Content-Disposition: attachment; filename="' . $result['filename'] . '"' );
        header( 'Content-Length: ' . strlen( $result['body'] ) );
        // The report names the customer's pages and their defects.
        header( 'Cache-Control: private, no-store' );
        header( 'X-Content-Type-Options: nosniff' );

        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- binary PDF
        echo $result['body'];
        exit;
    }

    /**
     * Read one audit. `findings=1` asks for the full report (per-page
     * findings, the cross-page grouping and the comparison with the previous
     * audit); without it the response is the light progress view, which is
     * what the poll loop uses every few seconds.
     */
    public static function handle_get( WP_REST_Request $request ) {
        $id       = sanitize_text_field( (string) $request['id'] );
        $findings = in_array( (string) $request->get_param( 'findings' ), [ '1', 'true' ], true );

        $result = QAProof_API_Client::site_audit_get( $id, $findings );

        if ( is_wp_error( $result ) ) {
            return self::error_response( $result );
        }

        return new WP_REST_Response( [ 'success' => true, 'data' => $result ], 200 );
    }
}
