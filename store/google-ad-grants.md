# Google Ad Grants plan ($10,000 a month in free search ads)

You already have a Google Ad Grants account. This plan points every ad at a page on the new website that answers exactly what the person searched, in their town. Start it on launch day (ads should send people to chabadoflamorinda.com once it is the new site).

## 1. Before the first ad (one time)
1. **Link Google Analytics and track conversions.** Create a GA4 property for chabadoflamorinda.com and put its id (G-...) in Render as **GA_ID**. The site already reports these actions:
   * `rsvp`: someone RSVP'd to an event
   * `form_submit`: someone sent a registration, order, reservation or sign-up
   In Google Ads → Goals → Conversions, import both from GA4. **Ad Grants requires conversion tracking.**
2. **Location targeting:** Lafayette, Moraga, Orinda, Pleasant Hill and Martinez, California (or a 10-mile radius around 3477 Golden Gate Way). Choose "Presence: people in or regularly in your targeted locations".
3. **Bidding:** "Maximize conversions" (allows bids above the $2 cap).
4. **Ad Grants rules to stay within:**
   * keep a 5% click-through rate across the account (pause keywords below 5%);
   * no single-word keywords (except "Chabad");
   * no very general keywords ("free videos", "today's date");
   * at least 2 ad groups per campaign, 2 ads per group, and 2 sitelinks.

## 2. Campaigns
Each line: **keywords** (phrase match, in quotes) → **page**.

### Campaign A: High Holidays and holidays (turn up before each holiday)
* "rosh hashanah services lafayette", "high holiday services near me", "yom kippur services lamorinda", "free high holiday services east bay" → /holidays/rosh-hashanah and /forms/high-holidays
* "chanukah lafayette", "menorah lighting lafayette", "chanukah events moraga" → /holidays/chanukah
* "passover seder lafayette", "community seder east bay", "shmurah matzah", "sell chametz" → /holidays/passover, /forms/matzah, /forms/sell-chametz
* "purim lafayette", "megillah reading near me" → /holidays/purim
* "sukkot lafayette", "lulav and etrog order" → /holidays/sukkot, /forms/lulav-etrog

### Campaign B: Families and kids
* "jewish preschool lafayette", "preschool moraga", "jewish preschool orinda", "reggio emilia preschool lafayette" → /programs/jewish-preschool and /forms/preschool
* "hebrew school lafayette", "hebrew school moraga", "hebrew school near me", "sunday hebrew school east bay" → /programs/hebrew-school and /forms/hebrew-school
* "bar mitzvah lessons lafayette", "bat mitzvah preparation", "bar mitzvah tutor" → /programs/bar-bat-mitzvah, /forms/bar-bat-mitzvah, /tools/bar-bat-mitzvah
* "jewish summer camp lafayette", "toddler summer camp lafayette" → /programs/summer-camp
* "after school program lafayette", "ckids" → /programs/ckids-afterschool

### Campaign C: Life events (always on; these people need you now)
* "jewish funeral lafayette", "rabbi for funeral east bay", "jewish burial contra costa", "chevra kadisha" → /help/someone-passed-away
* "say kaddish for my father", "kaddish service", "someone to say kaddish" → /kaddish
* "yahrzeit date", "yahrzeit calculator" → /tools/yahrzeit
* "rabbi for wedding lafayette", "jewish wedding officiant east bay" → /help/getting-married
* "bris lafayette", "mohel east bay", "jewish baby naming" → /help/new-baby
* "rabbi hospital visit", "prayer for sick jewish" → /help/someone-is-sick, /tehillim
* "talk to a rabbi", "ask a rabbi" → /help/talk-to-the-rabbi

### Campaign D: Synagogue and Shabbat by town
* "synagogue lafayette ca", "synagogue in moraga", "synagogue orinda", "synagogue pleasant hill", "synagogue martinez ca" → /jewish-lafayette, /jewish-moraga, /jewish-orinda, /jewish-pleasant-hill, /jewish-martinez
* "shabbat services near me", "shabbat dinner lafayette", "candle lighting time lafayette" → /shabbat
* "chabad lafayette", "chabad of lamorinda", "chabad near me" → home page

### Campaign E: Jewish learning (cheap clicks, builds the audience)
* "how to put up a mezuzah", "mezuzah blessing" → /learn/mezuzah
* "how to light shabbat candles", "shabbat candle blessing" → /learn/shabbat-candles
* "what is kosher", "kosher symbols" → /learn/kosher, /learn/kosher-symbols
* "how to sit shiva", "what to say at a shiva" → /learn/shiva
* "tehillim for the sick", "psalms for healing" → /tehillim
* "hebrew date converter", "jewish holidays 2027" → /tools/hebrew-date, /holidays

### Campaign F: Hebrew and Russian speakers
* Hebrew: "בית כנסת לאפייט", "חב״ד באזור סן פרנסיסקו", "גן ילדים יהודי ביי אריה" → /he/...
* Russian: "синагога Лафайетт", "еврейская община Сан-Франциско", "Хабад Калифорния" → /ru/...
Set the campaign language to Hebrew or Russian; the pages already exist at /he/ and /ru/.

## 3. Ad text (example, Campaign D)
* Headline 1: Synagogue in Moraga, Lafayette & Orinda
* Headline 2: Everyone Welcome, No Membership
* Headline 3: Shabbat Services & Kiddush Lunch
* Description 1: Warm, joyful Shabbat services every Saturday at 10 AM, then a hot Kiddush lunch. Come as you are.
* Description 2: Chabad of Lamorinda: Jewish preschool, Hebrew school, classes and holidays. Call 925-384-7242.
* Sitelinks: Shabbat times (/shabbat) · Upcoming events (/events) · Hebrew School (/programs/hebrew-school) · Jewish Preschool (/programs/jewish-preschool)

Ask Claude "write the ads for Campaign B" (or any campaign) and it will write all headlines and descriptions for that campaign.

## 4. Each month
* Look at **Search terms**: add good ones as keywords, add irrelevant ones as negative keywords.
* Pause any keyword under 5% click-through rate after 2 weeks.
* Before each holiday, raise Campaign A, and make sure the holiday's events are on the site with RSVP.
