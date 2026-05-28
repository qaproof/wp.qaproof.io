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
