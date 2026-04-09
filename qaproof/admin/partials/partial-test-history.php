<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Test history section partial.
 *
 * Expected variables:
 *   $prefix  (string) Unique prefix for element IDs (e.g. 'a11y').
 *   $filters (array)  Optional filter tabs.
 *   $inline  (bool)   If true, renders without collapsible wrapper.
 */

$id = function ( $suffix ) use ( $prefix ) {
    return 'qaproof-' . $prefix . '-history-' . $suffix;
};
?>
<div id="<?php echo esc_attr( $id( 'section' ) ); ?>" class="qaproof-history-section<?php echo $inline ? ' qaproof-history-inline' : ' is-collapsed'; ?>">
    <?php if ( ! $inline ) : ?>
    <div class="qaproof-history-header">
        <h2>
            <span class="dashicons dashicons-backup"></span>
            <?php esc_html_e( 'Test History', 'qaproof' ); ?>
        </h2>
        <button type="button" id="<?php echo esc_attr( $id( 'toggle' ) ); ?>" class="button button-small">
            <span class="dashicons dashicons-arrow-down-alt2"></span>
        </button>
    </div>
    <?php endif; ?>
    <div id="<?php echo esc_attr( $id( 'content' ) ); ?>" class="qaproof-history-content">
        <?php if ( ! empty( $filters ) ) : ?>
            <div class="qaproof-history-filters" id="<?php echo esc_attr( $id( 'filters' ) ); ?>">
                <?php foreach ( $filters as $f ) : ?>
                    <button type="button" class="qaproof-filter-btn<?php echo empty( $f['type'] ) ? ' active' : ''; ?>"
                            data-type="<?php echo esc_attr( $f['type'] ); ?>">
                        <?php echo esc_html( $f['label'] ); ?>
                    </button>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
        <div id="<?php echo esc_attr( $id( 'list' ) ); ?>"></div>
        <div id="<?php echo esc_attr( $id( 'loading' ) ); ?>" class="qaproof-history-loading-state hidden">
            <span class="qaproof-spinner"></span> <?php esc_html_e( 'Loading...', 'qaproof' ); ?>
        </div>
        <div id="<?php echo esc_attr( $id( 'empty' ) ); ?>" class="qaproof-history-empty-state hidden">
            <span class="dashicons dashicons-clock"></span>
            <?php esc_html_e( 'No test history yet. Run a test to see results here.', 'qaproof' ); ?>
        </div>
        <div class="qaproof-history-load-more-wrap">
            <button type="button" id="<?php echo esc_attr( $id( 'load-more' ) ); ?>" class="button hidden">
                <?php esc_html_e( 'Load More', 'qaproof' ); ?>
            </button>
        </div>
    </div>
</div>
