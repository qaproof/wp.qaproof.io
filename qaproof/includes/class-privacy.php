<?php
/**
 * GDPR hooks: suggested privacy-policy text, personal-data exporter and eraser
 * for the notification recipient email (the only user-identifying value the
 * plugin stores on the WP site).
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
            /* translators: 1: link to QAProof Privacy Policy, 2: link to Anthropic Privacy Policy */
            __(
                '<p>This site uses QAProof to run automated design and accessibility tests against its public pages. When you trigger a test from the WordPress admin (or when a scheduled monitor runs), the plugin sends the page URL, optional design source (Figma URL or uploaded image), and your configured QAProof API key to the QAProof API at api.qaproof.io. The QAProof API renders the page in a headless browser, calls the Anthropic Claude Vision model to analyze the screenshots, and returns a structured report.</p>
                <p>Data stored locally by the plugin: the QAProof API key (used to authenticate API calls), the email address configured to receive regression notifications, saved design configurations, and a local copy of recent test results for offline browsing. Test result rows in the SaaS database are scoped to your QAProof workspace.</p>
                <p>For details on how QAProof and Anthropic handle the data you submit, see the %1$s and the %2$s.</p>',
                'qaproof'
            ),
            '<a href="https://qaproof.io/privacy">' . esc_html__( 'QAProof Privacy Policy', 'qaproof' ) . '</a>',
            '<a href="https://www.anthropic.com/legal/privacy">' . esc_html__( 'Anthropic Privacy Policy', 'qaproof' ) . '</a>'
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

    public static function erase_personal_data( $email_address, $page = 1 ) {
        $removed = 0;
        $notify  = (string) get_option( 'qaproof_notify_email', '' );
        if ( $notify !== '' && strcasecmp( $notify, (string) $email_address ) === 0 ) {
            delete_option( 'qaproof_notify_email' );
            $removed++;
        }

        return [
            'items_removed'  => $removed,
            'items_retained' => 0,
            'messages'       => $removed > 0 ? [
                __( 'QAProof: removed the notification recipient email tied to this address.', 'qaproof' ),
            ] : [],
            'done'           => true,
        ];
    }
}
