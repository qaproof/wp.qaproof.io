<?php
/**
 * GDPR hooks: suggested privacy-policy text, personal-data exporter and eraser
 * for the user-identifying values the plugin stores on the WP site.
 *
 * What's covered:
 *   - `qaproof_notify_email` — single recipient address (option).
 *   - `qaproof_feedback_log` — ring buffer of in-admin "How was this test?"
 *      ratings keyed to the WP user_id at submit time. Each entry carries an
 *      optional free-text comment + the page URL the rating was given for.
 *
 * Local erasure does NOT propagate to the QAProof SaaS — test history,
 * monitor results, baselines live server-side and have their own deletion
 * flow (handled via support@qaproof.io). The exporter/eraser messages
 * surface this scope so the data-subject and the site admin both
 * understand what is and isn't covered by a WP-initiated erasure.
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
                <p>If you connect a Figma account or submit a Figma URL, the QAProof API additionally calls the Figma REST API on your behalf to export the design image; OAuth tokens are stored on api.qaproof.io scoped to your workspace, never on this WordPress site.</p>
                <p>Data stored locally by the plugin: the QAProof API key (non-autoloaded), the email address configured to receive regression notifications, saved-design configurations (including optionally a cached PNG of the Figma export), and an in-admin "feedback log" of ratings keyed to the WordPress user ID of the rater. All test results, monitor definitions, monitor result history, and visual regression baselines live on the QAProof SaaS, scoped to your QAProof workspace; this plugin does not create custom database tables for them on fresh installs.</p>
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
     * Returns:
     *   - The notification recipient email if it matches the requested
     *     address (case-insensitive).
     *   - Every feedback-log entry whose `userId` resolves to a WP user
     *     account with the requested email (matched via get_user_by(email)).
     *
     * The plugin's SaaS-side data is NOT exported here — the user must
     * request that separately from QAProof support since the WP site does
     * not have the keys to export on behalf of the SaaS.
     */
    public static function export_personal_data( $email_address, $page = 1 ) {
        $data = [];

        // (a) Notification recipient option.
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

        // (b) Feedback-log entries authored by the user with this email.
        $user = get_user_by( 'email', $email_address );
        if ( $user ) {
            $feedback = get_option( 'qaproof_feedback_log', [] );
            if ( is_array( $feedback ) ) {
                foreach ( $feedback as $entry ) {
                    if ( ! is_array( $entry ) ) {
                        continue;
                    }
                    if ( isset( $entry['userId'] ) && (int) $entry['userId'] === (int) $user->ID ) {
                        $data[] = [
                            'group_id'    => 'qaproof',
                            'group_label' => __( 'QAProof', 'qaproof' ),
                            'item_id'     => 'qaproof-feedback-' . ( isset( $entry['id'] ) ? sanitize_key( $entry['id'] ) : 'unknown' ),
                            'data'        => [
                                [ 'name' => __( 'Type',       'qaproof' ), 'value' => isset( $entry['testType'] )  ? $entry['testType']  : '' ],
                                [ 'name' => __( 'Page URL',   'qaproof' ), 'value' => isset( $entry['pageUrl'] )   ? $entry['pageUrl']   : '' ],
                                [ 'name' => __( 'Score',      'qaproof' ), 'value' => isset( $entry['score'] )     ? $entry['score']     : '' ],
                                [ 'name' => __( 'Rating',     'qaproof' ), 'value' => isset( $entry['rating'] )    ? $entry['rating']    : '' ],
                                [ 'name' => __( 'Comment',    'qaproof' ), 'value' => isset( $entry['comment'] )   ? $entry['comment']   : '' ],
                                [ 'name' => __( 'Created at', 'qaproof' ), 'value' => isset( $entry['createdAt'] ) ? $entry['createdAt'] : '' ],
                            ],
                        ];
                    }
                }
            }
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
     * Removes:
     *   - The notification recipient email option, if it matches the
     *     requested address.
     *   - Every feedback-log entry authored by the WP user whose email
     *     matches the requested address.
     *
     * The returned message explicitly tells the admin that SaaS-side data
     * is NOT removed by this action — they must contact support@qaproof.io.
     */
    public static function erase_personal_data( $email_address, $page = 1 ) {
        $removed   = 0;
        $messages  = [];

        // (a) Notification recipient option.
        $notify = (string) get_option( 'qaproof_notify_email', '' );
        if ( $notify !== '' && strcasecmp( $notify, (string) $email_address ) === 0 ) {
            delete_option( 'qaproof_notify_email' );
            $removed++;
        }

        // (b) Feedback-log entries authored by the user with this email.
        $user = get_user_by( 'email', $email_address );
        if ( $user ) {
            $feedback = get_option( 'qaproof_feedback_log', [] );
            if ( is_array( $feedback ) && ! empty( $feedback ) ) {
                $before = count( $feedback );
                $feedback = array_values( array_filter( $feedback, function ( $entry ) use ( $user ) {
                    return ! ( is_array( $entry ) && isset( $entry['userId'] ) && (int) $entry['userId'] === (int) $user->ID );
                } ) );
                $diff = $before - count( $feedback );
                if ( $diff > 0 ) {
                    update_option( 'qaproof_feedback_log', $feedback );
                    $removed += $diff;
                }
            }
        }

        if ( $removed > 0 ) {
            $messages[] = __( 'QAProof: removed the notification recipient email and any in-admin feedback entries authored by this user. SaaS-side test history, monitor results, and baselines on api.qaproof.io are NOT removed by this action — contact support@qaproof.io to request server-side deletion.', 'qaproof' );
        }

        return [
            'items_removed'  => $removed,
            'items_retained' => 0,
            'messages'       => $messages,
            'done'           => true,
        ];
    }
}
