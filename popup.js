/* One Click Dub premium popup UI
 * Chrome extension popup only. No frameworks. Keeps existing storage keys:
 * sourceLanguage, targetLanguage, dubbingLanguage, modelName, voiceName,
 * originalVolumeMode, captions, captionStyle, captionSize.
 */

const LANGUAGES = [
  { code: 'auto', name: 'Auto Detect', native: 'Automatic' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'Français', native: 'French' },
  { code: 'es', name: 'Español', native: 'Spanish' },
  { code: 'de', name: 'Deutsch', native: 'German' },
  { code: 'it', name: 'Italiano', native: 'Italian' },
  { code: 'pt', name: 'Português', native: 'Portuguese' },
  { code: 'tr', name: 'Türkçe', native: 'Turkish' },
  { code: 'hi', name: 'हिन्दी', native: 'Hindi' },
  { code: 'ja', name: '日本語', native: 'Japanese' },
  { code: 'ko', name: '한국어', native: 'Korean' },
  { code: 'zh', name: '中文', native: 'Chinese' },
  { code: 'ru', name: 'Русский', native: 'Russian' },
  { code: 'ur', name: 'اردو', native: 'Urdu' },
  { code: 'fa', name: 'فارسی', native: 'Persian' },
  { code: 'id', name: 'Indonesia', native: 'Indonesian' },
  { code: 'ms', name: 'Melayu', native: 'Malay' },
  { code: 'vi', name: 'Tiếng Việt', native: 'Vietnamese' },
  { code: 'th', name: 'ไทย', native: 'Thai' },
  { code: 'nl', name: 'Nederlands', native: 'Dutch' },
  { code: 'pl', name: 'Polski', native: 'Polish' },
  { code: 'uk', name: 'Українська', native: 'Ukrainian' },
];

const FAST_EDGE_VOICES = {
  ar: [
    { id: 'ar-SA-HamedNeural', title: 'Hamed', meta: 'Male · Arabic Saudi', icon: '♂' },
    { id: 'ar-SA-ZariyahNeural', title: 'Zariyah', meta: 'Female · Arabic Saudi', icon: '♀' },
  ],
  en: [
    { id: 'en-US-RogerNeural', title: 'Roger', meta: 'Male · English US', icon: '♂' },
    { id: 'en-US-JennyNeural', title: 'Jenny', meta: 'Female · English US', icon: '♀' },
  ],
  fr: [
    { id: 'fr-FR-HenriNeural', title: 'Henri', meta: 'Homme · Français', icon: '♂' },
    { id: 'fr-FR-DeniseNeural', title: 'Denise', meta: 'Femme · Français', icon: '♀' },
  ],
  es: [
    { id: 'es-ES-AlvaroNeural', title: 'Alvaro', meta: 'Hombre · Español', icon: '♂' },
    { id: 'es-ES-ElviraNeural', title: 'Elvira', meta: 'Mujer · Español', icon: '♀' },
  ],
  de: [
    { id: 'de-DE-ConradNeural', title: 'Conrad', meta: 'Männlich · Deutsch', icon: '♂' },
    { id: 'de-DE-KatjaNeural', title: 'Katja', meta: 'Weiblich · Deutsch', icon: '♀' },
  ],
  it: [
    { id: 'it-IT-DiegoNeural', title: 'Diego', meta: 'Uomo · Italiano', icon: '♂' },
    { id: 'it-IT-ElsaNeural', title: 'Elsa', meta: 'Donna · Italiano', icon: '♀' },
  ],
  pt: [
    { id: 'pt-BR-AntonioNeural', title: 'Antonio', meta: 'Masculino · Português', icon: '♂' },
    { id: 'pt-BR-FranciscaNeural', title: 'Francisca', meta: 'Feminino · Português', icon: '♀' },
  ],
  tr: [
    { id: 'tr-TR-AhmetNeural', title: 'Ahmet', meta: 'Erkek · Türkçe', icon: '♂' },
    { id: 'tr-TR-EmelNeural', title: 'Emel', meta: 'Kadın · Türkçe', icon: '♀' },
  ],
  hi: [
    { id: 'hi-IN-MadhurNeural', title: 'Madhur', meta: 'पुरुष · हिन्दी', icon: '♂' },
    { id: 'hi-IN-SwaraNeural', title: 'Swara', meta: 'महिला · हिन्दी', icon: '♀' },
  ],
  ja: [
    { id: 'ja-JP-KeitaNeural', title: 'Keita', meta: '男性 · 日本語', icon: '♂' },
    { id: 'ja-JP-NanamiNeural', title: 'Nanami', meta: '女性 · 日本語', icon: '♀' },
  ],
  ko: [
    { id: 'ko-KR-InJoonNeural', title: 'InJoon', meta: '남성 · 한국어', icon: '♂' },
    { id: 'ko-KR-SunHiNeural', title: 'SunHi', meta: '여성 · 한국어', icon: '♀' },
  ],
  zh: [
    { id: 'zh-CN-YunxiNeural', title: 'Yunxi', meta: '男声 · 中文', icon: '♂' },
    { id: 'zh-CN-XiaoxiaoNeural', title: 'Xiaoxiao', meta: '女声 · 中文', icon: '♀' },
  ],
  ru: [
    { id: 'ru-RU-DmitryNeural', title: 'Dmitry', meta: 'Мужской · Русский', icon: '♂' },
    { id: 'ru-RU-SvetlanaNeural', title: 'Svetlana', meta: 'Женский · Русский', icon: '♀' },
  ],
};

