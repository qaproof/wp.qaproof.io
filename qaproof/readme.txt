=== AI QAProof ===
Contributors: qaproof
Tags: design qa, responsive, accessibility, visual regression, wcag
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 8.0
Stable tag: 1.0.30
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Your site looked perfect at launch. Does it still? AI-powered visual QA for WordPress — 5 test types, results in minutes.

== Description ==

**Your site looked perfect when you launched it. Does it still?**

AI-powered visual quality assurance for WordPress. 5 test types. One plugin. Results in minutes.

**Watch QAProof in action:**

https://youtu.be/I3ZUg2rDA7w

Full walkthrough — from connecting your Figma account and picking a design to sending a finished PDF report to your client.

= What is QAProof? =

After every plugin update, deployment, or content change, something can silently break. A shifted layout. A missing button. A page that falls apart on mobile. **Your users notice before you do.**

**QAProof catches it first.** It renders your live pages in a real browser, runs **AI-powered visual analysis**, and returns a detailed report with a quality score, a breakdown of every issue, and **ready-to-paste CSS fix recommendations** — all in minutes.

Available as a **WordPress plugin** with a clean admin interface — **no technical skills required.**

= Five test types. Everything your site needs. =

QAProof covers every aspect of visual quality that teams typically check manually — or skip entirely.

**Design Fidelity**

**Does the live site actually match the design?**

**The situation:** "I sent the mockup to the developer and the result looks nothing like it. I spend hours comparing elements by eye — and still miss things."

**What you get:** Connect your Figma account and pick a design — QAProof compares it against your live page. Every layout shift, color mismatch, typography difference, and spacing issue is flagged with its exact location and a copy-paste CSS fix.

**Responsive Testing**

**Does your site hold together on every screen size?**

**The situation:** "Everything looks fine on my phone. Then a client calls from their iPad and says half the page is broken."

**What you get:** Your page is tested at five viewports — desktop, tablet (portrait and landscape) and mobile (portrait and landscape). The AI identifies overflow, broken stacks, illegible text, and layout failures across all five viewports — **not just the device you happened to check.**

**Accessibility Audit (WCAG 2.1)**

**Is your site usable by everyone?**

**The situation:** "We got a complaint that our site is unusable for people with visual impairments. We had no idea where to even start."

**What you get:** **Full compliance check at Level A, AA, or AAA.** Color contrast, keyboard navigation, heading structure, form labels, touch targets — every violation is listed with the specific WCAG criterion it breaks and a clear recommendation to fix it.

**Visual Regression Monitoring**

**Did the last update break something you haven't noticed yet?**

**The situation:** "After a plugin update, the header shifted and a button disappeared. We only found out a week later — when a client complained."

**What you get:** Set a baseline screenshot of any page. QAProof re-checks it on your schedule (daily, weekly or monthly) and emails you when the score drops below your threshold. **Catch broken deploys in hours, not weeks.**

**Design Audit (Design Debt Score)**

**How consistent is your design system — really?**

**The situation:** "Our site uses 47 shades of gray and 12 different font sizes. There's a design system, but nobody follows it. And we have no way to measure how bad it's gotten."

**What you get:** QAProof reads your live design tokens directly from the DOM — colors, fonts, spacing, CSS variables — and grades your design system's internal consistency on a score from 0 to 100. 0 is ideal. See exactly **where the drift started.**

= Who uses QAProof? =

QAProof works equally well for non-technical site owners and experienced development teams.

* **Agencies & studios** — replace 2–4 hours of manual pre-delivery QA with an automated report that takes a few minutes. Send clients a PDF report with a verification seal at every handoff.
* **Freelancers** — prove your work matches the design with objective data. A score is more convincing than "trust me."
* **In-house teams** — set up monitors on your key pages and get alerted the moment a deploy breaks something.
* **WordPress site owners** — no code, no complexity. Install the plugin, add your API key, run your first test. That's it.
* **QA engineers** — help identify, reproduce, and investigate issues quickly, making the development process faster and more reliable.
* **Designers** — see exactly where your design was implemented incorrectly, and hand developers the precise CSS they need to fix it.

= Up and running in minutes =

**For WordPress users:**

