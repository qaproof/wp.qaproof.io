<?php
/**
 * Notification system for visual regression alerts.
 * Supports email and WP admin badge notifications.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Notifications {

    const BADGE_TRANSIENT = 'qaproof_alert_count';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'add_menu_badge' ), 999 );
    }

    public static function notify( $monitor, $result ) {
        if ( ! empty( $monitor['notify_email'] ) ) {
            self::send_email( $monitor, $result );
        }

        if ( ! empty( $monitor['notify_admin'] ) ) {
            self::increment_badge();
        }
    }

    private static function send_email( $monitor, $result ) {
        $admin_email = get_option( 'qaproof_notify_email', get_option( 'admin_email' ) );
        $score = isset( $result['score'] ) ? $result['score'] : 'N/A';
        $summary = isset( $result['summary'] ) ? $result['summary'] : 'No summary available.';

        $subject = sprintf(
            /* translators: 1: score, 2: page URL */
            __( '[QAProof] Visual regression detected (score: %1$s) — %2$s', 'qaproof' ),
            $score,
            $monitor['page_url']
        );

        $results_url = admin_url( 'admin.php?page=qaproof-monitors&monitor_id=' . $monitor['id'] );

        $body = sprintf(
            __(
                "QAProof has detected visual changes on a monitored page.\n\n" .
                "Page: %1\$s\n" .
                "Score: %2\$s / 100 (threshold: %3\$s)\n" .
                "Summary: %4\$s\n\n" .
                "View full results: %5\$s\n\n" .
                "If the changes are intentional, click \"Approve Changes\" in the plugin to update the baseline.",
                'qaproof'
            ),
            $monitor['page_url'],
            $score,
            $monitor['threshold_score'],
            $summary,
            $results_url
        );

        wp_mail( $admin_email, $subject, $body );
    }

    public static function increment_badge() {
        $count = (int) get_transient( self::BADGE_TRANSIENT );
        set_transient( self::BADGE_TRANSIENT, $count + 1, 30 * DAY_IN_SECONDS );
    }

    public static function get_badge_count() {
        return (int) get_transient( self::BADGE_TRANSIENT );
    }

    public static function clear_badge() {
        delete_transient( self::BADGE_TRANSIENT );
    }

    /** Add the regression-count badge to the Monitors submenu item. */
    public static function add_menu_badge() {
        global $submenu;

        $count = self::get_badge_count();
        if ( $count < 1 ) {
            return;
        }

        $badge = sprintf(
            ' <span class="awaiting-mod"><span class="pending-count">%d</span></span>',
            $count
        );

        if ( empty( $submenu['qaproof'] ) ) {
            return;
        }

        foreach ( $submenu['qaproof'] as $key => $item ) {
            if ( isset( $item[2] ) && $item[2] === 'qaproof-monitors' ) {
                $submenu['qaproof'][ $key ][0] .= $badge;
                break;
            }
        }
    }
}
