<?php
/**
 * WP-Cron scheduler for visual regression monitoring.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class QAProof_Scheduler {

    const DAILY_HOOK   = 'qaproof_cron_daily';
    const WEEKLY_HOOK  = 'qaproof_cron_weekly';
    const MONTHLY_HOOK = 'qaproof_cron_monthly';
    const RUN_HOOK     = 'qaproof_run_monitor';

    public static function init() {
        add_filter( 'cron_schedules', array( __CLASS__, 'register_schedules' ) );

        add_action( self::DAILY_HOOK,   array( __CLASS__, 'run_daily' ) );
        add_action( self::WEEKLY_HOOK,  array( __CLASS__, 'run_weekly' ) );
        add_action( self::MONTHLY_HOOK, array( __CLASS__, 'run_monthly' ) );
        add_action( self::RUN_HOOK,     array( __CLASS__, 'run_single_monitor' ), 10, 1 );

        add_action( 'update_option_qaproof_cron_hour', array( __CLASS__, 'reschedule_events' ) );
        add_filter( 'cron_request', array( __CLASS__, 'normalize_cron_url' ) );

        // Surface DISABLE_WP_CRON as a visible admin notice on QAProof pages.
        // When the constant is true, scheduled monitors silently never fire —
        // users see nothing in the UI and assume the plugin is broken. The
        // notice tells them to wire up a system cron OR turn the constant off.
        add_action( 'admin_notices', array( __CLASS__, 'maybe_show_disable_wp_cron_notice' ) );
        add_action( 'wp_ajax_qaproof_dismiss_cron_notice', array( __CLASS__, 'ajax_dismiss_cron_notice' ) );
    }

    /**
     * Render a dismissible warning when DISABLE_WP_CRON is true. Shown only
     * on QAProof's own Monitors screen — the cron constant only affects
     * scheduled monitors, so showing it on Tests / Settings / Accessibility
     * is noise. Dismissal is stored site-wide in wp_options (one admin
     * acknowledges it, all admins are quiet) rather than per-user.
     */
    public static function maybe_show_disable_wp_cron_notice() {
        if ( ! defined( 'DISABLE_WP_CRON' ) || ! DISABLE_WP_CRON ) return;
        if ( ! current_user_can( QAProof_Admin::CAPABILITY ) ) return;
        if ( get_option( 'qaproof_dismiss_cron_notice', false ) ) return;
        $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
        if ( ! $screen ) return;
        // Only show on the Monitors screen — the cron constant doesn't affect
        // ad-hoc tests, so this warning is irrelevant outside Monitors.
        // Screen IDs: `qaproof_page_qaproof-monitors`, `toplevel_page_qaproof`
        // (Dashboard). Show on both since Dashboard surfaces monitor status.
        $screen_id = $screen->id;
        $is_monitor_screen   = strpos( $screen_id, 'qaproof-monitors' ) !== false;
        $is_dashboard_screen = $screen_id === 'toplevel_page_qaproof';
        if ( ! $is_monitor_screen && ! $is_dashboard_screen ) return;

        $nonce = wp_create_nonce( 'qaproof_dismiss_cron_notice' );
        echo '<div class="notice notice-warning is-dismissible" id="qaproof-cron-notice" data-nonce="' . esc_attr( $nonce ) . '">'
           . '<p><strong>' . esc_html__( 'QAProof:', 'qaproof' ) . '</strong> '
           . esc_html__( 'WordPress Cron is disabled on this site (DISABLE_WP_CRON). Scheduled QAProof monitors will not fire automatically until you run wp-cron.php from a system cron or remove the DISABLE_WP_CRON constant.', 'qaproof' )
           . '</p></div>'
           . '<script>(function(){
               var el = document.getElementById("qaproof-cron-notice");
               if ( ! el ) return;
               el.addEventListener("click", function(e){
                   if ( ! e.target.classList.contains("notice-dismiss") ) return;
                   fetch( ajaxurl, {
                       method: "POST",
                       headers: { "Content-Type": "application/x-www-form-urlencoded" },
                       body: "action=qaproof_dismiss_cron_notice&nonce=" + el.dataset.nonce
                   });
               });
           })();</script>';
    }

    /**
     * AJAX handler — saves dismissal flag in wp_options (site-wide) so any
     * admin dismissing the notice quiets it for everyone. Previously stored
     * in user_meta which made each admin re-dismiss individually.
     */
    public static function ajax_dismiss_cron_notice() {
        check_ajax_referer( 'qaproof_dismiss_cron_notice', 'nonce' );
        update_option( 'qaproof_dismiss_cron_notice', 1 );
        wp_die();
    }

    /** Register the `monthly` interval (WP ships daily + weekly only). */
    public static function register_schedules( $schedules ) {
        if ( ! isset( $schedules['monthly'] ) ) {
            $schedules['monthly'] = array(
                'interval' => 30 * DAY_IN_SECONDS,
                'display'  => __( 'Once Monthly', 'qaproof' ),
            );
        }
        return $schedules;
    }

    /**
     * Drop a non-standard port from a localhost cron URL so spawn_cron() can
     * reach wp-cron.php on the loopback. Production URLs are untouched.
     */
    public static function normalize_cron_url( $cron_request ) {
        $url    = isset( $cron_request['url'] ) ? $cron_request['url'] : '';
        $parsed = wp_parse_url( $url );

        $host = isset( $parsed['host'] ) ? $parsed['host'] : '';
        $port = isset( $parsed['port'] ) ? (int) $parsed['port'] : 0;

        if ( 'localhost' === $host && $port > 0 && $port !== 80 && $port !== 443 ) {
            $cron_request['url'] = str_replace( $host . ':' . $port, $host, $url );
        }

        return $cron_request;
    }

    /**
     * UTC timestamp for the next occurrence of $hour (0–23) in the site timezone.
     */
    private static function next_occurrence_of_hour( $hour ) {
        $hour = max( 0, min( 23, (int) $hour ) );

        try {
            $tz     = wp_timezone();
            $now    = new DateTime( 'now', $tz );
            $target = clone $now;
            $target->setTime( $hour, 0, 0 );
            if ( $target <= $now ) {
                $target->modify( '+1 day' );
            }
            return $target->getTimestamp();
        } catch ( Exception $e ) {
            // Fallback for corrupt timezone identifiers.
            $now_ts         = time();
            $today_midnight = $now_ts - ( $now_ts % DAY_IN_SECONDS );
            $today_at_hour  = $today_midnight + ( $hour * HOUR_IN_SECONDS );
            return $today_at_hour > $now_ts ? $today_at_hour : $today_at_hour + DAY_IN_SECONDS;
        }
    }

    public static function schedule_events() {
        $hour      = (int) get_option( 'qaproof_cron_hour', 8 );
        $first_run = self::next_occurrence_of_hour( $hour );

        if ( ! wp_next_scheduled( self::DAILY_HOOK ) ) {
            wp_schedule_event( $first_run, 'daily', self::DAILY_HOOK );
        }
        if ( ! wp_next_scheduled( self::WEEKLY_HOOK ) ) {
            wp_schedule_event( $first_run, 'weekly', self::WEEKLY_HOOK );
        }
        if ( ! wp_next_scheduled( self::MONTHLY_HOOK ) ) {
            wp_schedule_event( $first_run, 'monthly', self::MONTHLY_HOOK );
        }
    }

    public static function reschedule_events() {
        $hour      = (int) get_option( 'qaproof_cron_hour', 8 );
        $first_run = self::next_occurrence_of_hour( $hour );

        wp_clear_scheduled_hook( self::DAILY_HOOK );
        wp_clear_scheduled_hook( self::WEEKLY_HOOK );
        wp_clear_scheduled_hook( self::MONTHLY_HOOK );

        wp_schedule_event( $first_run, 'daily',   self::DAILY_HOOK );
        wp_schedule_event( $first_run, 'weekly',  self::WEEKLY_HOOK );
        wp_schedule_event( $first_run, 'monthly', self::MONTHLY_HOOK );
    }

    public static function unschedule_events() {
        wp_clear_scheduled_hook( self::DAILY_HOOK );
        wp_clear_scheduled_hook( self::WEEKLY_HOOK );
        wp_clear_scheduled_hook( self::MONTHLY_HOOK );
        // RUN_HOOK is fired by per-monitor `wp_schedule_single_event` with a
        // unique argument (`monitor_id`). `wp_clear_scheduled_hook( $hook )`
        // (no args) only matches events with no args — so the per-monitor
        // queued runs would survive deactivation and fire on the next cron
        // tick after the plugin code is already unloaded, producing fatals
        // or silent dropped events. `wp_unschedule_hook( $hook )` matches
        // every variant including those with arbitrary args.
        if ( function_exists( 'wp_unschedule_hook' ) ) {
            wp_unschedule_hook( self::RUN_HOOK );
        } else {
            // wp_unschedule_hook is WP 4.9+; fall back to legacy single-arg clear.
            wp_clear_scheduled_hook( self::RUN_HOOK );
        }
    }

    public static function run_daily()   { self::dispatch_monitors( 'daily' ); }
    public static function run_weekly()  { self::dispatch_monitors( 'weekly' ); }
    public static function run_monthly() { self::dispatch_monitors( 'monthly' ); }

    /**
     * Dispatch each due monitor as its own single event so one slow run
     * can't block the rest. Each event is staggered by 120 s.
     */
    private static function dispatch_monitors( $schedule ) {
        $monitors = QAProof_API_Client::monitors_list_due( $schedule );

        if ( is_wp_error( $monitors ) ) {
            qaproof_debug_log( '[QAProof] dispatch_monitors failed: ' . $monitors->get_error_message() );
            return;
        }

        $delay = 5;
        foreach ( $monitors as $monitor ) {
            wp_schedule_single_event(
                time() + $delay,
                self::RUN_HOOK,
                array( (string) $monitor['id'] )
            );
            $delay += 120;
        }
    }

    public static function run_single_monitor( $monitor_id ) {
        // This is a WP-Cron event handler — NOT a user request. It runs in the
        // background to poll the QAProof API for a regression test result, a
        // process that legitimately takes 8–12 min on complex pages (Playwright
        // capture + AI vision analysis). Without raising PHP's max_execution_time
        // here, PHP's default 30 s kills the cron worker mid-poll, leaving the
        // monitor row in an inconsistent "running but timed out" state.
        //
        // Scoped strictly to this handler. We do NOT modify max_execution_time
        // on init, on activation, or anywhere a regular request can reach. The
        // setting reverts to PHP-default the moment this function returns.
        //
        // SECURITY GATE: only raise the limit when we're actually inside a
        // cron worker (`DOING_CRON`). Without this check, an attacker who
        // can reach the `qaproof_run_monitor` action via some other path
        // (`do_action('qaproof_run_monitor', $id)` injection through a
        // future bug, etc.) would drag a regular PHP worker into a 15-min
        // window — useful for resource-exhaustion against the host.
        //
        // Gated on availability so we never crash on hosts that disable
        // set_time_limit() entirely (some shared providers do).
        if ( defined( 'DOING_CRON' ) && DOING_CRON
             && function_exists( 'set_time_limit' )
             && ! in_array( 'set_time_limit', explode( ',', (string) ini_get( 'disable_functions' ) ), true )
        ) {
            // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged, WordPress.PHP.NoSilencedErrors.Discouraged -- intentional cron-handler scoping, gated on DOING_CRON + availability + disable_functions allow-list.
            @set_time_limit( 900 );
        }

        $monitor = QAProof_API_Client::monitors_get( (string) $monitor_id );
        if ( is_wp_error( $monitor ) || ! $monitor['is_enabled'] ) {
            return;
        }

        if ( ! $monitor['has_baseline'] ) {
            self::create_baseline_for_monitor( $monitor );
        } else {
            self::run_regression_for_monitor( $monitor );
        }

        // Clear the run-in-progress marker + monitor transient caches.
        delete_transient( 'qaproof_run_q_' . md5( (string) $monitor_id ) );
        delete_transient( 'qaproof_mon_'   . md5( (string) $monitor_id ) );
        delete_transient( 'qaproof_mon_list' );
    }

    /**
     * Save a monitor result with retries. Transient 5xx/timeouts otherwise
     * leave the monitor stuck in "Running" indefinitely.
     */
    private static function save_result_with_retry( $monitor_id, $data, $attempts = 3 ) {
        $last_error = null;
        for ( $i = 0; $i < $attempts; $i++ ) {
            $result = QAProof_API_Client::monitors_save_result( $monitor_id, $data );
            if ( ! is_wp_error( $result ) ) {
                return $result;
            }
            $last_error = $result;
            if ( $i < $attempts - 1 ) {
                // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions, WordPressVIPMinimum.Functions.RestrictedFunctions.sleep_sleep -- short retry backoff inside isolated wp-cron worker.
                sleep( 2 );
            }
        }
        qaproof_debug_log( '[QAProof] monitors_save_result failed after ' . $attempts . ' attempts for monitor ' . $monitor_id . ': ' . $last_error->get_error_message() );
        return $last_error;
    }

    private static function create_baseline_for_monitor( $monitor ) {
        $result = QAProof_API_Client::create_baseline( $monitor['page_url'] );

        // Retry once on CAPTURE_UNSTABLE — structural image-load failures will
        // recur on every regression run anyway, so they won't produce false diffs.
        if ( is_wp_error( $result ) ) {
            $error_data = $result->get_error_data( 'qaproof_api_error' );
            $is_unstable = isset( $error_data['error_code'] ) && $error_data['error_code'] === 'CAPTURE_UNSTABLE';

            if ( $is_unstable ) {
                $result = QAProof_API_Client::create_baseline( $monitor['page_url'], true );
            }

            if ( is_wp_error( $result ) ) {
                self::save_result_with_retry( $monitor['id'], array(
                    'status'        => 'failed',
                    'error_message' => $result->get_error_message(),
                ) );
                return;
            }
        }

        QAProof_API_Client::monitors_update( $monitor['id'], array(
            'baseline_key' => $result['key'],
            'has_baseline' => 1,
            'last_run_at'  => gmdate( 'c' ),
        ) );
    }

    private static function run_regression_for_monitor( $monitor ) {
        $job_response = QAProof_API_Client::run_test( array(
            'pageUrl'  => $monitor['page_url'],
            'testType' => 'regression',
        ) );

        if ( is_wp_error( $job_response ) ) {
            self::save_result_with_retry( $monitor['id'], array(
                'status'        => 'failed',
                'error_message' => $job_response->get_error_message(),
            ) );
            QAProof_API_Client::monitors_update( $monitor['id'], array(
                'last_run_at' => gmdate( 'c' ),
            ) );
            return;
        }

        $job_id = isset( $job_response['jobId'] ) ? $job_response['jobId'] : null;
        if ( empty( $job_id ) ) {
            self::save_result_with_retry( $monitor['id'], array(
                'status'        => 'failed',
                'error_message' => 'API did not return a job ID.',
            ) );
            QAProof_API_Client::monitors_update( $monitor['id'], array(
                'last_run_at' => gmdate( 'c' ),
            ) );
            return;
        }

        // Max 8 min (48 × 10s). The API's job timeout is 5 min; this gives a 3 min buffer.
        $max_attempts = 48;
        $result = null;

        for ( $i = 0; $i < $max_attempts; $i++ ) {
            // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions, WordPressVIPMinimum.Functions.RestrictedFunctions.sleep_sleep -- isolated wp-cron worker, no user request blocked.
            sleep( 10 );

            $poll = QAProof_API_Client::poll_job( $job_id );

            if ( is_wp_error( $poll ) ) {
                continue;
            }

            if ( isset( $poll['status'] ) && $poll['status'] === 'done' && isset( $poll['result'] ) ) {
                $result = $poll['result'];
                // Screenshots are fetched in a separate background cron so the
                // result row is saved immediately and the browser sees completion
                // without waiting for the slow server-to-server screenshot download.
                break;
            }

            if ( isset( $poll['status'] ) && $poll['status'] === 'failed' ) {
                self::save_result_with_retry( $monitor['id'], array(
                    'status'        => 'failed',
                    'error_message' => isset( $poll['error'] ) ? $poll['error'] : 'Test failed on the server.',
                ) );
                QAProof_API_Client::monitors_update( $monitor['id'], array(
                    'last_run_at' => gmdate( 'c' ),
                ) );
                return;
            }
        }

        if ( $result === null ) {
            self::save_result_with_retry( $monitor['id'], array(
                'status'        => 'failed',
                'error_message' => 'Test timed out after 8 minutes.',
            ) );
            QAProof_API_Client::monitors_update( $monitor['id'], array(
                'last_run_at' => gmdate( 'c' ),
            ) );
            return;
        }

        $score       = isset( $result['score'] )      ? (int) $result['score']   : null;
        $has_changes = ! empty( $result['hasChanges'] );

        // Save the result row first (without screenshots — the monitors save
        // endpoint caps at 5 MB), then patch screenshots onto it via the
        // dedicated 10 MB endpoint. Both happen inline in this cron worker so
        // the saved result is complete; no second background event is queued.
        $saved = self::save_result_with_retry( $monitor['id'], array(
            'score'           => $score,
            'has_changes'     => $has_changes ? 1 : 0,
            'summary'         => isset( $result['summary'] )         ? $result['summary']         : null,
            'categories'      => isset( $result['categories'] )      ? $result['categories']      : null,
            'differences'     => isset( $result['differences'] )     ? $result['differences']     : null,
            'recommendations' => isset( $result['recommendations'] ) ? $result['recommendations'] : null,
            'status'          => 'completed',
        ) );

        $result_id = is_array( $saved ) && isset( $saved['id'] ) ? $saved['id'] : null;
        if ( $result_id && ! empty( $job_id ) ) {
            $shots = QAProof_API_Client::get_job_screenshots( $job_id );
            if ( ! is_wp_error( $shots ) && ! empty( $shots['screenshots'] ) ) {
                QAProof_API_Client::monitors_update_result_screenshots( $result_id, $shots['screenshots'] );
            }
        }

        QAProof_API_Client::monitors_update( $monitor['id'], array(
            'last_run_at' => gmdate( 'c' ),
            'last_score'  => $score,
        ) );

        $notify_on       = isset( $monitor['notify_on'] ) ? $monitor['notify_on'] : 'failures';
        $below_threshold = $score !== null && $score < (int) $monitor['threshold_score'];

        if ( $notify_on === 'all' || ( $notify_on === 'failures' && $below_threshold ) ) {
            QAProof_Notifications::notify( $monitor, $result );
        }
    }
}
