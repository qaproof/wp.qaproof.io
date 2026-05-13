=== QAProof ===
Contributors: qaproof
Tags: design, qa, figma, responsive, ui, ux, testing, ai
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automated design fidelity and responsive testing powered by AI. Compare live pages against Figma designs.

== Description ==

QAProof uses Claude Vision AI to automatically compare your live WordPress pages against Figma design mockups, identifying visual differences in layout, colors, typography, spacing, and component styling.

**Features:**

* **Design Fidelity Testing** - Compare live pages against Figma designs or uploaded screenshots
* **Responsive Testing** - Analyze how pages adapt across desktop, tablet, and mobile viewports
* **AI-Powered Analysis** - Get detailed, actionable reports with severity-rated differences
* **Visual Markers** - Interactive markers on screenshots pinpointing each difference
* **Category Scoring** - Scores for layout, colors, typography, spacing, and components

== Installation ==

1. Upload the `qaproof` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to QAProof > Settings and enter your API key and endpoint
4. Navigate to QAProof to start testing

== Frequently Asked Questions ==

= Do I need a Figma account? =

For design fidelity tests using Figma URLs, yes. Alternatively, you can upload a design screenshot directly.

= What AI model does this use? =

The service uses Anthropic's Claude Vision API for image analysis.

= How long does a test take? =

A fidelity test typically takes 15-30 seconds. A responsive test (3 viewports) takes 1-2 minutes.

== Changelog ==

= 1.0.0 =
* Initial release
* Design fidelity comparison
* Responsive behavior analysis
* Figma URL and image upload support
