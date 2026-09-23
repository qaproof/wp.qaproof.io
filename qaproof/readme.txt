=== Accessibility Checker – WCAG 2.1 AA, EAA & Section 508 Site Audit – QAProof ===
Contributors: qaproof
Tags: accessibility, wcag, accessibility checker, a11y, eaa
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 8.0
Stable tag: 1.0.42
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Free WCAG 2.1 AA accessibility checker. Scan one page or your whole site, and see what changed since last time. No account for the first check.

== Description ==

**Find out where your site fails WCAG — before anyone else does.**

Install the plugin, click one button, and QAProof loads your home page in a real
browser and checks it against **WCAG 2.1 Level AA**. You get a score and the
issues it found straight away. **No account, no API key, nothing to configure
for that first check.**

It is an accessibility scanner, not an overlay or a toolbar: it changes nothing
on your site and shows nothing to your visitors. It finds a11y defects and tells
you where they are, so you or your developer can fix them properly — the
approach the accessibility community asks for, and the one that stands up when
someone checks your work against WCAG, EN 301 549, the European Accessibility
Act (EAA) or Section 508.

= What it checks =

QAProof runs the checks that can be made automatically, and tells you exactly
where each one failed:

* **Colour contrast** (color contrast) — text and UI borders measured against the 4.5:1 and 3:1 thresholds, with the computed colours it used.
* **Images without alt text** — and alt text that is a file name, a placeholder word, or far too long.
* **Form fields without labels** — including fields whose only label is a placeholder, which disappears as soon as someone types.
* **Keyboard focus** — controls with `outline: none` and no visible focus style, which strand keyboard users.
* **Heading structure** — skipped levels, empty headings, more than one H1.
* **ARIA** — invalid roles and roles missing the attributes they cannot work without.
* **Landmarks** — content sitting outside any navigable region.
* **Touch targets** — controls below the 24×24px minimum.
* **Page language** — a missing or malformed `lang` attribute, which decides how a screen reader pronounces your page.

Every finding names the **WCAG success criterion** it relates to, the **exact
element** (CSS selector and a snippet of the source) and what was measured —
the actual contrast ratio, the actual size — so you can check it yourself
rather than take our word for it.

= An honest word about "compliance" =

Automated checks find a meaningful share of accessibility problems, and they
find them in minutes. They **cannot** tell you that a site is compliant.

No automated tool can judge whether your alt text is *meaningful*, whether your
tab order makes sense, or whether a screen reader user can actually complete
your checkout. Standards like **EN 301 549**, the **European Accessibility
Act**, **Section 508** and Italy's **AgID** guidelines all expect manual
testing with a keyboard and a screen reader.

Use this to find what can be found quickly, to measure whether you are getting
better, and to hand a developer a precise list. Do not use it as a compliance
certificate — and be sceptical of any tool that offers you one.

= Check the whole site, not one page =

**Site Audit** finds your pages from your sitemap and checks every one of them,
then does the thing a page-by-page list cannot: it groups the findings.

On a WordPress site most defects live in a template, so the same problem
appears on every page that uses it. Instead of reporting it forty times, Site
Audit says **"this one fix covers 38 pages"** — and sorts the list so the
fix with the widest reach is at the top.

Run it again after the work is done and you get the other half: **what changed
since last time.** How many issues were resolved, which ones, on which pages,
and anything new that appeared. That is the part you can show a client.

Coverage is always stated plainly — how many pages were checked out of how many
were found, and which ones could not be loaded. A page behind a bot wall or one
that times out is reported as exactly that, and never counted as passing.

How many pages one run checks depends on your plan: **5 on the free plan**, 50
on Pro, 150 on Business. The report always says how many it found so you can
see what was left out. When a run finishes, a copy of the report is emailed to
the address on your account.

= Beyond accessibility =

The same plugin also covers the visual side of QA, if you need it:

**Design Fidelity**

**Does the live site actually match the design?**

