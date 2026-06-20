/* One Click Dub popup.js — integrated voice options update
 * Fast: two voices per language (male/female) + preview.
 * Quality/Pro: auto clone video voice OR four ready reference voices + preview.
 */

const OCD_EDGE_VOICES_BY_LANG = {
  ar: [
    { id: 'ar-SA-HamedNeural', label: 'ذكر — Hamed' },
    { id: 'ar-SA-ZariyahNeural', label: 'أنثى — Zariyah' },
  ],
  en: [
    { id: 'en-US-RogerNeural', label: 'Male — Roger' },
    { id: 'en-US-JennyNeural', label: 'Female — Jenny' },
  ],
  fr: [
    { id: 'fr-FR-HenriNeural', label: 'Homme — Henri' },
    { id: 'fr-FR-DeniseNeural', label: 'Femme — Denise' },
  ],
  es: [
    { id: 'es-ES-AlvaroNeural', label: 'Hombre — Alvaro' },
    { id: 'es-ES-ElviraNeural', label: 'Mujer — Elvira' },
  ],
  de: [
    { id: 'de-DE-ConradNeural', label: 'Männlich — Conrad' },
    { id: 'de-DE-KatjaNeural', label: 'Weiblich — Katja' },
  ],
  it: [
    { id: 'it-IT-DiegoNeural', label: 'Uomo — Diego' },
    { id: 'it-IT-ElsaNeural', label: 'Donna — Elsa' },
  ],
  pt: [
    { id: 'pt-BR-AntonioNeural', label: 'Masculino — Antonio' },
    { id: 'pt-BR-FranciscaNeural', label: 'Feminino — Francisca' },
  ],
  ru: [
    { id: 'ru-RU-DmitryNeural', label: 'Мужской — Dmitry' },
    { id: 'ru-RU-SvetlanaNeural', label: 'Женский — Svetlana' },
  ],
  tr: [
    { id: 'tr-TR-AhmetNeural', label: 'Erkek — Ahmet' },
    { id: 'tr-TR-EmelNeural', label: 'Kadın — Emel' },
  ],
  hi: [
    { id: 'hi-IN-MadhurNeural', label: 'पुरुष — Madhur' },
    { id: 'hi-IN-SwaraNeural', label: 'महिला — Swara' },
  ],
  ja: [
    { id: 'ja-JP-KeitaNeural', label: '男性 — Keita' },
    { id: 'ja-JP-NanamiNeural', label: '女性 — Nanami' },
  ],
  ko: [
    { id: 'ko-KR-InJoonNeural', label: '남성 — InJoon' },
    { id: 'ko-KR-SunHiNeural', label: '여성 — SunHi' },
  ],
  zh: [
    { id: 'zh-CN-YunxiNeural', label: '男声 — Yunxi' },
    { id: 'zh-CN-XiaoxiaoNeural', label: '女声 — Xiaoxiao' },
  ],
};

const OCD_READY_SAMPLE_VOICES = [
  { id: 'auto-clone-video', label: 'استنساخ صوت الفيديو' },
  { id: 'ocd-orion-male', label: 'أوريون — صوت رجالي عميق', sample: 'voice_samples/ready/ocd-orion-male.mp3' },
  { id: 'ocd-salem-male', label: 'سالم — صوت رجالي دافئ', sample: 'voice_samples/ready/ocd-salem-male.mp3' },
  { id: 'ocd-lina-female', label: 'لينا — صوت نسائي ناعم', sample: 'voice_samples/ready/ocd-lina-female.mp3' },
  { id: 'ocd-noura-female', label: 'نورا — صوت نسائي واضح', sample: 'voice_samples/ready/ocd-noura-female.mp3' },
];

const SAMPLE_TEXTS = {
  ar: 'مرحبًا، هذه عينة قصيرة من صوت الدبلجة.',
  en: 'Hello, this is a short dubbing voice sample.',
  fr: 'Bonjour, ceci est un court exemple de voix.',
  es: 'Hola, esta es una breve muestra de voz.',
  de: 'Hallo, dies ist eine kurze Sprachprobe.',
  it: 'Ciao, questo è un breve campione vocale.',
  pt: 'Olá, esta é uma pequena amostra de voz.',
  tr: 'Merhaba, bu kısa bir ses örneğidir.',
  hi: 'नमस्ते, यह एक छोटी आवाज़ का नमूना है।',
  ja: 'こんにちは、これは短い音声サンプルです。',
  ko: '안녕하세요, 짧은 음성 샘플입니다.',
  zh: '你好，这是一个简短的语音示例。',
};

function ocdShortLang(value) {
  const raw = String(value || 'ar').trim().toLowerCase().replace('_', '-');
  if (raw.startsWith('zh')) return 'zh';
  return raw.split('-')[0] || 'ar';
}

function ocdNormalizeModel(value) {
  const model = String(value || 'fast').trim().toLowerCase();
  if (model.includes('pro') || model.includes('fish')) return 'pro';
  if (model.includes('quality') || model.includes('omni')) return 'quality';
  return 'fast';
}

function byId(id) {
  return document.getElementById(id);
}

function ocdGetState() {
  return {
    sourceLanguage: byId('sourceLanguage')?.value || 'auto',
    targetLanguage: byId('targetLanguage')?.value || 'ar',
    dubbingLanguage: byId('targetLanguage')?.value || 'ar',
    modelName: ocdNormalizeModel(byId('modelName')?.value || 'fast'),
    voiceName: byId('voiceName')?.value || 'ar-SA-HamedNeural',
  };
}

function ocdVoiceOptionsFor(model, targetLang) {
  if (model === 'fast') {
    return OCD_EDGE_VOICES_BY_LANG[targetLang] || OCD_EDGE_VOICES_BY_LANG.en;
  }
  return OCD_READY_SAMPLE_VOICES;
}

