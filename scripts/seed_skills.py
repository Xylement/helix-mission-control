#!/usr/bin/env python3
"""Seed 10 starter skills via the API."""
import json
import sys
import urllib.request

API = "http://localhost:8000/api"

# Login
req = urllib.request.Request(
    f"{API}/auth/login",
    data=json.dumps({"email": "clement@demo.example.com", "password": "helix2024!"}).encode(),
    headers={"Content-Type": "application/json"},
)
resp = json.loads(urllib.request.urlopen(req).read())
TOKEN = resp["access_token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Board IDs
SOCIAL_MEDIA_BOARD = 6
AD_CAMPAIGNS_BOARD = 2  # "Meta Ads" board

# Agent IDs
AGENTS = {
    "Helix": 1, "Maven": 2, "Adley": 3, "Klay": 4, "Sierra": 5,
    "Pixel": 6, "Reel": 7, "Vira": 8, "Metric": 9, "Wordsmith": 10,
    "Scout": 11, "Crystal": 12, "Numeris": 13, "Forge": 14, "Nova": 15,
    "Bolt": 16, "Prism": 17, "Sentinel": 18, "Ledger": 19, "Sage": 20,
}
ALL_AGENT_IDS = list(AGENTS.values())


def create_skill(data):
    req = urllib.request.Request(
        f"{API}/skills",
        data=json.dumps(data).encode(),
        headers=HEADERS,
        method="POST",
    )
    resp = json.loads(urllib.request.urlopen(req).read())
    print(f"  Created: {resp['name']} (id={resp['id']}, slug={resp['slug']})")
    return resp["id"]


def assign_skill(agent_ids, skill_id):
    for aid in agent_ids:
        req = urllib.request.Request(
            f"{API}/agents/{aid}/skills",
            data=json.dumps({"skill_ids": [skill_id]}).encode(),
            headers=HEADERS,
            method="POST",
        )
        try:
            urllib.request.urlopen(req)
        except Exception:
            pass  # skip if already assigned


# =========================================================================
# SKILL 1: E-Commerce Product Listing
# =========================================================================
print("Creating skills...")

s1 = create_skill({
    "name": "E-Commerce Product Listing",
    "slug": "ecommerce-product-listing",
    "description": "How to write high-converting e-commerce product descriptions for premium widgets.",
    "category": "copywriting",
    "tags": ["ecommerce", "product-description", "marketplace"],
    "activation_mode": "always",
    "content": """# E-Commerce Product Listing

## Tone & Voice
Write in a friendly, enthusiastic tone. Target audience is online shoppers aged 18-45 who value quality and design. Keep it conversational — like recommending a product to a friend.

Avoid overly formal language. Don't sound like a corporate press release. Sound like someone who genuinely loves the product and wants to share it.

## Structure
Every product listing must follow this structure:

1. **Hook headline** (max 120 characters) — Benefit-first, include the product name. Make the buyer stop scrolling.
2. **Key features** (3-5 bullet points) — Focus on what makes this product unique. Mention the design, quality, and value.
3. **Material & specs** — Materials, dimensions, compatible models/sizes. Be specific.
4. **Care instructions** — One line on maintenance or care.
5. **Shipping info** — Estimated delivery times by region.

## Rules
- Always include the brand name in the first line of the description
- Use emojis sparingly — maximum 3 per listing. Prefer subtle ones: ✨ 💫 📦
- Include at least 2 relevant keywords for marketplace search optimization
- Price is NEVER mentioned in the description (the platform shows it separately)
- Never make exaggerated claims like "unbreakable" or "100% guaranteed" — use "durable" or "high-quality"
- Always mention customization options if available
- Keep the overall description between 150-300 words
- Reflect the brand's clean, premium aesthetic in your writing tone

## Examples

### Good
✨ Acme Co Premium Widget Pro — Elevate Your Everyday Setup

Upgrade your workflow with a widget that's as functional as it is beautiful. This sleek design features a minimalist aesthetic with premium materials that feel great in your hand and look amazing on your desk.

**Why you'll love it:**
- Minimalist design that complements any workspace
- Slim profile — compact and portable
- Premium build quality with reinforced edges
- Available in multiple sizes and color options

Material: Aircraft-grade aluminum, 45g
Ships within 1-3 business days 📦

### Bad
WIDGET FOR SALE!!! BEST QUALITY!!! BUY NOW!!! CHEAPEST ANYWHERE!!! 100% ORIGINAL!!! FREE GIFT!!!

## Do
- Research competitor listings before writing
- Include the product variant name in the title
- Mention if it's part of a collection
- Maintain a premium but approachable tone
- Highlight tactile qualities ("smooth matte finish", "precision-machined edges")

## Don't
- Copy competitor descriptions — ever
- Use ALL CAPS for emphasis (use bold or emojis instead)
- Promise overnight delivery
- Include pricing or discount info in the description
- Use more than 3 exclamation marks in the entire listing
- Reference other platforms in marketplace-specific listings
"""
})

# =========================================================================
# SKILL 2: Brand Guidelines
# =========================================================================

s2 = create_skill({
    "name": "Brand Guidelines",
    "slug": "brand-guidelines",
    "description": "Complete brand identity guide — colors, voice, audience, and visual standards.",
    "category": "branding",
    "tags": ["brand", "design", "guidelines"],
    "activation_mode": "always",
    "content": """# Brand Guidelines

## Brand Overview
Acme Co is a direct-to-consumer brand specializing in premium widgets and accessories. We sell on major marketplaces, social media, and our own website. Our target customer values quality, aesthetics, and self-expression through the products they choose.

## Brand Colors

### Primary Palette: Black & White
Black and white form the core of the visual identity. This creates a clean, minimal, premium foundation that lets product designs and accent colors shine. All brand materials, packaging, and templates should default to black and white.

- **Black**: #000000 — Primary text, logos, packaging base
- **White**: #FFFFFF — Backgrounds, negative space, clean contrast

### Accent Colors
Accent colors are used **one at a time** as a solo pop alongside the black & white base. Never use multiple accent colors simultaneously. The accent color changes by campaign, collection, or season.

Common accent colors:
- Campaign Blue: #3B82F6
- Bold Red: #EF4444
- Fresh Green: #22C55E
- Brand Pink: #EC4899

**Rule**: When using an accent color, it should appear in no more than 20-30% of the visual. The rest stays black & white. This creates the signature look — clean minimalism with one bold pop.

## Brand Voice & Personality
- **Premium but accessible** — We're not luxury, but we're not cheap. Think Zara, not Hermes.
- **Playful but not childish** — Fun, witty, relatable. Never cringey or try-hard.
- **Confident** — We know our products are good. We don't need to shout or over-sell.
- **Inclusive** — All styles, all aesthetics. No gatekeeping.
- **Authentic** — Genuine enthusiasm, not manufactured hype.

### Tone by Channel
- **Marketplace**: Friendly, informative, emoji-light, keyword-rich
- **Instagram**: Aesthetic, aspirational, caption-savvy, hashtag-strategic
- **TikTok**: Casual, trendy, hook-driven, sound-aware
- **Email**: Warm, personal, value-driven, clean layout
- **Customer Service**: Empathetic, solution-focused, professional but not cold

## Target Audience
- **Demographics**: Adults 18-45, style-conscious online shoppers
- **Psychographics**: Values aesthetics and self-expression, active on social media, shops online regularly, follows design and lifestyle content
- **Shopping behavior**: Compares products before buying, influenced by social media content, responds well to limited editions and collections

## Product Categories
1. **Premium Widgets** — Various materials and finishes. Range from minimalist to bold designs.
2. **Accessories** — Complementary add-ons sold individually and as sets.

## Brand Story
Acme Co was founded with one goal: create everyday products that are as expressive as the people who use them. Every design is created to help our customers show who they are — whether that's bold and vibrant or soft and minimal.

## Visual Standards
- Photography: Clean backgrounds (white or black), natural lighting, lifestyle shots showing products in context
- Product shots: Always show the product in use, not floating alone
- Social media: Consistent grid aesthetic, alternating between product and lifestyle shots
- Packaging: Black box with white logo, single accent color sticker per collection
"""
})

# =========================================================================
# SKILL 3: Instagram Caption Style
# =========================================================================

s3 = create_skill({
    "name": "Instagram Caption Style",
    "slug": "instagram-caption-style",
    "description": "Brand voice, caption structure, and hashtag strategy for Instagram content.",
    "category": "social-media",
    "tags": ["instagram", "social", "captions"],
    "activation_mode": "board",
    "activation_boards": [SOCIAL_MEDIA_BOARD],
    "content": """# Instagram Caption Style

## Caption Structure
Every Instagram caption follows this flow:

1. **Hook** (first line, before "...more") — This is the only line most people see. Make it count. Ask a question, make a bold statement, or create curiosity.
2. **Value/Story** (2-4 sentences) — Give context. Tell a mini-story about the product, the design inspiration, or the vibe. Connect emotionally.
3. **CTA** (call to action) — Tell them what to do next. "Tap the link in bio", "Save this for later", "Tag your friend who needs this", "Comment your fave color".

### Hook Formulas That Work
- "POV: You just found your new favorite everyday carry ✨"
- "This design was inspired by [something relatable]..."
- "Your setup called. It wants a glow-up."
- "Hot take: [opinion about product category]"
- "If your gear doesn't match your aesthetic, do you even have an aesthetic?"

## Hashtag Strategy
Use 15-20 hashtags per post. Mix three categories:

### Branded (use on every post)
#AcmeCo #AcmeCoDesign #AcmeCoStyle

### Niche (rotate based on content)
#premiumwidgets #designeraccessories #minimalistdesign #aestheticsetup #desksetup #everydaycarry

### Broad / Trending (pick 3-5 per post)
#aesthetic #aestheticvibes #flatlay #instadaily #supportsmallbusiness #shopsmall #designinspiration

**Placement**: Put hashtags in the first comment (not in the caption itself) to keep the caption clean. Some posts can use 2-3 hashtags inline in the caption if they flow naturally.

## Emoji Usage
- Use 1-3 emojis per caption — never more
- Place them at natural breaks, not clustered together
- Preferred emojis: ✨ 🖤 🤍 📦 💫 🫶 (matches the black & white + accent aesthetic)
- Never use: 🔥💯🙏😂 (overused, doesn't fit brand tone)

## Caption Length
- **Product posts**: 50-100 words. Punchy and visual-forward.
- **Story posts** (design inspo, behind-the-scenes): 100-200 words. More narrative.
- **Engagement posts** (polls, questions, this-or-that): 20-50 words. Short and interactive.
- **Collab/feature posts**: 80-120 words. Credit the collaborator, tell the story.

## Engagement Prompts (rotate these)
- "Save this post if you'd use this daily 🫶"
- "Tag someone who NEEDS to see this"
- "Comment ✨ and we'll DM you the link"
- "Which design are you? A or B?"
- "Drop a 🖤 if this is your vibe"

## Brand Consistency
- Never use "cheap" — use "affordable" or "worth it"
- Never use multiple accent colors in one visual — stick to one pop color per post
- Maintain the black & white foundation in all grid posts
- Every caption should feel like it came from the same person — consistent voice, same energy
- When featuring a product, always mention the design name and available variants
"""
})

# =========================================================================
# SKILL 4: Email Marketing Templates
# =========================================================================

s4 = create_skill({
    "name": "Email Marketing Templates",
    "slug": "email-marketing-templates",
    "description": "Email marketing templates, subject line formulas, and automation flows.",
    "category": "email",
    "tags": ["email", "marketing", "automation"],
    "activation_mode": "always",
    "content": """# Email Marketing Templates

## Email Types & Flows

### 1. Welcome Series (3 emails over 5 days)
- **Email 1** (immediate): Welcome + brand story + 10% first order code. Subject: "Welcome to the crew ✨"
- **Email 2** (day 2): Best-sellers showcase + social proof. Subject: "These are our customers' favorites"
- **Email 3** (day 5): "Still thinking?" + reminder of 10% code expiring. Subject: "Your 10% off expires soon — here's what we'd pick"

### 2. Abandoned Cart (2 emails)
- **Email 1** (1 hour after): Product image + "You left something behind". Soft, no pressure.
- **Email 2** (24 hours after): Urgency + "Only X left in stock" (if applicable). Include customer reviews.

### 3. Post-Purchase (2 emails)
- **Email 1** (day 1): Order confirmation + product care tips
- **Email 2** (day 7): "How's your new purchase?" + review request + share on social CTA

### 4. Win-Back (inactive 60+ days)
- Single email: "We miss you" + what's new + exclusive comeback offer. Subject: "It's been a while — come see what's new 🖤"

## Subject Line Formulas
- **Curiosity**: "You haven't seen this yet..." / "This just dropped 👀"
- **Benefit**: "Your setup deserves better" / "The product everyone's asking about"
- **Urgency**: "Last chance: [Collection] selling fast" / "24 hours left"
- **Personal**: "Picked for you, [First Name]" / "[First Name], this is SO you"
- **Question**: "Ready for an upgrade?" / "What's your aesthetic?"

### Subject Line Rules
- Max 50 characters (40 is ideal for mobile)
- Use 0-1 emoji — place it at the end
- Never ALL CAPS — never
- A/B test subject lines on every campaign (test 20%, send winner to 80%)

## Preview Text
- Always customize — never leave blank
- Should complement, not repeat, the subject line
- Max 90 characters
- Example: Subject "Your setup deserves better" → Preview "New designs just dropped. Clean aesthetics only."

## CTA Button Text
- Primary CTA: "Shop Now" / "Get Yours" / "See the Collection"
- Secondary CTA: "Learn More" / "See How It Looks"
- Never use "Click Here" or "Buy Now" (too aggressive)
- Button color: Black background, white text (matches brand)

## Design Notes
- Header: Logo centered on white background
- Body: Clean, minimal layout. One column. Max 2 product images per email.
- Colors: Black text on white. One accent color per email matching the campaign.
- Font: System sans-serif. Body 16px, headings 24px.
- Footer: Unsubscribe link, business address, social icons
- Mobile-first: 90%+ of customers open on mobile. Test every email on mobile.

## Segmentation Tips
- **VIP segment**: 3+ orders OR total spend > $200. Get early access + exclusive designs.
- **Marketplace buyers**: Came from a marketplace → nurture toward direct website (higher margin).
- **Engagement-based**: Opened last 3 emails = "active". Didn't open last 5 = "at risk".
- **Product interest**: Clicked on accessories → send accessory content. Clicked on widgets → send widget drops.
"""
})

# =========================================================================
# SKILL 5: Refund Policy Template
# =========================================================================

s5 = create_skill({
    "name": "Refund Policy Template",
    "slug": "refund-policy-template",
    "description": "Complete refund, return, and exchange policy for customer service.",
    "category": "customer-service",
    "tags": ["refund", "policy", "cs"],
    "activation_mode": "always",
    "content": """# Refund Policy

## Refund Window
Customers can request a refund within **14 days** of receiving their order. After 14 days, no refunds are issued — only exchanges for defective items.

## Refund Conditions
A refund is approved when:
- The item is **unused** and in **original packaging**
- The customer provides **order ID** and **photos** of the item
- The request is made within the refund window

A refund is **NOT** approved when:
- The item has been used (visible wear, marks, residue)
- The customer changed their mind about the design (buyer's remorse)
- The item was purchased during a sale or with a promo code (sale items are final sale)
- The refund window has passed

## Refund Process
1. Customer contacts support via chat, email, or social media DM
2. CS Lead reviews the request and asks for order ID + photos
3. CS Lead drafts a reply based on this policy
4. If approved: initiate refund via the original payment method
5. If denied: explain reason clearly and offer alternatives (exchange, store credit)
6. Refund processing time: 3-5 business days after approval

## Exchange Policy
- Exchanges are available within **30 days** of receiving the order
- Customer pays return shipping; we pay outgoing shipping for the replacement
- Exchanges are for the **same product in a different variant** — not a different product category
- Defective items: free exchange, no questions asked (just need photos of the defect)

## Damaged/Defective Items
- If the item arrives damaged or defective, we offer **full replacement** — no return needed
- Customer must send photos showing the damage within 48 hours of delivery
- We ship the replacement within 1-2 business days
- If the same variant is out of stock, offer store credit or a different variant of equal value

## Marketplace Orders vs Direct Orders
### Marketplace
- Refunds go through the marketplace's built-in return/refund system
- Customer initiates return on the platform → CS approves/denies in Seller Centre
- Follow platform's timelines (vary by campaign)
- Platform holds the funds — refund is processed by the platform, not us

### Direct Orders (Website / Social DM)
- Refunds processed manually via bank transfer or original payment gateway
- CS handles the full process end-to-end
- Keep records: screenshot of refund confirmation, customer acknowledgment

## Response Templates

### Approved Refund
"Hi [Name]! Thank you for reaching out. We've reviewed your return request for order [#ORDER] and it's been approved. We'll process your refund of $[amount] within 3-5 business days to your original payment method. If you have any questions, just message us! 🤍"

### Denied Refund
"Hi [Name], thank you for contacting us about order [#ORDER]. Unfortunately, we're unable to process a refund because [reason — e.g., the item shows signs of use / the refund window has passed]. However, we'd love to help — would you be interested in exchanging for a different variant? Let us know! 🖤"

### Defective Item
"Oh no, we're so sorry about that! 😟 Thank you for the photos. We'll ship out a replacement right away — no need to return the defective one. Your new [product] should arrive within 3-5 business days. We appreciate your patience!"

## Escalation
If a customer is upset or the situation is complex:
1. CS Lead handles first response
2. If unresolved, escalate to Marketing Manager for PR-sensitive cases
3. For refunds over $100, get approval from admin before processing
"""
})

# =========================================================================
# SKILL 6: Meta Ads Copy Rules
# =========================================================================

s6 = create_skill({
    "name": "Meta Ads Copy Rules",
    "slug": "meta-ads-copy-rules",
    "description": "Ad copy structure, compliance rules, and creative angles for Meta (Facebook/Instagram) ads.",
    "category": "advertising",
    "tags": ["meta", "ads", "facebook", "instagram"],
    "activation_mode": "board",
    "activation_boards": [AD_CAMPAIGNS_BOARD],
    "content": """# Meta Ads Copy Rules

## Ad Copy Structure

### Headline (max 40 characters)
The first thing people see. Must be benefit-driven and specific.
- Good: "Widgets That Match Your Aesthetic"
- Good: "Premium Quality, Minimal Design"
- Bad: "Acme Co Widgets For Sale"
- Bad: "Best Widgets Online"

### Primary Text (max 125 characters for optimal display)
Appears above the image/video. This is your hook + value prop.
- Keep it to 1-2 sentences
- Front-load the benefit — don't bury the hook
- Use a clean black & white visual approach in copy tone — mirror the brand aesthetic

### Description (max 30 characters)
Appears below the headline. Supporting detail.
- "Free shipping over $50"
- "Ships within 24 hours 📦"
- "100+ designs available"

## Compliance Rules
These are hard rules — violating them risks ad rejection or account issues:
- **No exaggerated claims**: Don't say "best", "most popular", "guaranteed" without qualification
- **No before/after implications**: Don't imply the product changes your life
- **No urgency manipulation**: "Last chance" is okay; "You'll regret not buying" is not
- **No competitor mentions**: Never name another brand
- **No personal attributes**: Don't say "If you're stylish..." (Meta flags this as targeting by personal attribute)
- **Price transparency**: If mentioning a price, it must be accurate and current

## CTA Types
Match the CTA to the funnel stage:
- **Top of funnel** (awareness): "Learn More" — send to collection page
- **Middle of funnel** (consideration): "Shop Now" — send to specific product
- **Bottom of funnel** (conversion): "Get Yours" or "Order Now" — send to product page with urgency
- **Retargeting**: "Complete Your Order" or "Still Thinking?" — send back to cart or last viewed

## A/B Testing Approach
Always test at least 2 variations per ad set:
- **Copy tests**: Same visual, different headlines or primary text
- **Visual tests**: Same copy, different image/video
- **CTA tests**: Same everything, different CTA button
- Run each test for minimum 3 days or 1,000 impressions before judging
- Winner = lower CPA, not higher CTR (optimise for purchases, not clicks)

## Creative Angles That Work

### 1. Aesthetic Identity
"Your setup says a lot about you. Make it count."
Angle: Position the product as self-expression, not just utility.

### 2. Premium but Accessible
"Premium design doesn't need a premium price."
Angle: High quality at $19-39 — better value than big-name competitors.

### 3. Clean Minimalism
"Less is more. Black, white, and one perfect accent."
Angle: Lean into the black & white brand identity with a single pop color.

### 4. Small Brand, Big Quality
"Designed with care, loved by thousands."
Angle: Support small business angle — works well across markets.

### 5. Customization
"Make it yours. Add your name, your initials, your vibe."
Angle: Customization is a key differentiator at this price point.

### 6. Collection Drops
"New drop just landed. Limited designs."
Angle: Create urgency and exclusivity around new collections.

## Ad Creative Notes
- Product images should show the item in use (never floating alone)
- Use black or white backgrounds — stay on brand
- One accent color per ad creative, matching the featured product's collection
- Lifestyle shots outperform studio shots for engagement
- Video ads: first 3 seconds must show the product clearly
"""
})

# =========================================================================
# SKILL 7: SEO Content Brief
# =========================================================================

s7 = create_skill({
    "name": "SEO Content Brief",
    "slug": "seo-content-brief",
    "description": "How to create SEO content briefs for blog posts and landing pages.",
    "category": "seo",
    "tags": ["seo", "content", "keywords"],
    "activation_mode": "tag",
    "activation_tags": ["seo"],
    "content": """# SEO Content Brief

## Brief Structure
Every SEO content brief must include these sections:

### 1. Target Keyword
- Primary keyword (1 main keyword the page targets)
- Secondary keywords (3-5 related terms)
- Long-tail variations (2-3 question-based or specific queries)
- Example: Primary "premium widgets online" → Secondary "custom widgets", "designer widgets" → Long-tail "where to buy custom widgets online"

### 2. Search Intent
Identify what the searcher actually wants:
- **Informational**: They want to learn (e.g., "how to care for premium widgets") → Write a guide
- **Commercial**: They're comparing options (e.g., "best widget brands") → Write a comparison/review
- **Transactional**: They're ready to buy (e.g., "buy custom widgets online") → Optimize product/category page
- **Navigational**: They're looking for us specifically (e.g., "Acme Co shop") → Ensure brand pages rank

### 3. Recommended Word Count
- Product category pages: 500-800 words
- Blog posts (informational): 1,200-2,000 words
- Comparison/review posts: 1,500-2,500 words
- Landing pages: 300-600 words
- Base this on what's currently ranking — check top 5 results for the keyword

### 4. Content Outline
Provide a structured outline with H2 and H3 headings:
- H1: Include the primary keyword naturally (1 per page)
- H2s: Cover main subtopics — each should target a secondary keyword
- H3s: Break down H2 sections with specifics
- Include a "Quick Answer" or TL;DR near the top for featured snippet potential

### 5. Competitor URLs
List the top 3-5 currently ranking pages:
- Note what they cover well
- Note gaps we can fill (unique angle, missing info, better examples)
- Note their word count, heading structure, media usage

## On-Page SEO Rules

### Title Tag
- Include primary keyword, ideally near the beginning
- Max 60 characters
- Include brand name at the end: "... | Acme Co"
- Example: "Custom Premium Widgets — Design Your Own | Acme Co"

### Meta Description
- 150-160 characters
- Include primary keyword
- Include a CTA or value prop
- Example: "Design your own custom widget with Acme Co. Premium quality, aesthetic designs, fast shipping. Browse 100+ styles from $19."

### Headings
- H1: One per page, includes primary keyword
- H2: One per major section, includes secondary keywords where natural
- H3: Supporting subheadings — don't force keywords here

### Image Alt Text
- Every image needs descriptive alt text
- Include keywords where natural: "Acme Co black and white premium widget"
- Don't keyword-stuff: not "widget buy cheap widget online best widget"

### Internal Linking
- Link to 3-5 related pages from every new content piece
- Use descriptive anchor text (not "click here")
- Priority links: product pages, collection pages, related blog posts
- Every blog post should link to at least 1 product page

## Keyword Clusters

### Cluster 1: Product Keywords
- premium widgets, custom widgets, designer widgets, widgets online, handmade widgets

### Cluster 2: Brand Keywords
- Acme Co, Acme Co widgets, Acme Co shop, Acme Co review

### Cluster 3: Design Keywords
- minimalist widgets, aesthetic widgets, modern widgets, black and white widgets

### Cluster 4: Gifting Keywords
- widget gift, customized gift, personalized widget

### Cluster 5: Informational Keywords
- how to care for widgets, best widget material, how to choose a widget

## Content Quality Standards
- No AI-sounding filler text — every sentence should add value
- Include real product examples where relevant
- Add original images or suggest image requirements for each section
- Include at least one data point, statistic, or specific detail per major section
"""
})

# =========================================================================
# SKILL 8: TikTok Hook Formula
# =========================================================================

s8 = create_skill({
    "name": "TikTok Hook Formula",
    "slug": "tiktok-hook-formula",
    "description": "First 3 seconds rules, trending formats, and product showcase angles for TikTok.",
    "category": "social-media",
    "tags": ["tiktok", "video", "hooks"],
    "activation_mode": "board",
    "activation_boards": [SOCIAL_MEDIA_BOARD],
    "content": """# TikTok Hook Formula

## The First 3 Seconds Rule
TikTok's algorithm decides whether to push your video within the first 1-3 seconds based on watch-through rate. If viewers scroll past, the video dies. Every TikTok must nail the opening.

### Hook Types That Work

#### 1. Pattern Interrupt
Show something unexpected that makes the viewer pause.
- Extreme close-up of a product detail, then pull back to reveal the full design
- Hand placing the product down dramatically
- Black screen → sudden color pop revealing the product

#### 2. Question Hook
Ask something the viewer wants answered.
- "Why do aesthetic people always have the best setups?"
- "Is this the best-looking widget under $25?"
- "Guess how much this costs 👀"

#### 3. Bold Claim
Make a statement that demands attention.
- "This $19 widget looks better than most $100 ones"
- "The only brand worth buying from"
- "I designed this and it sold out in 3 hours"

#### 4. POV / Scenario
Put the viewer in a relatable situation.
- "POV: You finally find a product that matches your aesthetic"
- "When someone asks where you got your widget"
- "Me choosing a new design for the 5th time this month"

#### 5. Trend Jacking
Use a trending sound or format but make it about your product.
- Adapt trending "get ready with me" → "get ready with my setup"
- Use trending transition sounds for before/after reveals

## Product Showcase Angles

### The Unboxing
Show the clean black packaging → opening → revealing the product → putting it to use. Satisfying, ASMR-friendly. Works every time.

### The Aesthetic Flat Lay
Product laid out with matching items. Slow pan. Clean background. One accent color theme. On-brand perfection.

### The Swap
Old boring product → dramatic swap to the new one. Use a trending transition. Before/after energy.

### The Collection
"My collection" — fan out multiple variants. Show variety. Triggers "I want all of them" response.

### The Customization
Show the process: typing a name, choosing a design, receiving the final product. Personalization content performs well.

## Sound & Music Guidelines
- Always use trending sounds — check TikTok's Creative Center for what's trending
- If using original audio, keep it short and punchy
- ASMR sounds work well for product videos (clicking, packaging sounds)
- Music choice should match the vibe: lo-fi for aesthetic, upbeat for energetic, trending for discoverability

## Optimal Video Specs
- Length: 15-30 seconds for product showcase, 30-60 seconds for storytelling
- Aspect ratio: 9:16 (vertical, always)
- Resolution: 1080x1920 minimum
- Text on screen: Use for key messages, keep it short, place in center-safe zone
- Captions: Add them — most viewers watch on mute initially

## CTA Placement
- Don't CTA in the first 5 seconds — earn attention first
- Best placement: final 3-5 seconds
- Visual CTA > spoken CTA (on-screen text: "Link in bio" or "Comment 🖤 for link")
- Pin a comment with the product link or "DM us for the link"

## Posting Strategy
- Post 1-2 times per day during testing phases
- Best times vary by audience — test and iterate
- Use 3-5 hashtags (less is more on TikTok): #fyp #aesthetic #premiumwidgets + 1-2 trending
- Cross-post to Instagram Reels with minor adjustments (remove TikTok watermark)
"""
})

# =========================================================================
# SKILL 9: Monthly Report Template
# =========================================================================

s9 = create_skill({
    "name": "Monthly Report Template",
    "slug": "monthly-report-template",
    "description": "Standard structure and KPI definitions for monthly performance reports.",
    "category": "reporting",
    "tags": ["report", "analytics", "monthly"],
    "activation_mode": "tag",
    "activation_tags": ["report"],
    "content": """# Monthly Report Template

## Report Structure
Every monthly report follows this exact structure. No sections should be skipped — if data is unavailable, note "Data not available" with a reason.

### 1. Executive Summary (5-7 sentences max)
High-level overview for leadership. Answer three questions:
- How did we perform vs last month?
- How did we perform vs targets?
- What's the one most important thing to know?

Format: 2-3 highlights, 1-2 concerns, 1 key recommendation.

### 2. KPI Dashboard Table
Present all KPIs in a single table with these columns:

| KPI | This Month | Last Month | Change (%) | Target | Status |
|-----|-----------|------------|------------|--------|--------|
| Revenue | $X | $Y | +/-Z% | $T | 🟢/🟡/🔴 |
| Orders | ... | ... | ... | ... | ... |

Status indicators:
- 🟢 On target or above (≥95% of target)
- 🟡 Slightly below (80-94% of target)
- 🔴 Significantly below (<80% of target)

### 3. Channel Breakdown
For each active channel, provide:
- Revenue contribution ($ and % of total)
- Order count
- Average order value (AOV)
- Top performing products
- Notable changes from last month

Channels to cover:
- Primary marketplace
- Instagram (DM orders + Shop)
- TikTok (TikTok Shop)
- Direct website

### 4. Top Performers
- Top 5 products by revenue
- Top 3 products by unit volume
- Best performing ad creative (if applicable)
- Best performing content piece (engagement metrics)
- Any new products/designs that overperformed expectations

### 5. Issues & Risks
- What went wrong or underperformed?
- Root cause analysis (not just symptoms)
- Customer complaints summary (themes, volume, resolution rate)
- Inventory issues (stockouts, overstocks)
- Any platform issues (marketplace penalties, ad account problems)

### 6. Next Month Plan
- 3-5 specific action items with owners
- Key dates (campaigns, launches, holidays)
- Budget allocation changes (if any)
- Tests to run (A/B tests, new channels, new content formats)

## KPI Definitions

### Revenue Metrics
- **Gross Revenue**: Total revenue before refunds, discounts, and platform fees
- **Net Revenue**: Gross revenue minus refunds, discounts, and platform fees
- **AOV (Average Order Value)**: Net revenue / number of orders

### Customer Metrics
- **New Customers**: First-time purchasers this month
- **Returning Customers**: Customers with 2+ lifetime orders who ordered this month
- **Customer Acquisition Cost (CAC)**: Total marketing spend / new customers acquired

### Marketing Metrics
- **ROAS (Return on Ad Spend)**: Revenue generated from ads / ad spend. Target: >4x
- **Conversion Rate**: Orders / website or store visits. Benchmark: 2-4% for e-commerce
- **CTR (Click-Through Rate)**: Ad clicks / ad impressions. Benchmark: 1-3% for FB/IG
- **CPC (Cost Per Click)**: Ad spend / clicks. Benchmark varies by campaign.

### Engagement Metrics (Social)
- **Engagement Rate**: (Likes + Comments + Shares + Saves) / Followers × 100
- **Reach**: Unique accounts that saw content
- **Content Saves**: Number of saves (strongest intent signal on Instagram)

## Data Sources
- **Marketplace**: Seller Centre → Business Insights
- **Meta Ads**: Meta Ads Manager → export campaign data
- **Instagram**: Instagram Professional Dashboard → Insights
- **TikTok**: TikTok Business Centre → Analytics
- **Website**: Analytics dashboard → Reports
- **GA4**: Google Analytics 4 (if configured) for website traffic

## Comparison Format
Always present data with context. Raw numbers mean nothing without comparison:
- **vs Last Month**: Shows trend direction
- **vs Same Month Last Year**: Shows YoY growth (when available)
- **vs Target**: Shows performance against plan
- Use percentage change, not just absolute numbers
- Red/green arrows or color coding for quick scanning
"""
})

# =========================================================================
# SKILL 10: Code Review Standards
# =========================================================================

s10 = create_skill({
    "name": "Code Review Standards",
    "slug": "code-review-standards",
    "description": "Code review checklist, severity levels, and HELIX-specific patterns for QA/QC reviews.",
    "category": "development",
    "tags": ["code", "review", "qa"],
    "activation_mode": "always",
    "content": """# Code Review Standards

## Review Checklist
When reviewing code changes, check every item in this order. Don't approve until all critical and major issues are resolved.

### Security (Critical)
- [ ] No hardcoded secrets, API keys, or passwords
- [ ] SQL queries use parameterized queries (never string concatenation)
- [ ] User input is validated and sanitized before use
- [ ] Authentication checks are present on all protected endpoints
- [ ] Authorization checks verify `org_id` scoping (multi-tenant enforcement)
- [ ] File uploads validate type, size, and content
- [ ] No sensitive data in logs or error messages

### Performance
- [ ] Database queries are efficient (no N+1 queries, proper use of `selectinload`)
- [ ] Large lists are paginated
- [ ] No unnecessary data fetching (only select needed columns/relationships)
- [ ] Async operations don't block the event loop
- [ ] Redis is used for caching where appropriate

### Readability & Maintainability
- [ ] Code is self-explanatory — if you need a comment to understand it, it should be refactored
- [ ] Functions are focused (single responsibility)
- [ ] Variable and function names are descriptive
- [ ] No dead code or commented-out blocks
- [ ] Consistent style with the rest of the codebase

### Error Handling
- [ ] API endpoints return appropriate HTTP status codes (400, 401, 403, 404, 500)
- [ ] Errors are caught and handled — no silent failures
- [ ] Error messages are helpful but don't leak internal details
- [ ] Database operations have proper transaction handling

### Tests & Validation
- [ ] New features have corresponding tests (or documented reason why not)
- [ ] Edge cases are considered (empty lists, null values, max limits)
- [ ] API request/response schemas match the actual behavior

## Severity Levels

### Critical
Must be fixed before merge. Blocks deployment.
- Security vulnerabilities
- Data loss risks
- Breaking changes to existing API contracts
- Missing org_id filtering (multi-tenant data leak)

### Major
Should be fixed before merge. Can be excepted with strong justification.
- Logic errors that produce wrong results
- Performance issues (N+1 queries, missing pagination)
- Missing error handling on user-facing flows
- Inconsistent behavior with existing patterns

### Minor
Should be fixed, but won't block merge.
- Style inconsistencies
- Non-critical naming improvements
- Minor code duplication (< 10 lines)
- Missing type hints on internal functions

### Suggestion
Nice-to-have. Author decides whether to adopt.
- Alternative approaches that might be cleaner
- Refactoring opportunities for future
- Documentation improvements
- Test coverage extensions

## Feedback Format
Every review comment should follow this structure:

**[SEVERITY]** Brief description of the issue.

**What**: What's wrong or could be improved.
**Why**: Why this matters (security? performance? maintainability?).
**How**: Suggested fix or approach.

Example:
> **[Major]** Missing org_id filter on skills query.
>
> **What**: `list_skills` doesn't filter by org_id, so users from one org could see skills from another.
> **Why**: Multi-tenant data isolation — this is a data leak.
> **How**: Add `.where(Skill.org_id == user.org_id)` to the query.

## HELIX-Specific Patterns

### Multi-Tenant
- Every query that returns data must filter by `org_id`
- Use `user.org_id` from the authenticated user, never from request body
- Test with multiple orgs to verify isolation

### Docker Considerations
- No pip installs on host — all Python deps are in Docker
- File paths inside container differ from host (e.g., `/data/` volumes)
- Backend rebuilds required for code changes: `docker compose build backend`
- Alembic migrations run inside the container

### API Response Format
- Use Pydantic schemas for all responses (not raw dicts)
- Datetime fields should be ISO 8601 with timezone
- List endpoints return arrays directly (not wrapped in `{"items": [...]}`)
- Null fields should be present in response (not omitted)

### Database
- Use SQLAlchemy async with `AsyncSession`
- Always use `selectinload` for relationships — never lazy load
- Use `db.flush()` when you need the ID before commit
- Alembic migrations must have working `downgrade()`
"""
})

# =========================================================================
# ASSIGNMENTS
# =========================================================================
print("\nAssigning skills to agents...")

# Skill 1: E-Commerce Product Listing → Wordsmith
assign_skill([AGENTS["Wordsmith"]], s1)
print("  Skill 1 → Wordsmith")

# Skill 2: Brand Guidelines → ALL agents
assign_skill(ALL_AGENT_IDS, s2)
print("  Skill 2 → ALL agents")

# Skill 3: Instagram Caption Style → Wordsmith, Vira
assign_skill([AGENTS["Wordsmith"], AGENTS["Vira"]], s3)
print("  Skill 3 → Wordsmith, Vira")

# Skill 4: Email Marketing Templates → Klay
assign_skill([AGENTS["Klay"]], s4)
print("  Skill 4 → Klay")

# Skill 5: Refund Policy Template → Crystal
assign_skill([AGENTS["Crystal"]], s5)
print("  Skill 5 → Crystal")

# Skill 6: Meta Ads Copy Rules → Adley, Wordsmith
assign_skill([AGENTS["Adley"], AGENTS["Wordsmith"]], s6)
print("  Skill 6 → Adley, Wordsmith")

# Skill 7: SEO Content Brief → Sierra, Wordsmith
assign_skill([AGENTS["Sierra"], AGENTS["Wordsmith"]], s7)
print("  Skill 7 → Sierra, Wordsmith")

# Skill 8: TikTok Hook Formula → Reel, Vira
assign_skill([AGENTS["Reel"], AGENTS["Vira"]], s8)
print("  Skill 8 → Reel, Vira")

# Skill 9: Monthly Report Template → Metric, Ledger
assign_skill([AGENTS["Metric"], AGENTS["Ledger"]], s9)
print("  Skill 9 → Metric, Ledger")

# Skill 10: Code Review Standards → Prism
assign_skill([AGENTS["Prism"]], s10)
print("  Skill 10 → Prism")

print("\nDone! All 10 skills created and assigned.")
