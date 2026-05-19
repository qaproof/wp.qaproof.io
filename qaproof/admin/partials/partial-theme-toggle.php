<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<?php
// FOUC-prevention: apply dark theme before paint. Inline because it must run
// before the rest of the body is committed by the browser.
wp_print_inline_script_tag(
    "(function(){var t=localStorage.getItem('qaproof_theme');if(t==='dark'){var a=document.getElementById('qaproof-app');if(a)a.classList.add('qaproof-dark');document.body.classList.add('qaproof-dark-page');}})();"
);
?>
<button type="button" class="qaproof-theme-toggle" id="qaproof-theme-toggle" title="<?php esc_attr_e( 'Toggle dark/light theme', 'qaproof' ); ?>">
    <svg class="qaproof-theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg class="qaproof-theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
</button>