const READY_REFERENCE_VOICES = [
  { id: 'auto-clone-video', title: 'Clone Video Voice', meta: 'Clone the speaker voice from the current video', icon: '◎', noSample: true },
  { id: 'ocd-orion-male', title: 'Orion', meta: 'Deep Male · cinematic and strong', icon: '◈', sample: 'voice_samples/ready/ocd_orion_male.wav' },
  { id: 'ocd-salem-male', title: 'Salem', meta: 'Warm Male · calm and friendly', icon: '◉', sample: 'voice_samples/ready/ocd_salem_male.wav' },
  { id: 'ocd-lina-female', title: 'Lina', meta: 'Soft Female · smooth and elegant', icon: '✧', sample: 'voice_samples/ready/ocd_lina_female.wav' },
  { id: 'ocd-noura-female', title: 'Noura', meta: 'Clear Female · crisp and direct', icon: '✦', sample: 'voice_samples/ready/ocd_noura_female.wav' },
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
  ru: 'Здравствуйте, это короткий образец голоса.',
};

const DEFAULTS = {
  sourceLanguage: 'auto',
  targetLanguage: 'en',
  dubbingLanguage: 'en',
  modelName: 'fast',
  voiceName: 'en-US-RogerNeural',
  originalVolumeMode: 'low',
  captions: true,
  captionStyle: 'tiktok',
  captionSize: 'large',
  captionColor: 'yellow',
  captionAnimation: 'pop',
  quickButtons: true,
};

let state = { ...DEFAULTS };
let currentAudio = null;
let saveTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function shortLang(value, fallback = 'ar') {
  const raw = String(value || fallback).trim().toLowerCase().replace('_', '-');
  if (!raw || raw === 'auto') return 'auto';
  if (raw.startsWith('zh')) return 'zh';
  return raw.split('-')[0] || fallback;
}

function normalizeModel(value) {
  const raw = String(value || 'fast').trim().toLowerCase();
  if (raw.includes('pro') || raw.includes('fish')) return 'pro';
  if (raw.includes('quality') || raw.includes('omni') || raw.includes('thinker')) return 'quality';
  return 'fast';
}

function languageByCode(code) {
  return LANGUAGES.find(item => item.code === code) || LANGUAGES.find(item => item.code === 'ar');
}

function isFastVoice(value) {
  return /Neural$/i.test(String(value || ''));
}

function voicesForState() {
  const model = normalizeModel(state.modelName);
  if (model === 'fast') {
    const lang = shortLang(state.targetLanguage, 'ar');
    return FAST_EDGE_VOICES[lang] || FAST_EDGE_VOICES.en;
  }
  return READY_REFERENCE_VOICES;
}

function validVoiceForCurrentModel(voiceName) {
  return voicesForState().some(v => v.id === voiceName);
}

function ensureValidVoice() {
  if (!validVoiceForCurrentModel(state.voiceName)) {
    const voices = voicesForState();
    state.voiceName = voices[0]?.id || 'ar-SA-HamedNeural';
  }
  const voiceInput = $('#voiceName');
  if (voiceInput) voiceInput.value = state.voiceName;
}

