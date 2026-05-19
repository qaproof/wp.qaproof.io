<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Test history section partial.
 *
 * Expected variables:
 *   $qaproof_prefix  (string) Unique prefix for element IDs (e.g. 'a11y').
 *   $qaproof_filters (array)  Optional filter tabs.
 *   $qaproof_inline  (bool)   If true, renders without collapsible wrapper.
 */

$qaproof_id = function ( $suffix ) use ( $qaproof_prefix ) {
    return 'qaproof-' . $qaproof_prefix . '-history-' . $suffix;
};
?>
<div id="<?php echo esc_attr( $qaproof_id( 'section' ) ); ?>" class="qaproof-history-section<?php echo esc_attr( $qaproof_inline ? ' qaproof-history-inline' : ' is-collapsed' ); ?>">
    <?php if ( ! $qaproof_inline ) : ?>
    <div class="qaproof-history-header">
        <h2>
            <span class="dashicons dashicons-backup"></span>
            <?php esc_html_e( 'Test History', 'qaproof' ); ?>
        </h2>
        <button type="button" id="<?php echo esc_attr( $qaproof_id( 'toggle' ) ); ?>" class="button button-small">
            <span class="dashicons dashicons-arrow-down-alt2"></span>
        </button>
    </div>
    <?php endif; ?>
    <div id="<?php echo esc_attr( $qaproof_id( 'content' ) ); ?>" class="qaproof-history-content">
        <?php if ( ! empty( $qaproof_filters ) ) : ?>
            <div class="qaproof-history-filters" id="<?php echo esc_attr( $qaproof_id( 'filters' ) ); ?>">
                <?php foreach ( $qaproof_filters as $qaproof_filter ) : ?>
                    <button type="button" class="qaproof-filter-btn<?php echo esc_attr( empty( $qaproof_filter['type'] ) ? ' active' : '' ); ?>"
                            data-type="<?php echo esc_attr( $qaproof_filter['type'] ); ?>">
                        <?php echo esc_html( $qaproof_filter['label'] ); ?>
                    </button>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
        <div id="<?php echo esc_attr( $qaproof_id( 'list' ) ); ?>"></div>
        <div id="<?php echo esc_attr( $qaproof_id( 'loading' ) ); ?>" class="qaproof-history-loading-state hidden">
            <span class="qaproof-spinner"></span> <?php esc_html_e( 'Loading...', 'qaproof' ); ?>
        </div>
        <div id="<?php echo esc_attr( $qaproof_id( 'empty' ) ); ?>" class="qaproof-history-empty-state hidden">
            <span class="dashicons dashicons-clock"></span>
            <?php esc_html_e( 'No test history yet. Run a test to see results here.', 'qaproof' ); ?>
        </div>
        <div class="qaproof-history-load-more-wrap">
            <button type="button" id="<?php echo esc_attr( $qaproof_id( 'load-more' ) ); ?>" class="button hidden">
                <?php esc_html_e( 'Load More', 'qaproof' ); ?>
            </button>
        </div>
    </div>
</div>
