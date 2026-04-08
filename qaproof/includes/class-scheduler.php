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
    }

    /**
     * Schedule recurring cron events.
     * Called on plugin activation.
     */
    public static function schedule_events() {
        if ( ! wp_next_scheduled( self::DAILY_HOOK ) ) {
            wp_schedule_event( time(), 'daily', self::DAILY_HOOK );
        }
        if ( ! wp_next_scheduled( self::WEEKLY_HOOK ) ) {
            wp_schedule_event( time(), 'weekly', self::WEEKLY_HOOK );
        }
        if ( ! wp_next_scheduled( self::MONTHLY_HOOK ) ) {
            wp_schedule_event( time(), 'monthly', self::MONTHLY_HOOK );
        }
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

        foreach ( $monitors as $monitor ) {
            // Schedule each monitor run as a separate single event
            wp_schedule_single_event(
                time() + 5, // small delay to avoid simultaneous requests
                self::RUN_HOOK,
                array( (int) $monitor['id'] )
            );
        }
    }

    /**
     * Execute a single monitor: create baseline or run regression test.
     *
     * @param int $monitor_id
     */
    public static function run_single_monitor( $monitor_id ) {
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

        // Send notifications if score is below threshold
        if ( $score !== null && $score < (int) $monitor['threshold_score'] ) {
            QAProof_Notifications::notify( $monitor, $result );
        }
    }
}