async function readSettings() {
  try {
    const saved = await chrome.storage.sync.get(DEFAULTS);
    state = {
      ...DEFAULTS,
      ...saved,
      targetLanguage: saved.targetLanguage || saved.dubbingLanguage || DEFAULTS.targetLanguage,
      dubbingLanguage: saved.dubbingLanguage || saved.targetLanguage || DEFAULTS.dubbingLanguage,
      modelName: normalizeModel(saved.modelName || DEFAULTS.modelName),
    };
  } catch (error) {
    console.warn('[OCD] storage read failed', error);
    state = { ...DEFAULTS };
  }
}

function setFeedback(message, type = '') {
  const el = $('#feedback');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (type) el.classList.add(type);
}

function setSaveStatus(text = 'Synced') {
  const el = $('#saveStatus');
  if (el) el.textContent = text;
}

async function notifyActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'OCD_SETTINGS_CHANGED', payload: state });
    }
  } catch {
    // The current tab may not have the content script. Settings are still saved.
  }
}

async function saveSettings({ notify = true } = {}) {
  ensureValidVoice();
  const payload = {
    ...state,
    modelName: normalizeModel(state.modelName),
    targetLanguage: state.targetLanguage,
    dubbingLanguage: state.targetLanguage,
    voiceName: state.voiceName,
  };
  state = { ...payload };
  setSaveStatus('Saving...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await chrome.storage.sync.set(payload);
      setSaveStatus('Synced');
      if (notify) await notifyActiveTab();
    } catch (error) {
      console.warn('[OCD] storage save failed', error);
      setSaveStatus('Offline');
    }
  }, 120);
}

function updateHiddenInputs() {
  $('#sourceLanguage').value = state.sourceLanguage;
  $('#targetLanguage').value = state.targetLanguage;
  $('#modelName').value = normalizeModel(state.modelName);
  $('#voiceName').value = state.voiceName;
}

