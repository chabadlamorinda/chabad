// The kinds of emails people can choose on top of the weekly email (the default): each is a set of event categories
// (events.json "category"). When an event in a chosen kind is on the website, the person gets one email about it.
'use strict';
const TOPICS = [
  { id: 'kids', label: "Children's events", cats: ['kids', 'family'] },
  { id: 'teens', label: 'Teen events', cats: ['teens'] },
  { id: 'women', label: "Women's events", cats: ['women'] },
  { id: 'men', label: "Men's events", cats: ['men'] },
  { id: 'holidays', label: 'Holiday celebrations', cats: ['holiday'] },
  { id: 'classes', label: 'Classes and lectures', cats: ['class'] },
  { id: 'shabbat', label: 'Shabbat dinners and Shabbat events', cats: ['shabbat'] },
  { id: 'seniors', label: 'Events for seniors', cats: ['seniors'] },
  { id: 'community', label: 'Community events', cats: ['community'] },
];
const IDS = new Set(TOPICS.map((x) => x.id));
// A clean comma list of known kinds from whatever was sent (an array or "a,b").
const cleanTopics = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter((x) => IDS.has(x)))];
const topicsOfEvent = (e) => TOPICS.filter((x) => x.cats.includes(e.category)).map((x) => x.id);
module.exports = { TOPICS, cleanTopics, topicsOfEvent };