**The situation:** "I sent the mockup to the developer and the result looks nothing like it. I spend hours comparing elements by eye — and still miss things."

**What you get:** Connect your Figma account and pick a design — QAProof compares it against your live page. Every layout shift, color mismatch, typography difference, and spacing issue is flagged with its exact location and a copy-paste CSS fix.

**Responsive Testing**

**Does your site hold together on every screen size?**

**The situation:** "Everything looks fine on my phone. Then a client calls from their iPad and says half the page is broken."

**What you get:** Your page is tested at five viewports — desktop, tablet (portrait and landscape) and mobile (portrait and landscape). The AI identifies overflow, broken stacks, illegible text, and layout failures across all five viewports — **not just the device you happened to check.**

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

* **Agencies & studios** — audit a client site in minutes instead of an afternoon, and hand over a PDF that names the WCAG criterion and the element for each finding.
* **Public-sector sites** — councils, schools and agencies working to EN 301 549, the European Accessibility Act or AgID: find what is findable automatically, then put your manual testing time where it counts.
* **Freelancers** — prove your work matches the design with objective data. A score is more convincing than "trust me."
* **In-house teams** — set up monitors on your key pages and get alerted the moment a deploy breaks something.
* **WordPress site owners** — no code, no complexity. Install the plugin and click one button.
* **QA engineers** — help identify, reproduce, and investigate issues quickly, making the development process faster and more reliable.
* **Designers** — see exactly where your design was implemented incorrectly, and hand developers the precise CSS they need to fix it.

= Getting started =

**Your first check needs nothing but the plugin:**

* Install and activate QAProof.
* Open the **QAProof** menu and click **Check my site**.
* A real WCAG 2.1 AA check of your home page runs — usually 1–2 minutes — and you get a score and the issues found.

**To go further**, connect a free account (Settings → it takes a minute) and you can:

* audit any page, not just the home page, and pick WCAG Level A, AA or AAA;
* see every issue rather than the first few, each with its element and a recommendation;
* export a PDF or email the report;
* set a monitor that re-checks a page on a schedule and tells you when the score drops;
* run the visual tests below.

= What you get in every report =

* **An overall quality score** from 0 to 100 — clear, communicable, and objective.
* **Category-by-category breakdown** with visual charts.
* **Every issue listed with its exact location** on the page.
* **Ready-to-paste CSS fix recommendations** — not "something looks off" but "add margin-top: 16px to .header-nav".
* **PDF reports** — the findings, the elements and the measured values, ready to send to your client in one click.
* **Email reports** — send directly from the interface without downloading.
* **WCAG level selector (A / AA / AAA)** — adjust audit strictness to match your requirements.
* **Saved designs** — save a Figma design once, reuse it across all future tests.

= Why choose QAProof over separate tools? =

The market has tools for design comparison. Separate tools for regression. Separate tools for accessibility. **QAProof combines all five in one platform.**

*  WCAG 2.1 accessibility audit — Level A, AA, AAA
*  A real result before you create an account
*  Design vs. live page comparison
*  Figma tool support
*  Responsive testing across 5 viewports
*  Visual regression monitoring
*  Design Debt Score
*  WordPress plugin with built-in admin UI
*  Scheduled automatic monitoring
*  PDF reports
*  AI-generated CSS fix recommendations

= Start for free today =

Install the plugin and click **Check my site**. You will know where your site stands before you have typed an email address.

== Frequently Asked Questions ==

= Do I need an account? =

Not for the first check. Install the plugin, click **Check my site**, and you get a real score and the issues found on your home page — no account, no API key, no card.

An account (free) is what unlocks auditing other pages, seeing every issue rather than the first few, PDF export and scheduled monitoring.

= Is QAProof free? =

The WordPress plugin is **free and open-source** (GPL-2.0+). The first check of your site needs no account at all.

