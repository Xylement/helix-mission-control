# Claude Code Task Brief — Landing Page Launch Update
## Remove early access/waitlist messaging, add Stripe checkout CTAs

---

## Context

Read CODEBASE-CONTEXT-mc.md first.

The landing page at /var/www/helixnode.tech/index.html (source: ~/helix-mission-control/landing/index.html) still has pre-launch "early access" and "waitlist" messaging. HELIX is now launched and selling. We need to update the page to reflect this.

**Stripe checkout endpoint:** `POST https://api.helixnode.tech/v1/checkout/session`
- Body: `{"plan":"starter","interval":"monthly","email":"EMAIL","success_url":"URL","cancel_url":"URL"}`
- Returns: `{"checkout_url":"https://checkout.stripe.com/..."}`
- Plans: starter, pro, scale (self-hosted); managed_starter, managed_business (managed cloud)
- Intervals: monthly, annual

**Existing live Stripe products (already created):**
- Starter: $49/mo, $500/yr
- Pro: $99/mo, $1,008/yr
- Scale: $199/mo, $2,028/yr
- Managed Starter: $199/mo, $2,028/yr
- Managed Business: $399/mo, $4,068/yr

---

## Changes Required

### 1. Remove "Early Access" nav badge
- Remove the "Now accepting early access signups" badge/pill in the nav area

### 2. Update Hero Section CTAs
- Change "Join the Waitlist" button → "Get Started" linking to `https://docs.helixnode.tech/getting-started/installation`
- Keep "See It in Action" → `#demo` as is

### 3. Update Pricing Plan Buttons

**Self-Hosted plans:**

For Starter (has 7-day trial):
- Button text: "Start Free Trial"
- On click: redirect to `https://docs.helixnode.tech/getting-started/installation` (they install first, activate trial from inside the app)

For Pro, Scale:
- Button text: "Get Started" 
- On click: redirect to `https://docs.helixnode.tech/getting-started/installation` (they install first, buy license from inside the app or from docs site)

**Managed Cloud plans:**
- Button text: "Get Started"
- On click: redirect to `mailto:hello@helixnode.tech?subject=HELIX Managed Cloud - [PlanName]` (managed cloud is not self-serve yet)

Enterprise (both tabs):
- Keep "Contact Us" → mailto:hello@helixnode.tech (already correct)

### 4. Replace Bottom "Waitlist" Section

Replace the entire "Early Access / Be first in line / Join the waitlist" section with a "Get Started" section:

**New content:**
- Heading: "Deploy Your AI Team Today"
- Subheading: "One command. Ten minutes. Your AI workforce is ready."
- Show the install command (same as hero): `curl -fsSL https://helixnode.tech/install.sh | sudo bash` with the Linux/macOS tab switcher
- CTA button: "Read the Docs" → https://docs.helixnode.tech/getting-started/installation
- Secondary link: "View on GitHub" → https://github.com/Xylement/helix-mission-control

Remove:
- The email input form
- The "No spam. Just one email when it's your turn." text
- The "You're on the list! We'll be in touch soon." success message
- Any JavaScript handling the waitlist form submission

### 5. Update Footer (if needed)
- Verify footer links are still correct after changes
- No other footer changes needed

---

## Implementation Notes

- Edit BOTH files: ~/helix-mission-control/landing/index.html AND /var/www/helixnode.tech/index.html
  - Actually: edit only ~/helix-mission-control/landing/index.html — deploying to /var/www/ requires sudo which we can't do. We'll deploy manually after.
- Keep all existing styling, dark theme, animations
- The install command section with Linux/macOS tab switcher already exists in the hero — reuse the same HTML/CSS pattern for the bottom section
- Don't add any JavaScript for Stripe API calls — all links are either docs URLs, mailto links, or anchor links
- Don't change the Marketplace, Features, How It Works, or White Label sections — only Hero, Pricing buttons, and bottom section

---

## After Changes

```bash
git add -A && git commit -m "Landing page: remove waitlist, add launch CTAs and install command" && git push origin main
```

Then tell me to deploy with: `sudo cp ~/helix-mission-control/landing/index.html /var/www/helixnode.tech/index.html`

Update CODEBASE-CONTEXT-mc.md Recent Changes with summary.
