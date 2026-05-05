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

    /**
     * Initialize cron hooks.
     */
    public static function init() {
        add_action( self::DAILY_HOOK, array( __CLASS__, 'run_daily' ) );
        add_action( self::WEEKLY_HOOK, array( __CLASS__, 'run_weekly' ) );
        add_action( self::MONTHLY_HOOK, array( __CLASS__, 'run_monthly' ) );
        add_action( self::RUN_HOOK, array( __CLASS__, 'run_single_monitor' ), 10, 1 );

        // Reschedule crons whenever the preferred hour option is saved.
        add_action( 'update_option_qaproof_cron_hour', array( __CLASS__, 'reschedule_events' ) );

        // Fix WP-Cron for Docker: site_url() uses host:port (e.g. localhost:8080)
        // which is the Docker host mapping, unreachable from inside the container.
        // Strip the port so wp-cron.php is requested on port 80 (Apache's internal port).
        add_filter( 'cron_request', array( __CLASS__, 'fix_cron_url_for_docker' ) );
    }

    /**
     * When running inside Docker, the site URL may include the host-mapped port
     * (e.g. localhost:8080) which is unreachable from within the container.
     * This filter rewrites the cron request URL to use port 80 so spawn_cron()
     * can reach wp-cron.php via the container's internal Apache listener.
     *
     * Only applies when the host is 'localhost' and a non-80/443 port is present.
     *
     * @param array $cron_request {url, key, args}
     * @return array
     */
    public static function fix_cron_url_for_docker( $cron_request ) {
        $url    = isset( $cron_request['url'] ) ? $cron_request['url'] : '';
        $parsed = wp_parse_url( $url );

        $host = isset( $parsed['host'] ) ? $parsed['host'] : '';
        $port = isset( $parsed['port'] ) ? (int) $parsed['port'] : 0;

        // Only touch localhost with a non-standard port — leave production URLs alone.
        if ( 'localhost' === $host && $port > 0 && $port !== 80 && $port !== 443 ) {
            // Rebuild URL without the port (defaults to port 80 for http).
            $cron_request['url'] = str_replace(
                $host . ':' . $port,
                $host,
                $url
            );
        }

        return $cron_request;
    }

    /**
     * Returns the UTC timestamp of the next occurrence of $hour (0-23)
     * in the site's configured timezone.
     *
     * @param int $hour 0–23
     * @return int UTC timestamp
     */
    private static function next_occurrence_of_hour( $hour ) {
        $hour = max( 0, min( 23, (int) $hour ) );

        try {
            $tz         = wp_timezone();
            $now        = new DateTime( 'now', $tz );
            $target     = clone $now;
            $target->setTime( $hour, 0, 0 );

            // If the target time has already passed today, schedule for tomorrow.
            if ( $target <= $now ) {
                $target->modify( '+1 day' );
            }

            return $target->getTimestamp(); // UTC
        } catch ( Exception $e ) {
            // Fallback: round up to next whole hour boundary.
            $now_ts = time();
            $secs_past_hour = $now_ts % HOUR_IN_SECONDS;
            return $now_ts - $secs_past_hour + HOUR_IN_SECONDS + $hour * 3600;
        }
    }

    /**
     * Schedule recurring cron events at the user-configured hour.
     * Called on plugin activation and when the cron hour setting changes.
     */
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

    /**
     * Reschedule all recurring cron events at the new preferred hour.
     * Called automatically when qaproof_cron_hour option is updated.
     */
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

    /**
     * Remove all scheduled events.
     * Called on plugin deactivation.
     */
    public static function unschedule_events() {
        wp_clear_scheduled_hook( self::DAILY_HOOK );
        wp_clear_scheduled_hook( self::WEEKLY_HOOK );
        wp_clear_scheduled_hook( self::MONTHLY_HOOK );
        wp_clear_scheduled_hook( self::RUN_HOOK );
    }

    /**
     * Run all daily monitors.
     */
    public static function run_daily() {
        self::dispatch_monitors( 'daily' );
    }

    /**
     * Run all weekly monitors.
     */
    public static function run_weekly() {
        self::dispatch_monitors( 'weekly' );
    }

    /**
     * Run all monthly monitors.
     */
    public static function run_monthly() {
        self::dispatch_monitors( 'monthly' );
    }

    /**
     * Dispatch each monitor as a separate single event to prevent timeouts.
     *
     * @param string $schedule 'daily', 'weekly', or 'monthly'.
     */
    private static function dispatch_monitors( $schedule ) {
        $monitors = QAProof_Monitor::get_due( $schedule );

        // Stagger events by 120 seconds each so they run sequentially.
        // Each regression test takes ~60 s; 120 s gap ensures the previous
        // job finishes and the doing_cron lock is released before the next fires.
        $delay = 5;
        foreach ( $monitors as $monitor ) {
            wp_schedule_single_event(
                time() + $delay,
                self::RUN_HOOK,
                array( (int) $monitor['id'] )
            );
            $delay += 120;
        }
    }

    /**
     * Execute a single monitor: create baseline or run regression test.
     *
     * @param int $monitor_id
     */
    public static function run_single_monitor( $monitor_id ) {
        // Extend PHP execution limit so polling loop (up to 5 min) and
        // baseline creation (60–90 s screenshot) don't hit max_execution_time.
        // 0 = unlimited; capped at 360 s as a safety net.
        @set_time_limit( 360 );

        $monitor = QAProof_Monitor::get( $monitor_id );
        if ( ! $monitor || ! $monitor['is_enabled'] ) {
            return;
        }

        // First run: create baseline
        if ( ! $monitor['has_baseline'] ) {
            self::create_baseline_for_monitor( $monitor );
            return;
        }

        // Subsequent runs: regression test
        self::run_regression_for_monitor( $monitor );
    }

    /**
     * Create a baseline for a monitor via the API.
     *
     * @param array $monitor
     */
    private static function create_baseline_for_monitor( $monitor ) {
        $result = QAProof_API_Client::create_baseline( $monitor['page_url'] );

        if ( is_wp_error( $result ) ) {
            QAProof_Result::create( array(
                'monitor_id'    => $monitor['id'],
                'status'        => 'failed',
                'error_message' => $result->get_error_message(),
            ) );
            return;
        }

        QAProof_Monitor::update( $monitor['id'], array(
            'baseline_key' => $result['key'],
            'has_baseline'  => 1,
            'last_run_at'   => current_time( 'mysql' ),
        ) );
    }

    /**
     * Run a regression test for a monitor via the API.
     *
     * @param array $monitor
     */
    private static function run_regression_for_monitor( $monitor ) {
        // Step 1: Submit test job (returns jobId immediately)
        $job_response = QAProof_API_Client::run_test( array(
            'pageUrl'  => $monitor['page_url'],
            'testType' => 'regression',
        ) );

        if ( is_wp_error( $job_response ) ) {
            QAProof_Result::create( array(
                'monitor_id'    => $monitor['id'],
                'status'        => 'failed',
                'error_message' => $job_response->get_error_message(),
            ) );

            QAProof_Monitor::update( $monitor['id'], array(
                'last_run_at' => current_time( 'mysql' ),
            ) );
            return;
        }

        $job_id = isset( $job_response['jobId'] ) ? $job_response['jobId'] : null;
        if ( empty( $job_id ) ) {
            QAProof_Result::create( array(
                'monitor_id'    => $monitor['id'],
                'status'        => 'failed',
                'error_message' => 'API did not return a job ID.',
            ) );
            return;
        }

        // Step 2: Poll for results (max 5 minutes, every 10 seconds)
        $max_attempts = 30;
        $result = null;

        for ( $i = 0; $i < $max_attempts; $i++ ) {
            sleep( 10 );

            $poll = QAProof_API_Client::poll_job( $job_id );

            if ( is_wp_error( $poll ) ) {
                continue; // Transient error — retry
            }

            if ( isset( $poll['status'] ) && $poll['status'] === 'done' && isset( $poll['result'] ) ) {
                $result = $poll['result'];

                // Fetch screenshots separately — the poll endpoint strips them to keep responses small.
                // get_job_screenshots() calls GET /api/jobs/:id/screenshots which returns the full base64 data.
                $screenshots_response = QAProof_API_Client::get_job_screenshots( $job_id );
                if ( ! is_wp_error( $screenshots_response ) && ! empty( $screenshots_response['screenshots'] ) ) {
                    $result['screenshots'] = $screenshots_response['screenshots'];
                }

                break;
            }

            if ( isset( $poll['status'] ) && $poll['status'] === 'failed' ) {
                QAProof_Result::create( array(
                    'monitor_id'    => $monitor['id'],
                    'status'        => 'failed',
                    'error_message' => isset( $poll['error'] ) ? $poll['error'] : 'Test failed on the server.',
                ) );

                QAProof_Monitor::update( $monitor['id'], array(
                    'last_run_at' => current_time( 'mysql' ),
                ) );
                return;
            }
        }

        if ( $result === null ) {
            QAProof_Result::create( array(
                'monitor_id'    => $monitor['id'],
                'status'        => 'failed',
                'error_message' => 'Test timed out after 5 minutes.',
            ) );

            QAProof_Monitor::update( $monitor['id'], array(
                'last_run_at' => current_time( 'mysql' ),
            ) );
            return;
        }

        $score = isset( $result['score'] ) ? (int) $result['score'] : null;
        $has_changes = ! empty( $result['hasChanges'] );

        // Store the result
        QAProof_Result::create( array(
            'monitor_id'      => $monitor['id'],
            'score'           => $score,
            'has_changes'     => $has_changes ? 1 : 0,
            'summary'         => isset( $result['summary'] ) ? $result['summary'] : null,
            'categories'      => isset( $result['categories'] ) ? $result['categories'] : null,
            'differences'     => isset( $result['differences'] ) ? $result['differences'] : null,
            'recommendations' => isset( $result['recommendations'] ) ? $result['recommendations'] : null,
            'screenshots'     => isset( $result['screenshots'] ) ? $result['screenshots'] : null,
            'status'          => 'completed',
        ) );

        QAProof_Monitor::update( $monitor['id'], array(
            'last_run_at' => current_time( 'mysql' ),
            'last_score'  => $score,
        ) );

        // Send notifications based on the monitor's notify_on setting:
        //   'failures' (default) — only when score drops below threshold
        //   'all'               — after every completed run
        $notify_on = isset( $monitor['notify_on'] ) ? $monitor['notify_on'] : 'failures';
        $below_threshold = $score !== null && $score < (int) $monitor['threshold_score'];

        if ( $notify_on === 'all' || ( $notify_on === 'failures' && $below_threshold ) ) {
            QAProof_Notifications::notify( $monitor, $result );
        }
    }
}