function ocdRenderVoiceOptions(preferredVoice = '') {
  const voiceSelect = byId('voiceName');
  if (!voiceSelect) return;

  const model = ocdNormalizeModel(byId('modelName')?.value || 'fast');
  const targetLang = ocdShortLang(byId('targetLanguage')?.value || 'ar');
  const previous = preferredVoice || voiceSelect.value;
  const options = ocdVoiceOptionsFor(model, targetLang);

  voiceSelect.innerHTML = '';
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    if (opt.sample) option.dataset.sample = opt.sample;
    voiceSelect.appendChild(option);
  }

  if ([...voiceSelect.options].some(o => o.value === previous)) {
    voiceSelect.value = previous;
  } else {
    voiceSelect.value = options[0]?.id || '';
  }

  const help = byId('ocdVoiceHelp');
  if (help) {
    help.textContent = model === 'fast'
      ? 'Fast يعرض صوت ذكر وصوت أنثى حسب لغة الدبلجة. المعاينة هنا من المتصفح وليست Edge TTS الحقيقي.'
      : 'Quality وPro: اختر استنساخ صوت الفيديو أو أحد الأصوات الجاهزة الأربعة. ضع عينات MP3 داخل voice_samples/ready للمعاينة.';
  }

  ocdSaveSettings();
}

async function ocdSaveSettings() {
  const state = ocdGetState();
  try {
    await chrome.storage.sync.set(state);
  } catch (error) {
    console.warn('[OCD] could not save settings', error);
  }
  return state;
}

async function ocdLoadSettings() {
  let saved = {};
  try {
    saved = await chrome.storage.sync.get({
      sourceLanguage: 'auto',
      targetLanguage: 'ar',
      dubbingLanguage: 'ar',
      modelName: 'fast',
      voiceName: 'ar-SA-HamedNeural',
    });
  } catch {}

  if (byId('sourceLanguage')) byId('sourceLanguage').value = saved.sourceLanguage || 'auto';
  if (byId('targetLanguage')) byId('targetLanguage').value = saved.targetLanguage || saved.dubbingLanguage || 'ar';
  if (byId('modelName')) byId('modelName').value = ocdNormalizeModel(saved.modelName || 'fast');
  ocdRenderVoiceOptions(saved.voiceName || '');
}

async function ocdPlaySelectedVoiceSample() {
  const state = ocdGetState();
  const voiceSelect = byId('voiceName');
  const selected = voiceSelect?.selectedOptions?.[0];

  if (state.voiceName === 'auto-clone-video') {
    alert('هذا الخيار يستنسخ صوت الفيديو عند بدء الدبلجة، لذلك لا توجد عينة ثابتة قبل اختيار فيديو.');
    return;
  }

  const samplePath = selected?.dataset?.sample;
  if (samplePath) {
    try {
      const audio = new Audio(chrome.runtime.getURL(samplePath));
      await audio.play();
      return;
    } catch (error) {
      console.warn('[OCD] ready voice sample missing, fallback to browser speech', error);
      alert('لم أجد ملف العينة داخل الإضافة. ضع ملف MP3 داخل voice_samples/ready بنفس الاسم، وسأشغل معاينة مؤقتة من المتصفح الآن.');
    }
  }

  try {
    speechSynthesis.cancel();
    const lang = ocdShortLang(state.targetLanguage);
    const text = SAMPLE_TEXTS[lang] || SAMPLE_TEXTS.en;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'zh' ? 'zh-CN' : lang;

    const isFemale = /female|woman|أنثى|زريّة|Zariyah|Jenny|Denise|Elvira|Katja|Elsa|Francisca|Svetlana|Emel|Swara|Nanami|SunHi|Xiaoxiao/i.test(selected?.textContent || '');
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang?.toLowerCase().startsWith(lang) && (isFemale ? /female|woman|zira|susan|sara|female/i.test(v.name) : /male|man|david|mark|male/i.test(v.name)))
      || voices.find(v => v.lang?.toLowerCase().startsWith(lang));
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('[OCD] voice preview failed', error);
  }
}

function ocdFlashSaved() {
  document.body.animate(
    [
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.18)' },
      { filter: 'brightness(1)' },
    ],
    { duration: 420, easing: 'ease-out' }
  );
}

function ocdBindPopupEvents() {
  document.querySelector('.toggle')?.addEventListener('click', event => {
    event.currentTarget.classList.toggle('on');
    ocdSaveSettings();
  });

  document.querySelector('.panel-close')?.addEventListener('click', () => window.close());

  byId('sourceLanguage')?.addEventListener('change', ocdSaveSettings);
  byId('targetLanguage')?.addEventListener('change', () => ocdRenderVoiceOptions());
  byId('modelName')?.addEventListener('change', () => ocdRenderVoiceOptions());
  byId('voiceName')?.addEventListener('change', ocdSaveSettings);
  byId('ocdVoicePreviewButton')?.addEventListener('click', ocdPlaySelectedVoiceSample);

  document.querySelector('.primary-cta')?.addEventListener('click', async () => {
    await ocdSaveSettings();
    ocdFlashSaved();
    const btn = document.querySelector('.primary-cta');
    if (btn) {
      const old = btn.childNodes[0]?.textContent || '';
      btn.childNodes[0].textContent = 'تم حفظ الإعدادات ';
      setTimeout(() => { if (btn.childNodes[0]) btn.childNodes[0].textContent = old || 'حفظ الإعدادات '; }, 1100);
    }
  });
}

async function ocdInitPopup() {
  ocdBindPopupEvents();
  await ocdLoadSettings();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ocdInitPopup);
} else {
  ocdInitPopup();
}