function renderLanguageSelect(name) {
  const root = document.querySelector(`[data-select="${name}"]`);
  if (!root) return;
  const trigger = $('.select-trigger', root);
  const valueEl = $('.select-value', root);
  const list = $('.option-list', root);
  const search = $('.select-search', root);

  function draw(filter = '') {
    const query = filter.trim().toLowerCase();
    const items = LANGUAGES.filter(lang => {
      if (name === 'targetLanguage' && lang.code === 'auto') return false;
      const hay = `${lang.code} ${lang.name} ${lang.native}`.toLowerCase();
      return !query || hay.includes(query);
    });
    list.innerHTML = '';
    for (const lang of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lang-option ${state[name] === lang.code ? 'selected' : ''}`;
      btn.dataset.value = lang.code;
      btn.innerHTML = `<strong>${lang.name}</strong><small>${lang.native}</small>`;
      btn.addEventListener('click', () => {
        state[name] = lang.code;
        if (name === 'targetLanguage') state.dubbingLanguage = lang.code;
        root.classList.remove('open');
        root.closest('.languages-section')?.classList.remove('dropdown-open');
        trigger.setAttribute('aria-expanded', 'false');
        search.value = '';
        ensureValidVoice();
        renderAll();
        saveSettings();
      });
      list.appendChild(btn);
    }
  }

  const selected = languageByCode(state[name]);
  valueEl.textContent = selected?.name || state[name];
  draw(search.value || '');

  if (!root.dataset.bound) {
    root.dataset.bound = '1';
    trigger.addEventListener('click', () => {
      $$('.smart-field.open').forEach(el => {
        if (el !== root) {
          el.classList.remove('open');
          $('.select-trigger', el)?.setAttribute('aria-expanded', 'false');
        }
      });
      $$('.languages-section.dropdown-open').forEach(el => { if (!el.contains(root)) el.classList.remove('dropdown-open'); });
      const open = !root.classList.contains('open');
      root.classList.toggle('open', open);
      const section = root.closest('.languages-section');
      if (section) section.classList.toggle('dropdown-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      if (open) setTimeout(() => search.focus(), 50);
    });
    search.addEventListener('input', () => draw(search.value));
  }
}

function renderModels() {
  $$('.model-card').forEach(card => {
    const active = normalizeModel(card.dataset.model) === normalizeModel(state.modelName);
    card.classList.toggle('active', active);
    card.setAttribute('aria-checked', String(active));
  });
}

function renderVoices() {
  ensureValidVoice();
  const grid = $('#voiceCards');
  const tag = $('#voiceModeTag');
  const help = $('#voiceHelp');
  const model = normalizeModel(state.modelName);
  const voices = voicesForState();

  if (tag) {
    tag.textContent = model === 'fast' ? 'Edge TTS' : model === 'quality' ? 'OmniVoice' : 'Fish Speech';
  }
  if (help) {
    help.textContent = model === 'fast'
      ? 'Fast shows one male and one female voice for the selected dub language. Samples use bundled audio or browser preview.'
      : 'Choose video voice cloning or one of the preset reference voices. Presets use WAV references on RunPod and bundled samples for preview.';
  }

  grid.innerHTML = '';
  voices.forEach(voice => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `voice-card ${state.voiceName === voice.id ? 'active' : ''}`;
    card.dataset.voice = voice.id;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(state.voiceName === voice.id));

    card.innerHTML = `
      <span class="voice-copy">
        <span class="avatar">${voice.icon || '♪'}</span>
        <span class="voice-text">
          <strong>${voice.title}</strong>
          <small>${voice.meta || ''}</small>
        </span>
      </span>
      <span class="play-btn" data-play="${voice.id}" title="Play sample">${voice.noSample ? '◎' : '▶'}</span>
    `;

    card.addEventListener('click', event => {
      if (event.target.closest('.play-btn')) return;
      state.voiceName = voice.id;
      renderVoices();
      saveSettings();
    });

    $('.play-btn', card).addEventListener('click', event => {
      event.stopPropagation();
      playVoiceSample(voice, event.currentTarget);
    });

    grid.appendChild(card);
  });
}

function renderCaptionPanel() {
  const toggle = $('#captionsToggle');
  const panel = $('#captionPanel');
  const style = $('#captionStyle');
  const size = $('#captionSize');
  const preview = $('#captionPreview');
  toggle?.classList.toggle('on', !!state.captions);
  toggle?.setAttribute('aria-pressed', String(!!state.captions));
  panel?.classList.toggle('hidden', !state.captions);
  if (style) style.value = state.captionStyle || 'tiktok';
  if (size) size.value = state.captionSize || 'large';
  if (preview) {
    preview.className = `caption-preview ${state.captionStyle || 'tiktok'}`;
    preview.style.fontSize = state.captionSize === 'small' ? '13px' : state.captionSize === 'medium' ? '15px' : '17px';
  }
}

function renderVolumeModes() {
  $$('#volumeModes [data-volume]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.volume === state.originalVolumeMode);
  });
}

function renderAll() {
  updateHiddenInputs();
  renderLanguageSelect('sourceLanguage');
  renderLanguageSelect('targetLanguage');
  renderModels();
  renderVoices();
  renderCaptionPanel();
  renderVolumeModes();
}

function stopCurrentAudio() {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
  } catch {}
  currentAudio = null;
  try { speechSynthesis.cancel(); } catch {}
  $$('.play-btn.playing').forEach(btn => {
    btn.classList.remove('playing');
    btn.textContent = btn.textContent === '■' ? '▶' : btn.textContent;
  });
}

async function playVoiceSample(voice, button) {
  if (button.classList.contains('playing')) {
    stopCurrentAudio();
    return;
  }
  stopCurrentAudio();

  if (voice.noSample) {
    setFeedback('Video voice cloning has no fixed sample. The voice will be generated from the current video when dubbing starts.', 'success');
    return;
  }

  button.classList.add('playing');
  button.textContent = '■';

  if (voice.sample) {
    try {
      const url = chrome.runtime.getURL(voice.sample);
      currentAudio = new Audio(url);
      currentAudio.onended = stopCurrentAudio;
      currentAudio.onerror = () => {
        stopCurrentAudio();
        speakFallback(voice);
      };
      await currentAudio.play();
      return;
    } catch (error) {
      console.warn('[OCD] bundled sample failed, using speech fallback', error);
    }
  }

  speakFallback(voice, button);
}

function speakFallback(voice, button = null) {
  try {
    const lang = shortLang(state.targetLanguage, 'en');
    const text = SAMPLE_TEXTS[lang] || SAMPLE_TEXTS.en;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'zh' ? 'zh-CN' : lang;
    const voices = speechSynthesis.getVoices();
    const female = /female|أنثى|woman|zariyah|jenny|denise|elvira|katja|elsa|francisca|emel|swara|nanami|sunhi|xiaoxiao|lina|noura/i.test(`${voice.id} ${voice.title} ${voice.meta}`);
    const preferred = voices.find(v => v.lang?.toLowerCase().startsWith(lang) && (female ? /female|woman|zira|sara|susan|female/i.test(v.name) : /male|man|david|mark|male/i.test(v.name)))
      || voices.find(v => v.lang?.toLowerCase().startsWith(lang));
    if (preferred) utterance.voice = preferred;
    utterance.onend = stopCurrentAudio;
    utterance.onerror = stopCurrentAudio;
    speechSynthesis.speak(utterance);
    if (button) {
      button.classList.add('playing');
      button.textContent = '■';
    }
  } catch (error) {
    console.warn('[OCD] speech fallback failed', error);
    stopCurrentAudio();
    setFeedback('Could not play this voice sample in the current browser.', 'error');
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    if (!event.target.closest('.smart-field')) {
      $$('.smart-field.open').forEach(el => {
        el.classList.remove('open');
        $('.select-trigger', el)?.setAttribute('aria-expanded', 'false');
      });
      $$('.languages-section.dropdown-open').forEach(el => el.classList.remove('dropdown-open'));
    }
  });

  $('#closePopup')?.addEventListener('click', () => window.close());

  $('#swapLanguages')?.addEventListener('click', () => {
    if (state.sourceLanguage === 'auto') {
      state.sourceLanguage = state.targetLanguage;
      state.targetLanguage = 'en';
    } else {
      const oldSource = state.sourceLanguage;
      state.sourceLanguage = state.targetLanguage;
      state.targetLanguage = oldSource;
    }
    state.dubbingLanguage = state.targetLanguage;
    ensureValidVoice();
    renderAll();
    saveSettings();
  });

  $$('.model-card').forEach(card => {
    card.addEventListener('click', () => {
      state.modelName = normalizeModel(card.dataset.model);
      ensureValidVoice();
      renderAll();
      saveSettings();
    });
  });

  $('#captionsToggle')?.addEventListener('click', () => {
    state.captions = !state.captions;
    renderCaptionPanel();
    saveSettings();
  });

  $('#captionStyle')?.addEventListener('change', event => {
    state.captionStyle = event.target.value;
    renderCaptionPanel();
    saveSettings();
  });

  $('#captionSize')?.addEventListener('change', event => {
    state.captionSize = event.target.value;
    renderCaptionPanel();
    saveSettings();
  });

  $$('#volumeModes [data-volume]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.originalVolumeMode = btn.dataset.volume;
      renderVolumeModes();
      saveSettings();
    });
  });

  $('#startDubbing')?.addEventListener('click', startDubbingFromPopup);
}

async function startDubbingFromPopup() {
  const btn = $('#startDubbing');
  const oldLabel = $('.cta-label', btn)?.textContent || 'Start Dubbing';
  try {
    btn.disabled = true;
    $('.cta-label', btn).textContent = 'Preparing...';
    setFeedback('Sending settings to the video page...', '');
    await saveSettings({ notify: false });
    await new Promise(resolve => setTimeout(resolve, 160));
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    await chrome.tabs.sendMessage(tab.id, { type: 'OCD_SETTINGS_CHANGED', payload: state });
    await chrome.tabs.sendMessage(tab.id, { type: 'OCD_START_CUSTOM_DUB' });

    setFeedback('Dubbing started. Watch the floating button over the video.', 'success');
    $('.cta-label', btn).textContent = 'Dubbing Started';
    setTimeout(() => window.close(), 700);
  } catch (error) {
    console.warn('[OCD] start dubbing failed', error);
    setFeedback('Open a normal video page, then try again. ' + (error?.message || ''), 'error');
    $('.cta-label', btn).textContent = oldLabel;
  } finally {
    setTimeout(() => { btn.disabled = false; }, 650);
  }
}

async function updateVideoStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'OCD_VIDEO_STATUS' });
    if (res?.hasVideo) {
      $('#connectionStatus').textContent = res.dubbing ? 'Dubbing' : 'Video Ready';
      setFeedback(res.dubbing ? 'Dubbing is currently running on this page.' : 'Video detected. You can start dubbing now.', res.dubbing ? 'success' : '');
    } else {
      $('#connectionStatus').textContent = 'No Video';
      setFeedback('Open YouTube or a page with an HTML5 video player.', '');
    }
  } catch {
    $('#connectionStatus').textContent = 'Ready';
  }
}

async function init() {
  bindEvents();
  await readSettings();
  ensureValidVoice();
  renderAll();
  saveSettings({ notify: false });
  await updateVideoStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
