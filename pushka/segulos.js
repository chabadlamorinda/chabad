// Segulos, prayers and customs for the Pushka app.
// These are traditional customs and sources of inspiration, not guarantees.
// Texts are included for convenience: please have the Rabbi review everything before relying on it.

const SEG_CATS = ["Livelihood", "Health & Healing", "Protection & Travel", "Family & Children", "Finding a Match", "Peace of Mind", "Home & Blessing", "Holidays & Seasons"];
const SEG_FEATURED = ["quotes", "derech", "bless-children", "modeh-ani", "tehillim-daily"];
const SEF = (p) => "https://www.sefaria.org/" + p;

const SEGULOS = [
  // ---------- featured ----------
  { id: "quotes", kind: "quotes", cat: "Peace of Mind", title: "Selected Quotes from the Rebbe", blurb: "Short teachings and sayings of the Lubavitcher Rebbe on giving, goodness and joy." },
  { id: "derech", kind: "text", cat: "Protection & Travel", title: "Traveler’s Prayer (Tefillas HaDerech)",
    blurb: "Said once at the start of a journey, after leaving the city, whether you travel by car, plane or train. It asks Hashem for a safe, peaceful trip. Ask the Rabbi about the details of when to say it on short trips.",
    how: ["Say it after you set out, once you are on your way.", "It is said in the plural, even if you travel alone.", "Before you go, give tzedakah — see “Give tzedakah before you travel.”"],
    he: "יְהִי רָצוֹן מִלְּפָנֶיךָ ה' אֱלֹהֵינוּ וֵאלֹהֵי אֲבוֹתֵינוּ, שֶׁתּוֹלִיכֵנוּ לְשָׁלוֹם, וְתַצְעִידֵנוּ לְשָׁלוֹם, וְתַדְרִיכֵנוּ לְשָׁלוֹם, וְתִסְמְכֵנוּ לְשָׁלוֹם, וְתַגִּיעֵנוּ לִמְחוֹז חֶפְצֵנוּ לְחַיִּים וּלְשִׂמְחָה וּלְשָׁלוֹם. וְתַצִּילֵנוּ מִכַּף כָּל אוֹיֵב וְאוֹרֵב וְלִסְטִים וְחַיּוֹת רָעוֹת בַּדֶּרֶךְ, וּמִכָּל מִינֵי פֻּרְעָנֻיּוֹת הַמִּתְרַגְּשׁוֹת לָבוֹא לָעוֹלָם. וְתִשְׁלַח בְּרָכָה בְּמַעֲשֵׂה יָדֵינוּ, וְתִתְּנֵנוּ לְחֵן וּלְחֶסֶד וּלְרַחֲמִים בְּעֵינֶיךָ וּבְעֵינֵי כָל רוֹאֵינוּ, וְתִשְׁמַע קוֹל תַּחֲנוּנֵינוּ, כִּי אֵל שׁוֹמֵעַ תְּפִלָּה וְתַחֲנוּן אָתָּה. בָּרוּךְ אַתָּה ה', שׁוֹמֵעַ תְּפִלָּה.",
    en: "May it be Your will, Lord our G‑d and G‑d of our fathers, that You lead us in peace, direct our steps in peace, guide us in peace, and support us in peace, and bring us to our desired destination for life, joy and peace. Save us from every enemy and ambush, from robbers and wild beasts on the way, and from all kinds of punishments that assail the world. Send blessing in our handiwork, and grant us grace, kindness and mercy in Your eyes and in the eyes of all who see us. Hear the voice of our supplications, for You are a G‑d Who hears prayer and supplication. Blessed are You, Lord, Who hears prayer.",
    src: "Berachos 29b–30a; Siddur", act: ["coin"] },
  // ---------- livelihood ----------
  { id: "maaser", cat: "Livelihood", title: "Give maaser — a tenth", blurb: "The Talmud teaches “Aser te’aser — give a tenth so that you will become wealthy” (Taanis 9a). Hashem even invites us to test this: “Bring the full tithe… and test Me in this” (Malachi 3:10). Many set aside a tenth of their income for tzedakah as soon as it arrives.",
    how: ["Work out a tenth of what you earned.", "Set it aside right away — in your pushka, or give it directly."], he: "עשר תעשר — עשר בשביל שתתעשר", en: "“Give a tenth — give a tenth so that you will become wealthy.”", src: "Taanis 9a; Malachi 3:10", act: ["maaser"] },
  { id: "daily-tzedakah", cat: "Livelihood", title: "Give tzedakah every day", blurb: "Give a coin to tzedakah before you pray: the Talmud (Bava Basra 10a) describes giving to the poor and then praying, based on “I will behold Your face in righteousness” (Psalm 17:15). The Rebbe encouraged every home to have a tzedakah box and to give each day, even a small amount.",
    how: ["Keep your pushka where you will see it each morning.", "Drop a coin before you daven. Many say a short prayer as they give."], src: "Bava Basra 10a", act: ["coin", "reminders"] },
  { id: "before-candles", cat: "Livelihood", title: "Give before lighting candles", blurb: "A widespread custom, encouraged by the Rebbe, is to give tzedakah before lighting Shabbos and Yom Tov candles, bringing blessing into the home for the days ahead. This app reminds you before candle lighting.",
    how: ["Drop a coin in the pushka shortly before candle lighting.", "Turn on “Before Candle Lighting” in Reminders."], src: "Custom", act: ["coin", "reminders"] },
  { id: "parshas-haman", cat: "Livelihood", title: "Parshas HaMan", blurb: "Reading the Torah portion about the manna (Exodus 16:4–36) is a time-honored segulah for sustenance. Many read it on the Tuesday of Parshas Beshalach, and some read it every day after prayer.",
    how: ["Read the passage in Hebrew if you can, or in translation.", "Read it with trust that Hashem provides for each of us."], src: "Exodus 16:4–36; Custom", links: [{ t: "Read on Sefaria", u: SEF("Exodus.16.4-36") }] },
  { id: "shlissel", cat: "Livelihood", title: "Shlissel challah", blurb: "On the Shabbos after Pesach, some bake a challah in the shape of a key, or with a key baked inside, as a prayer that Hashem “unlock” blessings and livelihood for the year ahead.",
    how: ["Bake or shape challah as a key, or press a clean key into the dough.", "Pray for the blessings you need."], src: "Custom" },
  { id: "bentching", cat: "Livelihood", title: "Say Birkas HaMazon with focus", blurb: "Saying Grace After Meals slowly, from a siddur and with concentration, is taught by the Shelah and others as a source of blessing and sustenance.",
    how: ["Use a siddur and say every word.", "Think about Who provides all our food."], src: "Shelah; Custom" },
  { id: "ashrei", cat: "Livelihood", title: "Say Ashrei with intent", blurb: "Ashrei (Psalm 145) includes “You open Your hand and satisfy every living thing.” The Talmud (Berachos 4b) praises one who says it daily, and halacha requires concentrating on this verse.",
    how: ["Say Ashrei slowly.", "Pause on “Posei’ach es yadecha” and think about Hashem’s constant provision."], src: "Berachos 4b; Shulchan Aruch, Orach Chaim 51:7", links: [{ t: "Read Psalm 145", u: SEF("Psalms.145") }] },

  // ---------- health ----------
  { id: "tehillim-refuah", cat: "Health & Healing", title: "Tehillim for healing", blurb: "Psalms commonly recited for the ill include 20, 23, 30, 91, 103 and 121. Say them for the sick person using their Hebrew name and their mother’s Hebrew name — “ben/bas” — and pray with an open heart.",
    how: ["Say the psalms slowly.", "Mention the person’s name and mother’s name.", "Give a little tzedakah in their merit."], src: "Custom",
    links: [20, 23, 30, 91, 103, 121].map((n) => ({ t: "Psalm " + n, u: SEF("Psalms." + n) })), act: ["coin"] },
  { id: "tzedakah-sick", cat: "Health & Healing", title: "Give tzedakah in the merit of someone who is unwell", blurb: "“Tzedakah saves from death” (Proverbs 10:2). It is customary to give tzedakah in the merit of a person who is ill, and to say a short prayer for their full recovery.",
    how: ["Drop a coin and say their name and mother’s name."], he: "וּצְדָקָה תַּצִּיל מִמָּוֶת", en: "“…and tzedakah saves from death.”", src: "Proverbs 10:2", act: ["coin", "give"] },
  { id: "mi-sheberach", cat: "Health & Healing", title: "Mi Sheberach for the ill", blurb: "Ask the Rabbi to say a Mi Sheberach prayer for a healing at the Torah reading. Give the person’s Hebrew name and their mother’s Hebrew name.",
    how: ["Contact the Rabbi with the name before Shabbos or a Monday/Thursday reading."], src: "Custom" },
  { id: "bikur-cholim", cat: "Health & Healing", title: "Visit the sick", blurb: "The Talmud teaches that one who visits the sick removes a part of their suffering and helps them live (Nedarim 39b–40a). A visit, a call or a warm message all count.",
    how: ["Call or visit someone who is unwell.", "Pray for them while you are there."], src: "Nedarim 39b–40a" },
  { id: "pray-others", cat: "Health & Healing", title: "Pray for someone else", blurb: "“One who prays for another, while having the same need, is answered first” (Bava Kamma 92a). Pray for a friend’s health — and your own need may be met too.",
    how: ["Say a short prayer for another person each day."], src: "Bava Kamma 92a" },

  // ---------- protection & travel ----------
  { id: "travel-tzedakah", cat: "Protection & Travel", title: "Give tzedakah before you travel", blurb: "“Those sent on a mitzvah are not harmed” (Pesachim 8b). Before a trip, give coins to be delivered to tzedakah at your destination, so your journey becomes a mission of mitzvah. The Rebbe would hand travelers coins to give to tzedakah where they arrived.",
    how: ["Put coins aside before you leave.", "Give them to a worthy cause when you arrive, and say Tefillas HaDerech on the way."], src: "Pesachim 8b; Custom", act: ["coin"] },
  { id: "tehillim-91", cat: "Protection & Travel", title: "Tehillim 91", blurb: "Psalm 91 — “He who dwells in the shelter of the Most High” — is recited for protection, before sleep and in times of danger.",
    how: ["Say it slowly, in Hebrew if possible."], src: "Custom", links: [{ t: "Read Psalm 91", u: SEF("Psalms.91") }] },
  { id: "bedtime-shema", cat: "Protection & Travel", title: "Bedtime Shema", blurb: "The Talmud (Berachos 5a) teaches that reciting the Shema before sleep helps protect a person through the night. It is part of the siddur’s bedtime service.",
    how: ["Say Shema before bed, with the preceding blessing and prayers in your siddur."], src: "Berachos 5a" },
  { id: "mezuzah", cat: "Protection & Travel", title: "Check your mezuzos and tefillin", blurb: "The mezuzah is said to guard the home from the outside while we live within (Jerusalem Talmud, Peah 1:1). The Rebbe repeatedly urged that mezuzos be checked, especially when trouble arises. Halacha requires checking a home’s mezuzos twice in seven years; tefillin should also be checked.",
    how: ["Ask the Rabbi or a scribe to check every mezuzah and your tefillin.", "Repair or replace any that are not kosher."], src: "Jerusalem Talmud, Peah 1:1; Yoreh Deah 291:1" },

  // ---------- family ----------
  { id: "bless-children", kind: "text", cat: "Family & Children", title: "Bless your children on Friday night", blurb: "On Friday night, parents place their hands on each child’s head and bless them. This is one of the most precious moments of Shabbos.",
    how: ["Place your hands gently on your child’s head.", "Say the opening line for a boy or a girl.", "Then say the Priestly Blessing below."],
    he: "לבן: יְשִׂמְךָ אֱלֹהִים כְּאֶפְרַיִם וְכִמְנַשֶּׁה.\nלבת: יְשִׂמֵךְ אֱלֹהִים כְּשָׂרָה רִבְקָה רָחֵל וְלֵאָה.\n\nיְבָרֶכְךָ ה' וְיִשְׁמְרֶךָ. יָאֵר ה' פָּנָיו אֵלֶיךָ וִיחֻנֶּךָּ. יִשָּׂא ה' פָּנָיו אֵלֶיךָ וְיָשֵׂם לְךָ שָׁלוֹם.",
    en: "For a boy: May G‑d make you like Ephraim and Manasseh.\nFor a girl: May G‑d make you like Sarah, Rebecca, Rachel and Leah.\n\nMay the Lord bless you and guard you. May the Lord shine His face upon you and be gracious to you. May the Lord lift up His face toward you and grant you peace.",
    src: "Genesis 48:20; Numbers 6:24–26; Siddur" },
  { id: "shabbos-candles", cat: "Family & Children", title: "Light Shabbos candles", blurb: "The Rebbe launched a worldwide campaign encouraging women and girls, from the age of three, to light Shabbos candles. A woman’s lighting fills the home with light, peace and blessing. Give tzedakah just before you light.",
    how: ["Light candles 18 minutes before sunset (this app shows the time).", "Drop a coin in the pushka first."], src: "Custom; the Rebbe’s Shabbos Candle campaign", act: ["coin", "reminders"] },
  { id: "hannah", cat: "Family & Children", title: "Hannah’s prayer", blurb: "Hannah’s heartfelt prayer for a child (I Samuel 1–2) is the classic model of prayer for children. It is read as the Haftarah on the first day of Rosh Hashanah.",
    how: ["Read the chapter and pour out your heart in your own words."], src: "I Samuel 1:1–2:10", links: [{ t: "Read on Sefaria", u: SEF("I_Samuel.1") }] },
  { id: "write-rebbe", cat: "Family & Children", title: "Write to the Rebbe", blurb: "It is a Chabad custom to write one’s prayer or question in a letter to the Rebbe, bringing it to his resting place at the Ohel. Many also open a volume of the Rebbe’s letters (Igros Kodesh) after writing, and read the answer they find.",
    how: ["Write your request on paper, beginning with your name and your mother’s name.", "Send or bring it to the Ohel, or ask the Rabbi to help."], src: "Chabad custom" },
  { id: "shalom-bayis", cat: "Family & Children", title: "Shalom bayis — peace in the home", blurb: "The Talmud teaches that when husband and wife are worthy, the Divine Presence rests between them (Sotah 17a). Small acts of kindness and gratitude build the home.",
    how: ["Say one kind word to your spouse today.", "Light Shabbos candles together as a family."], src: "Sotah 17a" },
  { id: "kids-coin", cat: "Family & Children", title: "Let your children drop the coin", blurb: "Inviting children to place coins into the pushka themselves plants a lifelong love of giving. Tap the pushka together each day.",
    how: ["Let your child tap the coin for the day, and say “this is for tzedakah.”"], src: "Chinuch", act: ["coin"] },

  // ---------- match ----------
  { id: "zivug", cat: "Finding a Match", title: "Matches are made in Heaven", blurb: "The Talmud teaches that forty days before a child is formed, a Heavenly voice announces “the daughter of so-and-so is meant for so-and-so” (Sotah 2a). Trust, pray and keep the hope alive.",
    how: ["Say a prayer each day that you will meet your match in a good time.", "Give tzedakah with that intention."], src: "Sotah 2a", act: ["coin"] },
  { id: "pray-match", cat: "Finding a Match", title: "Pray for another person’s match", blurb: "“One who prays for another is answered first” (Bava Kamma 92a). Pray for a friend’s match, and your own prayers will be answered as well.",
    how: ["Name someone each day and ask Hashem to send their zivug."], src: "Bava Kamma 92a" },
  { id: "tu-bav", cat: "Finding a Match", title: "Tu B’Av", blurb: "The Talmud says there were no happier days for the Jewish people than the fifteenth of Av and Yom Kippur, when the young women of Jerusalem went out to the vineyards (Taanis 26b). Tu B’Av is regarded as an especially auspicious day for love and matches.",
    how: ["On the 15th of Av, say a prayer for your match and give tzedakah."], src: "Taanis 26b" },

  // ---------- peace of mind ----------
  { id: "tracht-gut", cat: "Peace of Mind", title: "Tracht gut, vet zein gut", blurb: "“Think good and it will be good.” A teaching of the Tzemach Tzedek, often cited by the Rebbe: positive trust in Hashem changes how we see and experience the situation.",
    how: ["When something worries you, say “Tracht gut, vet zein gut.”", "Think of a time Hashem helped you."], src: "Chassidic teaching" },
  { id: "modeh-ani", kind: "text", cat: "Peace of Mind", title: "Modeh Ani — thank Hashem on waking", blurb: "Say this short prayer of gratitude the moment you wake up, even before washing your hands. It begins the day with thankfulness.",
    how: ["Say it right when you wake, before getting out of bed.", "Teach it to your children."],
    he: "מוֹדֶה אֲנִי לְפָנֶיךָ, מֶלֶךְ חַי וְקַיָּם, שֶׁהֶחֱזַרְתָּ בִּי נִשְׁמָתִי בְּחֶמְלָה, רַבָּה אֱמוּנָתֶךָ.",
    tr: "Modeh (women: Modah) ani lefanecha, Melech chai v’kayam, shehechezarta bi nishmasi b’chemlah, rabbah emunasecha.",
    en: "I gratefully thank You, living and eternal King, for You have returned my soul within me with compassion — abundant is Your faithfulness.", src: "Siddur" },
  { id: "hundred-brachos", cat: "Peace of Mind", title: "Say 100 blessings a day", blurb: "The Talmud teaches that a person should say one hundred blessings each day (Menachos 43b). Between prayers, meals and everyday blessings, it adds up to a day full of gratitude.",
    how: ["Say the daily prayers and blessings before and after food.", "Add a short thank-you to Hashem whenever something good happens."], src: "Menachos 43b" },
  { id: "tehillim-23", cat: "Peace of Mind", title: "Tehillim 23", blurb: "“The Lord is my shepherd, I shall not want.” A psalm of trust and comfort, often said in times of worry or sorrow.",
    how: ["Say it slowly, one verse at a time."], src: "Psalm 23", links: [{ t: "Read Psalm 23", u: SEF("Psalms.23") }] },
  { id: "cast-burden", cat: "Peace of Mind", title: "Cast your burden on Hashem", blurb: "“Cast your burden upon the Lord and He will sustain you” (Psalm 55:23). Hand over what you cannot carry, and do your part with trust.",
    how: ["Say this verse when you feel overwhelmed."], he: "הַשְׁלֵךְ עַל ה' יְהָבְךָ וְהוּא יְכַלְכְּלֶךָ", en: "“Cast your burden upon the Lord and He will sustain you.”", src: "Psalm 55:23" },

  // ---------- home & blessing ----------
  { id: "challah", kind: "text", cat: "Home & Blessing", title: "Separate challah", blurb: "Separating challah when baking is a mitzvah and a time of special blessing. It is customary to pray for your family’s needs while doing it. Ask the Rabbi about the amount of dough required for the blessing.",
    how: ["Take a small piece of dough, about the size of an olive.", "Say the blessing and then say “This is challah.”", "Wrap the piece and dispose of it respectfully."],
    he: "בָּרוּךְ אַתָּה ה' אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ לְהַפְרִישׁ חַלָּה מִן הָעִסָּה.",
    en: "Blessed are You, Lord our G‑d, King of the universe, Who has sanctified us with His commandments and commanded us to separate challah from the dough.", src: "Numbers 15:17–21; Siddur" },
  { id: "new-home", cat: "Home & Blessing", title: "Chanukas HaBayis — a new home", blurb: "When moving into a new home, affix a kosher mezuzah to each doorway and hold a small gathering with words of Torah, a blessing and some food, dedicating the home to a life of goodness.",
    how: ["Have a scribe check or supply kosher mezuzos.", "Invite friends or family for a simple celebration."], src: "Custom" },
  { id: "pushka-home", cat: "Home & Blessing", title: "A pushka in every home", blurb: "The Rebbe encouraged every Jewish home to have a tzedakah box and for everyone, including children, to give daily. This app is your pocket pushka.",
    how: ["Add a pushka for each family member in Settings.", "Give a little every day."], src: "Custom of the Rebbe", act: ["coin"] },
  { id: "hospitality", cat: "Home & Blessing", title: "Welcome guests", blurb: "“Welcoming guests is greater than greeting the Divine Presence” (Shabbos 127a). Invite someone for a Shabbos meal.",
    how: ["Invite a neighbor, a newcomer or someone alone."], src: "Shabbos 127a" },

  // ---------- holidays ----------
  { id: "tehillim-daily", kind: "tehillim", cat: "Holidays & Seasons", title: "Today’s Tehillim", blurb: "The Rebbe encouraged everyone to say the daily portion of Tehillim, which divides all 150 psalms across the days of the Hebrew month.",
    how: ["Say today’s portion, or at least a few verses.", "Read the Hebrew text, or the translation on Sefaria."], src: "Custom of the Rebbe" },
  { id: "high-holidays", cat: "Holidays & Seasons", title: "Teshuvah, Tefillah, Tzedakah", blurb: "On the High Holidays we say that repentance, prayer and tzedakah “remove the severity of the decree” (Unesaneh Tokef). Increase in all three, especially tzedakah.",
    how: ["Give extra tzedakah in Elul and before Yom Kippur."], he: "תְּשׁוּבָה וּתְפִלָּה וּצְדָקָה מַעֲבִירִין אֶת רֹעַ הַגְּזֵרָה", en: "Repentance, prayer and tzedakah remove the severity of the decree.", src: "Unesaneh Tokef", act: ["coin", "give"] },
  { id: "maos-chittim", cat: "Holidays & Seasons", title: "Maos Chittim before Pesach", blurb: "Give tzedakah before Pesach so that every family can celebrate the holiday with dignity.",
    how: ["Give before Pesach, ideally a few weeks ahead."], src: "Shulchan Aruch, Orach Chaim 429", act: ["give"] },
  { id: "matanos", cat: "Holidays & Seasons", title: "Matanos LaEvyonim on Purim", blurb: "On Purim we give gifts to at least two people in need, in addition to tzedakah, so everyone can celebrate.",
    how: ["Give on Purim day to at least two people.", "Give extra to anyone who asks."], src: "Esther 9:22", act: ["give"] },
  { id: "chanukah-gelt", cat: "Holidays & Seasons", title: "Chanukah gelt", blurb: "Giving coins to children on Chanukah is a cherished custom, and a wonderful opportunity to teach them to give tzedakah.",
    how: ["Give each child coins and encourage them to put some in the pushka."], src: "Custom", act: ["coin"] },
];

const REBBE_QUOTES = [
  { q: "Think good and it will be good.", n: "Tracht gut, vet zein gut — a teaching of the Tzemach Tzedek, often cited by the Rebbe." },
  { q: "A little light dispels a great deal of darkness.", n: "A Chassidic teaching the Rebbe often repeated. Every mitzvah is a candle." },
  { q: "Do another mitzvah — one more act of goodness and kindness.", n: "The Rebbe’s constant call: add one more good deed today." },
  { q: "In matters of holiness we go up, we never go down.", n: "Ma’alin bakodesh v’ein moridin (Berachos 28a): always increase in Torah, mitzvos and tzedakah." },
  { q: "Every Jewish home should have a tzedakah box, and every day should include a gift to tzedakah.", n: "Paraphrase of the Rebbe’s encouragement, including for children." },
  { q: "Joy breaks through every barrier.", n: "Simchah poretz geder — a Chassidic teaching, emphasized by the Rebbe." },
];