* Install the QAProof plugin from your WordPress admin panel.
* Enter your API key in Settings.
* Enter a page URL (and, for Design Fidelity, pick a design from your connected Figma account).
* **Click "Run Test" — your full report is ready in a few minutes (typically 1–5).**
* Set up a monitor — QAProof will check the page on schedule and alert you if anything changes.

= What you get in every report =

* **An overall quality score** from 0 to 100 — clear, communicable, and objective.
* **Category-by-category breakdown** with visual charts.
* **Every issue listed with its exact location** on the page.
* **Ready-to-paste CSS fix recommendations** — not "something looks off" but "add margin-top: 16px to .header-nav".
* **PDF reports with a verification seal** — ready to send to your client in one click.
* **Email reports** — send directly from the interface without downloading.
* **WCAG level selector (A / AA / AAA)** — adjust audit strictness to match your requirements.
* **Saved designs** — save a Figma design once, reuse it across all future tests.

= Why choose QAProof over separate tools? =

The market has tools for design comparison. Separate tools for regression. Separate tools for accessibility. **QAProof combines all five in one platform.**

*  Design vs. live page comparison
*  Figma tool support
*  Responsive testing across 5 viewports
*  WCAG accessibility audit — Level A, AA, AAA
*  Visual regression monitoring
*  Design Debt Score
*  WordPress plugin with built-in admin UI
*  Scheduled automatic monitoring
*  PDF reports with verification seal
*  AI-generated CSS fix recommendations

== Frequently Asked Questions ==

= Is QAProof free? =

The WordPress plugin is **free and open-source** (GPL-2.0+). The QAProof service has a **Free plan** that includes 10 AI generations as a one-time trial (they do not reset monthly), 1 monitor, and 7 days of test history. Paid plans (Pro, Business, Scale) add more generations, monitors and history. Full pricing at [qaproof.io/pricing](https://qaproof.io/pricing).

= Do I need a Figma account? =

Only for Design Fidelity (Figma vs live page). Responsive, Accessibility, Design Audit and Visual Regression need just a URL.

= What information does QAProof send when I run a test? =

Only what you explicitly submit: the **URL of the page** you want to test and, for Design Fidelity, the **Figma design link**. QAProof never reads your post content, user accounts, visitor data, passwords, or any other information from your site.

= Where are my test results stored? =

Results are stored securely in your **QAProof account**, scoped to your workspace. The plugin itself stores only your settings (API key, saved designs as name + Figma link, notification and test preferences). Test results are not saved to your WordPress database.

= How long does a test take? =

Most tests finish in a few minutes (typically 1–5). **Design Fidelity:** 1–3 minutes. **Responsive Testing:** 2–4 minutes (5 viewports). **Accessibility Audit:** 2–5 minutes. **Design Audit:** 1–3 minutes.

= Does the plugin work on WordPress Multisite? =

Yes. The plugin can be network-activated, and each site in the network manages its own settings and API key independently. Note that test history lives in the QAProof account behind the API key — sites that share one API key share one test history.

= What happens if I enter a wrong API key? =

The API rejects it and the plugin shows an error; no test runs until you enter a valid key. You can update your key at any time.

== Installation ==

1. Install the plugin from the WordPress plugin directory (or upload the ZIP via Plugins → Add New → Upload).
2. Activate it — a **QAProof** menu appears in your admin sidebar.
3. Create a free account at [qaproof.io/signup](https://qaproof.io/signup) and copy your API key from the dashboard (API Keys page).
4. Paste the key in **QAProof → Settings** and save.
5. Open **QAProof → Tests**, enter any page URL, and run your first test — results arrive in a few minutes (typically 1–5).

== Changelog ==

= 1.0.31 =
* Compatibility confirmed with WordPress 7.1.
* Responsive Test is now the default test type — it needs only a URL, no design file.
* Quota and limit errors now show a working upgrade/verify link instead of a generic error.
* Added a "Create a free QAProof account" link to Settings for new installs.
* Dashboard "Upgrade Plan" now opens your QAProof billing page.

= 1.0.30 =
* Fidelity audit improvements and stability fixes.

= 1.0.29 =
* Report fidelity improvements across all five test types.

== Start for Free Today ==

Install the plugin on WordPress or get your API key at [qaproof.io](https://qaproof.io) — and run your first test in minutes.