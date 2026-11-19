# Atlassian Jira (Jira Cloud) — Product Profile, as of November 2026

Research date: 2026-11-19. 16 search/fetch calls. G2, Capterra and the Business Wire release returned HTTP 403, so figures from those sites come from search snippets, not full pages. Where sources conflict, these notes say so.

## Core features (incl. AI / Rovo 2025-2026)

### Takeaway
Jira is a deeply configurable work tracker: work types, workflows, Scrum and Kanban boards, backlogs, timelines, JQL, automation, dashboards and permission schemes. In 2025-2026 Atlassian renamed its core objects ("projects" became "spaces", "issues" became "work items"). It also folded Jira Work Management into Jira and rebuilt the core views for speed. On AI, it went agent-first: Rovo, Agents in Jira, coding-agent assignment (Claude Code, Cursor, Copilot), MCP and the Teamwork Graph.

### Cited Findings
**Recent product changes (verified this session)**
- The Summer 2026 release has 15 capabilities, rolling out with GA across Jira Cloud expected by the end of August 2026. Six are detailed. Plan-tier requirements are not stated. — [Atlassian blog: Jira summer release](https://www.atlassian.com/blog/development/jira-summer-release)
  - Core views were rebuilt on a shared foundation. Atlassian claims work items load 45% faster, lists and search 48% faster, and boards and backlogs up to 22% faster. — same source
  - Swimlanes, subtask visibility and inline editing now behave the same in software and business spaces. — same source
  - The new List view merges "List" and "All Work". It supports JQL or natural-language search, parent/child hierarchy, inline editing and saved custom views. — same source
  - The team-managed software board was rebuilt with swimlanes, subtasks on cards, inline editing and "no work item caps". — same source
  - The Capacity view shows how work is allocated, who has spare capacity and who is overloaded, with the backlog alongside. — same source
  - Formula fields are calculated fields (e.g. remaining budget, days to deadline). Users describe the calculation in plain language and Rovo writes the formula. Results are searchable and sortable. — same source
  - The Delivery Agent automates health checks, standup digests and stakeholder updates. It is set up through automation templates in the Summary view. — same source
  - Rovo-generated spaces: a team describes how it works, or attaches Confluence pages, Looms, decks or images, and Rovo generates a space with workflows, work types, views and suggested first work items. — same source
  - The article says Atlassian shipped new MCP capabilities over the past six months so coding agents can act in Jira, and that Teamwork Graph CLI is GA. — same source
- Agents in Jira was announced on 24 Feb 2026. Agents can be assigned work and can pick it up automatically when an item moves to a set status. Sources disagree on its status: an Atlassian Team '26 summary calls it GA, while IT Brief calls it an open beta. — [Business Wire (403, snippet only)](https://businesswire.com/news/home/20260224033792/en/Atlassian-Introduces-Agents-in-Jira-to-Drive-Human-AI-Collaboration-at-Enterprise-Scale); [IT Brief UK](https://itbrief.co.uk/story/atlassian-brings-ai-agents-to-jira-with-mcp-support); [Atlassian JP Team '26 blog](https://www.atlassian.com/ja/blog/founder-update-team-26)
- A July 15 (2026) launch let engineering teams assign Jira work to Claude Code, Cursor and GitHub Copilot, see all agents in one view, and route work to them with automation rules. This comes from a search-result summary and the primary page was not fetched. — [Futurum Group](https://futurumgroup.com/?p=93113); [heise](https://heise.de/-11287380)
- Team '26 (spring 2026), per search snippets:
  - Rovo gained a "Max" reasoning mode (early access), context-aware search and admin governance over agents and AI credit consumption.
  - Admins can separate AI-use permissions from agent-building permissions.
  - Rovo Studio is GA.
  - DX (acquired by Atlassian) supplies AI Code Insights and Agent Experience dashboards.
  - Sources: [schneider.im Team '26 recap](https://www.schneider.im/atlassian-team-26-changes-across-jira-confluence-rovo-focus-talent-more/); [Nand Research](https://nand-research.com/atlassian-team-26-context-as-infrastructure/)
- The MCP server and Teamwork Graph CLI passed 1 million monthly active users, more than doubling in one quarter (Q4 FY26, quarter ending June 2026). — [Atlassian Q4 FY26 earnings release (PDF)](https://s206.q4cdn.com/270053503/files/doc_financials/2026/q4/TEAM-Q4-2026-Earnings-Release.pdf)
- Rovo passed 5 million MAU in Q2 FY26 (reported Feb 2026). In Q1 FY26 the figure was 3.5 million MAU of AI capabilities, up 50% QoQ. — [Atlassian Q2 FY26 results](https://investors.atlassian.com/news/news-details/2026/Atlassian-Announces-Second-Quarter-Fiscal-Year-2026-Results)
- Jira Work Management merger:
  - Announced at Team '24. Jira Software and Jira Work Management became a single product called "Jira".
  - The Jira Software group became the "Jira" group on 1 May 2024.
  - Sources: [TechCrunch, 2024-05-01](https://techcrunch.com/2024/05/01/jira-software-and-jira-work-management-become-one/); [Atlassian Community](https://community.atlassian.com/t5/Jira-Work-Management-Articles/Jira-Work-Management-is-now-part-of-Jira/ba-p/2683620); [Atlassian blog: how we merged JWM](https://www.atlassian.com/blog/jira/how-we-merged-jira-work-management-into-jira-using-jira)
- Terminology rename, rolled out from September 2025:
  - "Projects" became "Spaces" and "Issues" became "Work items". Sources word the item name slightly differently ("work" vs "work items").
  - Users reported inconsistent labels during the rollout, e.g. some Create buttons still said "Project".
  - Sources: [UC Today](https://www.uctoday.com/project-management/jira-projects-are-now-spaces-atlassian-says-its-clarity-users-arent-so-sure/); [Deiser](https://blog.deiser.com/en/atlassian-changes-jira-project-to-jira-space); [Atlassian Community "Words are hard"](https://community.atlassian.com/forums/Jira-Cloud-Admins-articles/Words-are-hard-rebranding-fun-with-Atlassian/ba-p/3071027)
- Free plan features (third-party summary, July 2026):
  - Unlimited spaces/projects, the full set of views, reports, dashboards and the mobile apps. Project- and issue-level permissions are not included.
  - Standard adds user roles and permissions.
  - Premium adds cross-project dependency management.
  - Enterprise adds Atlassian Analytics, Data Lake and Atlassian Guard Standard (multiple IdPs, SCIM, enforced SSO), plus up to 150 sites.
  - Source: [resolution.de pricing guide, 2026-07-31](https://www.resolution.de/post/jira-pricing-plans/)

**Long-standing core features (from background knowledge; NOT re-verified this session)**

The list below describes standard, long-established Jira functionality. The URLs are Atlassian's canonical pages but were not fetched today, so treat the details as unverified.
- Work types: Epic, Story, Task, Bug, Sub-task, plus custom types. Hierarchy is extended above Epic in Premium/Plans. — [Atlassian Jira features](https://www.atlassian.com/software/jira/features)
- Workflows: configurable statuses and transitions with conditions, validators and post-functions. Company-managed spaces use shared schemes. Team-managed spaces have simpler per-space configuration. — [Atlassian Jira features](https://www.atlassian.com/software/jira/features)
- Scrum boards (sprints, backlog, velocity and burndown reports) and Kanban boards (WIP limits, cumulative flow). Timeline/roadmap view on all plans; advanced cross-team planning ("Plans", formerly Advanced Roadmaps) in Premium+. — [Atlassian Jira features](https://www.atlassian.com/software/jira/features)
- JQL, the Jira Query Language, for advanced search, filters and dashboard gadgets. The Summer 2026 release confirms JQL plus natural-language search in the List view. — [Atlassian summer release](https://www.atlassian.com/blog/development/jira-summer-release)
- Automation: a no-code trigger, condition and action rule builder. Usage is metered per plan (see Pricing). — [Atlassian automation usage docs](https://support.atlassian.com/cloud-automation/docs/how-is-my-usage-calculated/)
- Permissions: permission schemes, issue-security schemes, notification schemes, project roles. Reviewers say these are complex (see Complaints).
- Integrations:
  - Development panel showing branches, commits, PRs and builds from Bitbucket, GitHub and GitLab.
  - Slack and Microsoft Teams apps, Confluence linking.
  - Atlassian Marketplace with thousands of apps; the Forge and Connect app platforms.
  - REST API and webhooks.
  - iOS and Android apps.

### Inferences
- Jira's 2025-2026 roadmap has two goals: fixing its biggest complaints (speed, inconsistent views, setup burden through AI-generated spaces) and repositioning Jira as the "system of record" where humans and AI agents both get assigned work. A smaller competitor that offers fast, simple tracking is now competing against a Jira that is actively attacking its own speed and setup reputation.
- The "projects → spaces, issues → work items" rename and the JWM merger show Atlassian pushing Jira beyond engineering into general business work, the territory of Monday, ClickUp and Asana.

### Gaps
- Six of the 15 summer-release capabilities are detailed in the cited post. The other nine (the post itself says seven are undescribed) were not found.
- I did not confirm which AI features need Premium or Enterprise versus being on all paid tiers, beyond the per-tier Rovo credit allowances.
- No primary Atlassian page was fetched for the July 15 coding-agent launch, and the GA or beta status of Agents in Jira is still contested.
- No mobile-app feature parity or rating data was gathered.

## Pricing tiers, limits and notable 2024-2026 changes

### Takeaway
After the 13 Oct 2026 increase, the official example rates for Jira Cloud on monthly billing are Standard **$9.70/user/month** and Premium **$19.60/user/month** for users 1-100, with lower rates at higher seat bands. Free stays at 10 users. Enterprise is sales-led and annual-only. From 3 Dec 2026, Atlassian bills automation and Rovo usage above included allowances (overage is on by default). Server reached end of support in Feb 2024, Data Center sales to new customers ended in March 2026, and Data Center end-of-life is set for **28 March 2029**.

### Cited Findings
**Seat prices**
- The new list prices take effect 13 Oct 2026 PT for Jira Standard, Premium and Enterprise. Atlassian's example: Jira Cloud Standard with 450 users on monthly billing is $9.70/user for users 1-100, $8.20/user for 101-250 and $6.85/user for 251-450, a total of $3,570/month. — [Atlassian list price FAQ](https://www.atlassian.com/licensing/future-pricing/cloud/list/faqs)
- Annual billing example: Jira Standard with 480 users is billed at the 500-user tier, $39,000/year. — same source
- Renewals on or after 13 Oct 2026 pay the new list price. — same source
- Before 13 Oct the 1-100 user rates were Standard $9.05 and Premium $18.30. They are now $9.70 and $19.60, about 7%. Breeze reports roughly +7% for organisations under 5,000 seats and about +10% above (that split comes from a search snippet). Breeze is a competitor and discloses it. — [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026)
- **Conflict:** resolution.de (31 Jul 2026) lists Standard at $7.91 and Premium at $14.54/user/month "monthly billing". That contradicts Breeze's $9.05/$18.30 pre-October figures. The $7.91/$14.54 numbers may be stale or average-rate figures. Use Atlassian's official $9.70 (1-100 users, post-Oct 2026) as authoritative. — [resolution.de](https://www.resolution.de/post/jira-pricing-plans/); [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026)
- Enterprise: contact sales, annual only. Breeze says "from 801 users". — [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026)

**Free plan limits**
- Free: $0 for up to 10 users, 2 GB storage, community support only, 100 email notifications per day, 1 site. — [resolution.de](https://www.resolution.de/post/jira-pricing-plans/)
- No Rovo credit allowance on Free. — [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026)

**Plan limits and support**
- Storage: 250 GB on Standard, unlimited on Premium and Enterprise. — [resolution.de](https://www.resolution.de/post/jira-pricing-plans/)
- User cap: 100,000 on paid tiers. — same source
- Support response times:
  - Standard: 9/5, 2-hour critical response.
  - Premium: 24/7, 1-hour critical response.
  - Enterprise: 30-minute critical response plus a phone line.
  - Source: same source

**Usage-based billing from 3 Dec 2026 (announced 1 Sep 2026)**
- Usage above included allowances is billed separately. Overage is ON by default, and admins can cap it, disable it, or set alerts at 80% and 100%. — [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026), citing [Atlassian blog: expanded usage-based pricing](https://www.atlassian.com/blog/company-news/expanded-usage-based-pricing)
- Automation steps (monthly, pooled):
  - Free: 150 per subscription.
  - Standard: 400 per user.
  - Premium: 750 per user.
  - Enterprise: 1,000 per user.
  - Overage: $0.50 per 1,000 steps.
  - Source: [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026)
  - **Conflict:** resolution.de (July 2026) gives the older model: Free 100 runs per month, Standard 1,700 runs per month, Premium 1,000 runs per user per month, Enterprise unlimited. This looks like the pre-December model. — [resolution.de](https://www.resolution.de/post/jira-pricing-plans/)
- Rovo credits (monthly, pooled, non-rolling):
  - Standard: 25 per user.
  - Premium: 70 per user.
  - Enterprise: 150 per user.
  - Overage: $0.01 per credit.
  - A basic chat costs about 10 credits. Premium features use variable credits that Atlassian does not publish.
  - Sources: [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026); [Atlassian Rovo usage limits](https://support.atlassian.com/rovo/docs/rovo-usage-limits/)

**Deployment end-of-life**
- Server: end of support on 15 Feb 2024 for Jira Software, Jira Core, JSM, Confluence, Bitbucket, Crowd and Bamboo Server. — [Atlassian Server end of support](https://www.atlassian.com/licensing/server-end-of-support)
- Data Center end-of-life (announced Sep 2025):
  - 30 Mar 2026: no new DC subscriptions or Marketplace DC apps for new customers.
  - 30 Mar 2028: existing customers can no longer buy new subscriptions, expansions, upgrades or DC apps.
  - 28 Mar 2029: end of life. Products become read-only.
  - Affected: Jira Software DC, JSM DC, Confluence DC, Crowd DC. Not affected: Bitbucket DC, Bamboo DC and Jira Align DC.
  - Source: [Atlassian Data Center end of life](https://www.atlassian.com/licensing/data-center-end-of-life)
- Atlassian states that "the per user cost of cloud is higher than Data Center". Migration incentives include a 10-20% first-year discount on Cloud Enterprise for purchases by June 2027, plus dual licensing. — same source

### Inferences
- A 10-user team pays $0 on Free. A 20-user team on Standard pays about $194/month ($9.70 × 20) at the 1-100 monthly rate. Premium roughly doubles the per-seat cost.
- Two separate cost-at-scale shocks hit in late 2026: list prices rose, and metered automation and AI overage became default-on. Both feed the "cost at scale" complaint, and the forced move from Data Center to Cloud adds a third for self-hosted customers.
- The pressure is greatest on regulated or self-hosted organisations that dislike being forced to Cloud. Such buyers might accept a competitor that can be self-hosted, but that is outside this research's evidence.

### Gaps
- I could not render the official Atlassian pricing page (the fetch was truncated). The Premium 1-100 rate of $19.60 comes from Breeze and search snippets, not from an Atlassian page fetched today.
- The exact Enterprise per-user price and the official minimum seat count were not verified.
- The uptime SLA per tier (historically 99.9% Premium and 99.95% Enterprise) was not verified this session.
- Data Center pricing changes in 2024-2026 were not covered by any source fetched.

## Who uses it and why; market share signals

### Takeaway
Jira is the default tracker for software teams at mid-size and large companies and in regulated industries. It is bought through IT/procurement within the Atlassian suite. Atlassian is large and still growing: FY26 revenue was $6.57B, up 26%, with 350k+ customers. But third-party signals show Jira's share of new adopters shrinking, especially among small tech startups, where Linear is closing the gap.

### Cited Findings
- FY2026 (ended June 2026):
  - Revenue $6,572M, up 26%.
  - Q4 cloud revenue $1,213M, up 31% YoY.
  - Subscription ARR $6,606M, up 23%.
  - Source: [Atlassian Q4 FY26 earnings release](https://s206.q4cdn.com/270053503/files/doc_financials/2026/q4/TEAM-Q4-2026-Earnings-Release.pdf)
- Q2 FY26: first $1B cloud revenue quarter. Atlassian crossed 350,000 customers, and Rovo passed 5M MAU. — [Atlassian investors, Q2 FY26](https://investors.atlassian.com/news/news-details/2026/Atlassian-Announces-Second-Quarter-Fiscal-Year-2026-Results)
- Bloomberry technographics (1M sampled domains, Feb 2025-Apr 2026, updated 5 May 2026):
  - New companies adopting Jira fell from 2,225 (Feb-Apr 2025) to 1,524 (Feb-Apr 2026), down 32% YoY.
  - Linear rose from 807 to 1,351 (up 67%).
  - Atlassian SSO/org rollouts were roughly flat (+4%), suggesting existing customers are still expanding.
  - Source: [Bloomberry](https://bloomberry.com/blog/the-data-on-jira-vs-linear-whos-winning-new-customers/)
- Bloomberry customer segments:
  - Linear: 72.6% of customers have 11-200 employees, and 45.6% have 11-50.
  - Jira: skews larger (5.1% at 1,001-5,000 employees vs Linear's 2.8%), and toward post-IPO and PE-backed companies and regulated sectors (medical devices, biotech, insurance).
  - Jira customers are more sales-led (demo-CTA-to-pricing ratio 2.32x vs 1.54x).
  - Source: same source
- Monday.com's new-company detections fell 41% YoY in the same dataset. — same source
- Ramp spend data (June 2026): 50% of Ramp customers with a project-management vendor use Jira, down 2 percentage points YoY. — [Ramp vendor page](https://ramp.com/vendors/jira)
- WMTips web-tech detection: Jira leads the US at 27.7%, ahead of Smartsheet at 25.9% and Trello at 9.7%. This measures websites using the tool, not seats. — [WMTips](https://www.wmtips.com/technologies/project-management/country/us/)
- PeerSpot mindshare in project-management software was 3.9% in May 2026, down from 9.2% a year earlier. This measures user engagement, not sales. — [PeerSpot](https://origin.peerspot.com/products/jira)
- Jira serves marketing, HR, legal and operations as well as engineering, and pairs with Confluence for documentation. Teams that switch to Linear cite the loss of Jira's reporting and cross-functional reach as reasons to hesitate. — [ClickUp blog (vendor)](https://clickup.com/blog/linear-vs-jira/)

### Inferences
- Why organisations pick Jira:
  - Depth and configurability: workflows, JQL and reporting.
  - The Atlassian suite: Confluence, JSM and Bitbucket.
  - The Marketplace ecosystem.
  - Enterprise admin and compliance features.
  - Familiarity: it is the industry default, which shows up as procurement inertia.
- New small teams increasingly start elsewhere. Jira's growth is coming from expansion within existing enterprises and from Cloud migration, not from winning new startups.

### Gaps
- Atlassian does not disclose a Jira-only user or customer count in the sources found. The 350k figure covers all Atlassian customers.
- No Gartner or IDC market-share figure for 2025-2026 was found. Market-share numbers vary hugely by method; treat each as a directional signal only.
- An often-repeated "~40% agile PM market share" claim has no traceable methodology, so it is excluded.

## Common complaints and pain points

### Takeaway
Across G2, Capterra, HN and Reddit the complaints are consistent:
1. A steep learning curve and complex customization.
2. Slow performance, especially on large boards.
3. Complex permission and admin schemes that need a dedicated admin.
4. A cluttered UI that overwhelms non-engineers.
5. Rising cost at scale.

Many users also blame how their own company configured Jira rather than the tool itself. Overall ratings remain high, around 4.3-4.4 out of 5.

### Cited Findings
- G2: about 4.3/5 across roughly 7,810 reviews. The top "cons" themes are:
  - Steep learning curve and complex customization: about 343 mentions in one snapshot and about 455 in a later one.
  - Slow performance, with lag and delayed ticket transitions on overloaded boards: about 325 mentions.
  - Snippets quote users saying the interface "can be disorienting for beginners".
  - Counts vary between snapshots, and the page returned 403, so these figures come from search snippets.
  - Sources: [G2 Jira reviews](https://g2.com/products/jira/reviews?page=4); [G2 review page](https://g2.com/survey_responses/jira-review-7693413)
- Capterra: about 15,483 reviews, 4.4/5, about 91% positive sentiment (snippet). Reviewer quotes include:
  - "setup is complex and not beginner friendly. The UI is also overwhelming with too much feature"
  - "complex to set up and slow with large projects"
  - "can feel quite slow to load when you have a large number of active tickets on a single board"
  - Sources: [Capterra Jira reviews](https://www.capterra.com/p/19319/JIRA/reviews/); [Capterra p.3](https://www.capterra.com/p/19319/JIRA/reviews/?page=3)
- Permission schemes are complex. Wrong setup can hide work or grant the wrong access, and fixing it often needs admin expertise (G2 review snippet). — [G2](https://g2.com/products/jira/reviews?page=12)
- Hacker News (recent thread, from a search snippet): "horrendously slow for what it does, the search is mediocre at best, and I regularly run into bugs". Other commenters split between hating Jira and hating their company's configuration. One noted they "love Linear, so it's not general ticket management system hate". — [HN item 49999593](https://news.ycombinator.com/item?id=49999593)
- Older HN threads say hosted Jira is "amazingly slow", and some complain about the number of clicks needed to do anything. These threads are roughly 2015 and old. — [HN 8990990](https://news.ycombinator.com/item?id=8990990); [HN 9973119](https://news.ycombinator.com/item?id=9973119)
- A long-running r/programming thread titled "I f***ing hate Jira" (June 2022, old) shows that developer frustration is longstanding. — [Reddit mirror](https://pol1.lr.ggtyler.dev/r/programming/comments/vgvt3m/i_fucking_hate_jira/id4rtp2/?context=3)
- An analysis of Reddit discussions found "slowness/bloat" the most-cited Jira pain point. The source is vendor or SEO content, so treat it as anecdotal. — [ClickUp blog](https://clickup.com/blog/linear-vs-jira/); [devtools-guide](https://devtools-guide.pages.dev/linear-vs-jira)
- Analysis articles say the most common complaints are about complexity and speed, and that much of the frustration comes from over-configured workflows imposed by management. These are vendor or partner blogs. — [Deviniti](https://deviniti.com/blog/enterprise-software/why-hate-jira/); [Analytics India Mag](https://analyticsindiamag.com/why-developers-hate-jira/)
- Rename confusion: users questioned the clarity of "spaces" and "work items", and labels were inconsistent during the rollout. — [UC Today](https://www.uctoday.com/project-management/jira-projects-are-now-spaces-atlassian-says-its-clarity-users-arent-so-sure/)
- Cost at scale: "your 'cheap' Jira instance can quietly become expensive" once Marketplace apps, higher tiers and the 2026 price rise are added. Atlassian itself says Cloud costs more per user than Data Center. — [Breeze](https://www.breeze.pm/articles/atlassian-pricing-changes-2026); [Atlassian DC EOL page](https://www.atlassian.com/licensing/data-center-end-of-life)
- A forced Cloud migration (Data Center EOL in 2029) affects self-hosted and regulated customers. Atlassian plans FedRAMP High and IL5 environments before EOL. — [Atlassian DC EOL](https://www.atlassian.com/licensing/data-center-end-of-life)
- Atlassian's own Summer 2026 release claims load-time gains of 22-48%. That is an implicit admission that performance was a pain point. — [Atlassian summer release](https://www.atlassian.com/blog/development/jira-summer-release)

### Inferences
- The complaints cluster into four themes:
  - Time-to-value: setup and learning curve.
  - Speed: page loads and large boards.
  - Admin burden: schemes and permissions.
  - Non-engineer UX: clutter and jargon.
- A smaller app can win on all four if it keeps sensible defaults and fast UI, but it must not lose reporting depth, which is the main reason teams return to Jira.
- High aggregate ratings alongside loud developer complaints suggest a split: Jira's buyers and admins (PMs, IT) value its depth, while daily individual contributors feel the friction most.

### Gaps
- Full G2 and Capterra pages could not be fetched (403). Sub-scores (ease of use, ease of setup, ease of admin), segment breakdowns and exact theme counts are unverified.
- TrustRadius data was not gathered.
- No 2026 analyst review (Gartner Peer Insights, Forrester) was retrieved.

## What competitors (Linear, ClickUp, etc.) are praised for vs Jira

### Takeaway
Linear is praised for speed, keyboard-driven UX, opinionated defaults and consistency across teams. It is winning small and mid-size tech companies quickly. Its weak spots are reporting depth and non-engineering use cases, where Jira (and ClickUp/Monday) remain stronger.

### Cited Findings
- Linear's share of new adopters grew 67% YoY to 1,351 companies versus Jira's 1,524 (Feb-Apr 2026). The author projects Linear could overtake Jira in new-company adoption "within a quarter or two"; that is a projection, not a fact. — [Bloomberry](https://bloomberry.com/blog/the-data-on-jira-vs-linear-whos-winning-new-customers/)
- Reasons teams cite for switching to Linear:
  - Speed. One comparison claims under 50 ms to open an issue in Linear versus 500 ms to 2 s in Jira, with no stated methodology.
  - Smart defaults that "work for most teams out of the box", versus Jira's complex configuration.
  - Sources: [devtools-guide](https://devtools-guide.pages.dev/linear-vs-jira); [GitScrum docs](https://docs.gitscrum.com/en/how-to/linear-jira-migration-comparison)
- Consistency: a Linear customer (a Chief Quality Officer) said of Jira that "there was no consistency across teams in how they were using it". This is a vendor page. — [Linear switch page](https://linear.app/switch)
- An HN debate summary says the crowd "leans heavily toward Linear for speed and design, but seasoned PMs and larger teams admit Jira's depth is hard to beat". This is a vendor blog. — [ONES blog](https://ones.com/blog/linear-vs-jira-hacker-news-6-surprising-opinions-from-devs/)
- Counterpoints:
  - PMs in r/ProductManagement complain about losing Jira's reporting after switching.
  - ClickUp argues Linear "stripped out the reporting".
  - Linear has no Confluence-equivalent documentation layer.
  - Source: [ClickUp blog (vendor)](https://clickup.com/blog/linear-vs-jira/)
- Cost: one post compares Linear's 10-user plan at about $840/year with Jira at about $1,200/year. Unverified, and these figures predate the Oct 2026 increase. — [dev.to](https://dev.to/pickuma/linear-vs-jira-why-developer-teams-are-switching-in-2026-4c71)
- Several dev.to posts claiming precise velocity or meeting-time gains cite version numbers that do not exist (e.g. "Jira 10.0/11.0", "Linear 2.0") and unverifiable "Gartner 2026" figures. They are **excluded as unreliable**. — e.g. [dev.to example](https://dev.to/johalputt/why-linear-20-is-mandatory-for-high-growth-startups-in-2026-vs-jira-100-case-study-o10)

### Inferences
- The positioning gap open to a smaller work-management app:
  - Jira-grade structure (workflows, sprints, search) with Linear-grade speed and defaults.
  - Better usability for non-engineers than either.
  - Predictable pricing with no metered automation or AI overage. This contrasts with Jira's new default-on usage billing.
- ClickUp's and Monday's pitch against Jira is breadth and ease for business teams. Specific praise for ClickUp and Monday versus Jira was not researched in depth here; the Monday note above is adoption data only.

### Gaps
- No independent, methodologically sound benchmark comparing Jira and Linear performance was found.
- ClickUp, Asana and Monday praise relative to Jira was not covered by primary or independent review data in this session.
- Linear's current 2026 pricing was not verified from linear.app.
