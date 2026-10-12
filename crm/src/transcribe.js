// Voice notes -> text. Claude reads text and photos but not audio, so voice notes are transcribed
// first with OpenAI's speech-to-text API (set OPENAI_API_KEY). Without a key, voice notes are
// saved but not understood, and the reply says so.
'use strict';

// Words the transcriber would otherwise mishear.
const VOCAB = 'Chabad of Lamorinda, Lafayette, Moraga, Orinda, Walnut Creek, mezuzah, mezuzos, mezuzot, tefillin, Shabbos, Shabbat, tzedakah, pushka, yahrzeit, kiddush, Rosh Hashanah, Yom Kippur, Sukkos, lulav, esrog, Chanukah, Purim, Pesach, matzah, Shavuos, bar mitzvah, bat mitzvah, rebbetzin, Zelle, Venmo, DAF.';

function createTranscriber({ apiKey, model = 'whisper-1', fetchImpl = fetch }) {
  if (!apiKey) return null;
  return async function transcribe(buffer, mime) {
    const ext = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/amr': 'amr', 'video/mp4': 'mp4' }[mime.split(';')[0]] || 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime.split(';')[0] }), `voice.${ext}`);
    form.append('model', model);
    form.append('prompt', VOCAB);
    const r = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (!r.ok) throw new Error(`Transcription failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return String((await r.json()).text || '').trim();
  };
}

module.exports = { createTranscriber };
