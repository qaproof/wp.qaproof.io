<?php
/**
 * GDPR hooks: suggested privacy-policy text, personal-data exporter and eraser
 * for the user-identifying values the plugin stores on the WP site.
 *
 * What's covered:
 *   - `qaproof_notify_email` — single recipient address (option).
 *
 * What's NOT covered (lives on the QAProof SaaS, erasable only via
 * support@qaproof.io): test history, monitor results, regression baselines,
 * "How was this test?" feedback. The exporter/eraser messages surface this
 * scope so the data-subject and the site admin both understand what is and
 * isn't covered by a WP-initiated erasure.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Privacy {

    public static function init() {
        add_action( 'admin_init',                            [ __CLASS__, 'register_policy_content' ] );
        add_filter( 'wp_privacy_personal_data_exporters',    [ __CLASS__, 'register_exporter' ] );
        add_filter( 'wp_privacy_personal_data_erasers',      [ __CLASS__, 'register_eraser' ] );
    }

    public static function register_policy_content() {
        if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
            return;
        }
        $content = wp_kses_post( sprintf(
            /* translators: 1: link to QAProof Privacy Policy, 2: link to Anthropic Privacy Policy, 3: link to Figma Privacy Policy, 4: link to AWS SES service terms */
            __(
                '<p>This site uses QAProof to run automated design and accessibility tests against its public pages. When you trigger a test from the WordPress admin (or when a scheduled monitor runs), the plugin sends the page URL, optional design source (Figma URL or uploaded image), and your configured QAProof API key to the QAProof API at api.qaproof.io. The QAProof API renders the page in a headless browser, calls the Anthropic Claude Vision model to analyze the screenshots, and returns a structured report.</p>
                <p>When you click "Send to Email" on a test result, the plugin also sends the generated PDF report and the currently-logged-in administrator\'s email address to the QAProof API, which delivers the email via Amazon Simple Email Service.</p>
                <p>When you submit a rating in the in-admin "How was this test?" widget, the rating, optional comment, the test type, the tested page URL, the score, your WordPress user ID, and your site\'s home URL are sent to the QAProof API for product-quality analytics. Feedback is NOT stored on this WordPress site.</p>
                <p>If you connect a Figma account or submit a Figma URL, the QAProof API additionally calls the Figma REST API on your behalf to export the design image; OAuth tokens are stored on api.qaproof.io scoped to your workspace, never on this WordPress site.</p>
                <p>Data stored locally by the plugin: the QAProof API key (non-autoloaded), the email address configured to receive regression notifications, and saved-design configurations (including optionally a cached PNG of the Figma export). All test results, monitor definitions, monitor result history, visual regression baselines, and plugin feedback live on the QAProof SaaS, scoped to your QAProof workspace; this plugin does not create custom database tables for them on fresh installs.</p>
                <p>Geographic processing: api.qaproof.io is hosted in AWS us-east-1 (United States). Anthropic Claude, Figma, and Amazon SES also process data in the United States. EU-based site owners should review the QAProof Privacy Policy for the international-transfer legal mechanisms in use.</p>
                <p>For full details on retention, sub-processors, and your rights, see the %1$s, the %2$s, the %3$s, and the %4$s.</p>',
                'qaproof'
            ),
            '<a href="https://qaproof.io/privacy">' . esc_html__( 'QAProof Privacy Policy', 'qaproof' ) . '</a>',
            '<a href="https://www.anthropic.com/legal/privacy">' . esc_html__( 'Anthropic Privacy Policy', 'qaproof' ) . '</a>',
            '<a href="https://www.figma.com/legal/privacy/">'        . esc_html__( 'Figma Privacy Policy',     'qaproof' ) . '</a>',
            '<a href="https://aws.amazon.com/service-terms/">'       . esc_html__( 'AWS Service Terms (SES)',   'qaproof' ) . '</a>'
        ) );
        wp_add_privacy_policy_content( 'QAProof', $content );
    }

    public static function register_exporter( $exporters ) {
        $exporters['qaproof'] = [
            'exporter_friendly_name' => __( 'QAProof', 'qaproof' ),
            'callback'               => [ __CLASS__, 'export_personal_data' ],
        ];
        return $exporters;
    }

    /**
     * Personal-data exporter.
     *
     * Returns the notification recipient email if it matches the requested
     * address (case-insensitive).
     *
     * SaaS-side data (test history, monitor results, baselines, feedback) is
     * NOT exported here — the WP site doesn't have the keys to read it.
     * Users must request that separately from QAProof support.
     */
    public static function export_personal_data( $email_address, $page = 1 ) {
        $data = [];

        $notify = (string) get_option( 'qaproof_notify_email', '' );
        if ( $notify !== '' && strcasecmp( $notify, (string) $email_address ) === 0 ) {
            $data[] = [
                'group_id'    => 'qaproof',
                'group_label' => __( 'QAProof', 'qaproof' ),
                'item_id'     => 'qaproof-notify-email',
                'data'        => [
                    [
                        'name'  => __( 'Notification email', 'qaproof' ),
                        'value' => $notify,
                    ],
                ],
            ];
        }

        return [
            'data' => $data,
            'done' => true,
        ];
    }

    public static function register_eraser( $erasers ) {
        $erasers['qaproof'] = [
            'eraser_friendly_name' => __( 'QAProof', 'qaproof' ),
            'callback'             => [ __CLASS__, 'erase_personal_data' ],
        ];
        return $erasers;
    }

    /**
     * Personal-data eraser.
     *
     * Removes the notification recipient email option if it matches the
     * requested address.
     *
     * SaaS-side data (test history, monitor results, baselines, feedback) is
     * NOT removed by this action — the WP site has no authority over the
     * SaaS workspace. The returned message tells the admin to contact
     * support@qaproof.io for server-side deletion.
     */
    public static function erase_personal_data( $email_address, $page = 1 ) {
        $removed  = 0;
        $messages = [];

        $notify = (string) get_option( 'qaproof_notify_email', '' );
        if ( $notify !== '' && strcasecmp( $notify, (string) $email_address ) === 0 ) {
            delete_option( 'qaproof_notify_email' );
            $removed++;
        }

        if ( $removed > 0 ) {
            $messages[] = __( 'QAProof: removed the notification recipient email. SaaS-side test history, monitor results, baselines, and plugin feedback on api.qaproof.io are NOT removed by this action — contact support@qaproof.io to request server-side deletion.', 'qaproof' );
        }

        return [
            'items_removed'  => $removed,
            'items_retained' => 0,
            'messages'       => $messages,
            'done'           => true,
        ];
    }
}