The QAProof service then has a **Free plan**: 10 AI generations as a one-time trial — they do not reset monthly — 1 monitor, and 7 days of test history. If you sign up with an email address you get 3 of those 10 until you verify the address; signing in with Google or GitHub gives you all 10 immediately. Paid plans (Pro, Business, Scale) add more generations, monitors and history. Full pricing at [qaproof.io/pricing](https://qaproof.io/pricing).

= Is this an accessibility overlay or a toolbar? =

No. QAProof adds nothing to your pages and your visitors never see it. Overlays and toolbars try to patch a site from the outside at page load; they are widely rejected by disabled users and by accessibility professionals, and in 2025 the US Federal Trade Commission fined one overlay vendor $1,000,000 over claims about what its script achieved.

QAProof does the opposite job. It reads your page, tells you which WCAG success criterion each defect relates to and which element is at fault, and then gets out of the way so the problem can be fixed in your theme or content — where it actually lives.

= Does this make my site legally compliant? =

No, and no automated tool can. It finds the problems that can be detected automatically — a large and useful share of them — but judging whether alt text is meaningful, whether the tab order makes sense, or whether someone using a screen reader can finish a purchase needs a person. EN 301 549, the European Accessibility Act, Section 508 and AgID all expect manual testing alongside automated checks.

= Do I need a Figma account? =

Only for Design Fidelity (Figma vs live page). Responsive, Accessibility, Design Audit and Visual Regression need just a URL.

= What information does QAProof send when I run a test? =

Only what you explicitly submit: the **URL of the page** you want to test and, for Design Fidelity, the **Figma design link**. QAProof never reads your post content, user accounts, visitor data, passwords, or any other information from your site.

Every request also carries a normal User-Agent identifying the plugin version and your WordPress and PHP versions — the same thing any HTTP client sends — so we can tell which versions are in use when something breaks. Emailed reports carry the address you send them to, and the feedback form carries your WordPress user ID and your site's home URL so we can reply about the right site.

The one request that happens without an API key is the first check: when you click **Check my site**, the plugin sends your site's public home page URL to api.qaproof.io so it can be loaded and audited. Nothing is sent until you click that button.

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
3. Open **QAProof** and click **Check my site**. Your accessibility score and the issues found appear in a minute or two. No account needed for this.

To audit other pages, see every issue, export PDFs or set up monitoring:

4. Create a free account at [qaproof.io/signup](https://qaproof.io/signup) and copy your API key (API Keys page).
5. Paste it into **QAProof → Settings** and save.

== Screenshots ==

1. Accessibility report — score, severity breakdown, category scores, PDF export and send-to-email.
2. All five test types in one place: Design Fidelity, Responsive Testing, Design Audit, Accessibility Audit and Visual Regression.
3. Run a test — paste a page URL and pick the test type.
4. Accessibility Audit — choose WCAG 2.1 Level A, AA or AAA and follow the audit progress live.
5. Visual Regression Monitors — scheduled daily, weekly or monthly checks against an approved baseline.
6. Settings — connect your QAProof account with an API key and see your plan and usage.
7. Dashboard — average score, test count, monitors and AI generation usage at a glance.
8. Issue markers on the page screenshot — every finding pinned to the exact element.

== Changelog ==

= 1.0.42 =
* Settings no longer says "This site is connected to your QAProof account" when the saved key is one the API rejects. It says a key is saved, and lets the account panel — which actually asks the API — report whether it works.

= 1.0.41 =
* Added the GPL-2.0 LICENSE file that THIRD-PARTY-NOTICES.txt has been telling you to read. The build now refuses to package without it.
* Category names in the report now describe what is actually in them: an invalid ARIA role was filed under "Spacing & Layout" and a broken page language under "Text Readability".

= 1.0.40 =
* **A mistyped API key now tells you so.** Settings queued an error and never printed it, so pasting a malformed key returned a page that silently did nothing. Saving correctly says so now too.
* **The PDF no longer carries a "verified" seal.** Nothing verified it — there was no signature and nothing a recipient could check. It says what it is: an automated check. This plugin's own FAQ tells you to be sceptical of exactly that kind of mark, and it should hold itself to that.
* **The readme now matches the code** on what leaves your site (the plugin version and your WordPress and PHP versions travel in the User-Agent, as with any HTTP client), on Site Audit's per-plan page limit, and on the fact that a finished site audit emails you a copy.
* Fixed a finding that contradicted itself on a default WordPress theme, reporting content "outside any landmark region" while listing the landmarks it was inside.
* Errors from the analysis service are now written for you rather than for whoever operates it.

= 1.0.39 =
* **Listing rewritten so the plugin can actually be found.** The directory search could not match us on "EAA", "a11y" or "accessibility scanner" at all, because those words appeared nowhere in this file. They do now, and the tag that pointed at a four-plugin corner of the directory has been spent on ones people search.
* **New FAQ: is this an overlay or a toolbar?** It is not, and the difference matters enough to say so plainly.
* The accessibility report is now the first screenshot, instead of the dashboard.

= 1.0.38 =
* **Download the site audit as a PDF.** One file with the score, what changed since your last audit, the fixes that cover the most pages, and the per-page table — the report you send to a client. It states plainly how many pages were checked out of how many were found, and which could not be loaded.

= 1.0.37 =
* **Site Audit: check the whole site, not one page.** A new page finds your pages from your sitemap, checks every one against WCAG 2.1 AA, and groups the findings — so a defect in a template reads as "this one fix covers 38 pages" instead of being listed thirty-eight times.
* **See what you fixed.** Run it again and the report opens with what changed since last time: how many issues were resolved, which ones, on which pages, and anything new. The re-scan deliberately re-checks the same pages so the comparison is like for like.
* Coverage is stated plainly — how many pages were checked out of how many were found, and any page that could not be loaded is reported as that rather than counted as passing.
* Fixed: secondary text in the plugin's own admin screens did not meet the WCAG 1.4.3 AA contrast threshold (3.87:1 on light, 3.50:1 on dark). Both themes corrected.

= 1.0.36 =
* Listing name now says what else the plugin does: "Accessibility Checker & Visual QA".

= 1.0.35 =
* **Connecting an account is one click.** "Connect a QAProof account" opens qaproof.io, signs you in or creates a free account, and brings you back with the API key already saved. Pasting a key by hand still works.
* The first-run check lets you change the URL, so a local or staging install is no longer a dead end, and warns before running if the address cannot be reached from the internet.

= 1.0.34 =
* **You can now see a real accessibility score without an account.** The Dashboard runs a WCAG 2.1 AA check of your site on request — no API key, nothing to configure — and shows the score and the issues found. Connect a free account when you want the rest.
* The URL fields on the Tests and Accessibility pages are pre-filled with your own site address instead of being empty.
* Listing rewritten around what the plugin is mostly used for: accessibility.

= 1.0.33 =
* Plugin homepage link now points to qaproof.io.
* Settings: account panel says "1 monitor" (was "1 monitors").
* Listing: screenshot captions added; accessibility audit description clarified (automated WCAG 2.1 check, with a link to the free no-signup checker).

= 1.0.32 =
* Every accessibility and responsive finding now shows WHERE it is: the exact CSS selector (click to copy) and a snippet of the element's source, right on the finding card and in the PDF report.
* Tests page now discloses that AI element detection uses 1 AI generation before you run it.
* Plugin copy aligned with actual behaviour — descriptions, tooltips and button labels now say exactly what each action does.
* Compatibility confirmed with WordPress 7.1.
* Responsive Test is now the default test type — it needs only a URL, no design file.
* Quota and limit errors now show a working upgrade/verify link instead of a generic error.
* Added a "Create a free QAProof account" link to Settings for new installs.
* Dashboard "Upgrade Plan" now opens your QAProof billing page.

= 1.0.30 =
* Fidelity audit improvements and stability fixes.

= 1.0.29 =
* Report fidelity improvements across all five test types.
