
const LANGUAGES = [
  {code:"auto", name:"Auto detect"}, {code:"en", name:"English"}, {code:"ar", name:"Arabic"},
  {code:"es", name:"Spanish"}, {code:"fr", name:"French"}, {code:"de", name:"German"},
  {code:"it", name:"Italian"}, {code:"pt", name:"Portuguese"}, {code:"ru", name:"Russian"},
  {code:"zh-CN", name:"Chinese Simplified"}, {code:"zh-TW", name:"Chinese Traditional"},
  {code:"ja", name:"Japanese"}, {code:"ko", name:"Korean"}, {code:"tr", name:"Turkish"},
  {code:"hi", name:"Hindi"}, {code:"ur", name:"Urdu"}, {code:"id", name:"Indonesian"},
  {code:"ms", name:"Malay"}, {code:"th", name:"Thai"}, {code:"vi", name:"Vietnamese"},
  {code:"nl", name:"Dutch"}, {code:"sv", name:"Swedish"}, {code:"pl", name:"Polish"},
  {code:"uk", name:"Ukrainian"}, {code:"fa", name:"Persian"}, {code:"he", name:"Hebrew"}
];

const MODELS = [
  {value:"fast", label:"Fast · Edge TTS · Faster-Whisper Turbo", tip:"Google Translate + Edge TTS + faster-whisper large-v3-turbo على RunPod. أسرع وضع للتجربة."},
  {value:"quality", label:"Quality · OmniVoice Auto Clone", tip:"NLLB-200 + OmniVoice + faster-whisper large-v3. يستنسخ صوت كل فيديو من عينة داخل نفس الـ job."},
  {value:"pro", label:"✨ Pro · Fish-Speech S1-mini · SOON", tip:"قادم قريبًا: NLLB-200 + Fish-Speech S1-mini + Whisper turbo. هذا الخيار مظهر فقط الآن ولن يبدأ دبلجة."}
];

const CAPTION_STYLES = [
  {value:"tiktok", label:"TikTok Pop"}, {value:"capcut", label:"CapCut Clean"},
  {value:"karaoke", label:"Karaoke Highlight"}, {value:"box", label:"Subtitle Box"},
  {value:"neon", label:"Creator Neon"}, {value:"minimal", label:"Minimal"}
];
const CAPTION_POSITIONS = [{value:"bottom",label:"Bottom"},{value:"center",label:"Center"},{value:"top",label:"Top"}];
const CAPTION_SIZES = [{value:"small",label:"Small"},{value:"medium",label:"Medium"},{value:"large",label:"Large"},{value:"xl",label:"Extra Large"}];
const CAPTION_COLORS = [{value:"yellow",label:"Yellow"},{value:"purple",label:"Purple"},{value:"cyan",label:"Cyan"},{value:"green",label:"Green"},{value:"red",label:"Red"}];
const CAPTION_ANIMATIONS = [{value:"none",label:"None"},{value:"fade",label:"Fade"},{value:"pop",label:"Pop"},{value:"bounce",label:"Bounce"},{value:"karaoke",label:"Karaoke"}];

// Fast = free model: Google Translate + Microsoft Edge TTS voices.
const EDGE_FAST_VOICES = {
  ar:[
    ["ar-SA-HamedNeural","Hamed · Edge Arabic Saudi · male"],
    ["ar-SA-ZariyahNeural","Zariyah · Edge Arabic Saudi · female"],
    ["ar-EG-ShakirNeural","Shakir · Edge Arabic Egypt · male"],
    ["ar-EG-SalmaNeural","Salma · Edge Arabic Egypt · female"]
  ],
  en:[
    ["en-US-RogerNeural","Roger · Edge English US · male"],
    ["en-US-AriaNeural","Aria · Edge English US · female"],
    ["en-US-ChristopherNeural","Christopher · Edge English US · male"],
    ["en-US-JennyNeural","Jenny · Edge English US · female"],
    ["en-US-GuyNeural","Guy · Edge English US · male"]
  ],
  es:[["es-ES-AlvaroNeural","Alvaro · Edge Spanish"],["es-ES-ElviraNeural","Elvira · Edge Spanish"],["es-MX-JorgeNeural","Jorge · Edge Mexican Spanish"],["es-MX-DaliaNeural","Dalia · Edge Mexican Spanish"]],
  fr:[["fr-FR-HenriNeural","Henri · Edge French"],["fr-FR-DeniseNeural","Denise · Edge French"],["fr-CA-AntoineNeural","Antoine · Edge Canadian French"],["fr-CA-SylvieNeural","Sylvie · Edge Canadian French"]],
  de:[["de-DE-ConradNeural","Conrad · Edge German"],["de-DE-KatjaNeural","Katja · Edge German"]],
  it:[["it-IT-DiegoNeural","Diego · Edge Italian"],["it-IT-ElsaNeural","Elsa · Edge Italian"]],
  pt:[["pt-BR-AntonioNeural","Antonio · Edge Portuguese BR"],["pt-BR-FranciscaNeural","Francisca · Edge Portuguese BR"]],
  ru:[["ru-RU-DmitryNeural","Dmitry · Edge Russian"],["ru-RU-SvetlanaNeural","Svetlana · Edge Russian"]],
  ja:[["ja-JP-KeitaNeural","Keita · Edge Japanese"],["ja-JP-NanamiNeural","Nanami · Edge Japanese"]],
  ko:[["ko-KR-InJoonNeural","InJoon · Edge Korean"],["ko-KR-SunHiNeural","SunHi · Edge Korean"]],
  zh:[["zh-CN-YunxiNeural","Yunxi · Edge Chinese"],["zh-CN-XiaoxiaoNeural","Xiaoxiao · Edge Chinese"]],
  hi:[["hi-IN-MadhurNeural","Madhur · Edge Hindi"],["hi-IN-SwaraNeural","Swara · Edge Hindi"]],
  tr:[["tr-TR-AhmetNeural","Ahmet · Edge Turkish"],["tr-TR-EmelNeural","Emel · Edge Turkish"]],
  default:[["en-US-RogerNeural","Roger · Edge English US · male"],["en-US-AriaNeural","Aria · Edge English US · female"]]
};

const FISH_SPEECH_SOON = {
  default:[
    ["fish-speech-s1-mini-soon","✨ Fish-Speech S1-mini · SOON · Coming soon"]
  ]
};

const OMNIVOICE_ROLES = {
  default:[
    ["auto-clone-video","🎙️ Auto Clone · من صوت هذا الفيديو"],
    ["sample_01.wav","🎙️ Voice Sample 1 · OmniVoice clone"],
    ["sample_02.wav","🎙️ Voice Sample 2 · OmniVoice clone"],
    ["sample_03.wav","🎙️ Voice Sample 3 · OmniVoice clone"],
    ["sample_04.wav","🎙️ Voice Sample 4 · OmniVoice clone"],
    ["sample_05.wav","🎙️ Voice Sample 5 · OmniVoice clone"],
    ["design-male-deep-ar","OmniVoice · male deep Arabic design"],
    ["design-male-warm-ar","OmniVoice · male warm Arabic design"],
    ["design-female-soft-ar","OmniVoice · female soft Arabic design"],
    ["design-female-bright-ar","OmniVoice · female bright Arabic design"],
    ["design-narrator-ar","OmniVoice · narrator Arabic design"]
  ]
};

const AZURE_VOICES = {
  ar:[["ar-SA-HamedNeural","Hamed · Azure Arabic"],["ar-SA-ZariyahNeural","Zariyah · Azure Arabic"],["ar-EG-ShakirNeural","Shakir · Azure Egyptian"],["ar-EG-SalmaNeural","Salma · Azure Egyptian"]],
  en:[["en-US-AvaMultilingualNeural","Ava Multilingual · Azure"],["en-US-AndrewMultilingualNeural","Andrew Multilingual · Azure"],["en-US-EmmaMultilingualNeural","Emma Multilingual · Azure"],["en-US-BrianMultilingualNeural","Brian Multilingual · Azure"],["en-US-JennyNeural","Jenny · Azure"],["en-US-GuyNeural","Guy · Azure"]],
  es:[["es-ES-ElviraNeural","Elvira · Azure"],["es-ES-AlvaroNeural","Alvaro · Azure"],["es-MX-DaliaNeural","Dalia · Azure"],["es-MX-JorgeNeural","Jorge · Azure"]],
  fr:[["fr-FR-DeniseNeural","Denise · Azure"],["fr-FR-HenriNeural","Henri · Azure"],["fr-CA-SylvieNeural","Sylvie · Azure"],["fr-CA-AntoineNeural","Antoine · Azure"]],
  default:[["en-US-AvaMultilingualNeural","Ava Multilingual · Azure"],["en-US-AndrewMultilingualNeural","Andrew Multilingual · Azure"]]
};

const GEMINI_VOICES = {
  default:[
    ["Zephyr","Zephyr · Bright"],["Puck","Puck · Upbeat"],["Charon","Charon · Informative"],["Kore","Kore · Firm"],
    ["Fenrir","Fenrir · Excitable"],["Leda","Leda · Youthful"],["Orus","Orus · Firm"],["Aoede","Aoede · Breezy"],
    ["Callirrhoe","Callirrhoe · Easy-going"],["Autonoe","Autonoe · Bright"],["Enceladus","Enceladus · Breathy"],["Iapetus","Iapetus · Clear"],
    ["Umbriel","Umbriel · Easy-going"],["Algieba","Algieba · Smooth"],["Despina","Despina · Smooth"],["Erinome","Erinome · Clear"],
    ["Algenib","Algenib · Gravelly"],["Rasalgethi","Rasalgethi · Informative"],["Laomedeia","Laomedeia · Upbeat"],["Achernar","Achernar · Soft"],
    ["Alnilam","Alnilam · Firm"],["Schedar","Schedar · Even"],["Gacrux","Gacrux · Mature"],["Pulcherrima","Pulcherrima · Forward"]
  ]
};

const defaults = {
  targetLanguage:"en", dubbingLanguage:"ar-SA", modelName:"fast", voiceName:"ar-SA-HamedNeural",
  originalVolumeMode:"low", captions:true, quickButtons:false, dubbing:false,
  captionStyle:"tiktok", captionPosition:"bottom", captionSize:"large", captionColor:"yellow", captionAnimation:"pop"
};

let current = {...defaults};
let selects = {};
let chromeTtsVoices = [];

function langKey(code){
  if (!code || code === "auto") return "en";
  const normalized = code.replace("_","-").toLowerCase();
  if (normalized.startsWith("zh")) return "zh";
  return normalized.split("-")[0];
}

function normalizeForMatch(lang) {
  return String(lang || "").replace("_","-").toLowerCase();
}

function isEdgeVoice(voice) { return false; }

function providerForModel(model) {
  if (model === "quality") return "omnivoice";
  if (model === "pro") return "fish-speech-soon";
  return "edge";
}

function getStaticProviderVoices(model, lang) {
  if (model === "quality") return OMNIVOICE_ROLES.default;
  if (model === "pro") return FISH_SPEECH_SOON.default;
  const key = langKey(lang);
  return EDGE_FAST_VOICES[key] || EDGE_FAST_VOICES.default;
}

function labelFromEdgeVoice(voice) { return voice?.voiceName || "Edge voice"; }

function getEdgeVoiceOptionsForLanguage(langCode) {
  const key = langKey(langCode);
  return (EDGE_FAST_VOICES[key] || EDGE_FAST_VOICES.default).map(([value,label]) => ({
    value,
    label,
    sample:true,
    provider:"edge",
    ttsLang:value.split("-").slice(0,2).join("-"),
    installed:true
  }));
}

function getVoiceOptions() {
  if (current.modelName === "quality") {
    return OMNIVOICE_ROLES.default.map(([value,label]) => {
      const isRefSample = /^sample_\d+\.(wav|mp3|m4a|flac|ogg)$/i.test(value);
      return {
        value, label, sample:isRefSample, provider:isRefSample ? "omnivoice-ref" : "omnivoice",
        samplePath:isRefSample ? `voice-samples/${value}` : null,
        ttsLang: current.dubbingLanguage, installed:false
      };
    });
  }
  if (current.modelName === "pro") {
    return FISH_SPEECH_SOON.default.map(([value,label]) => ({
      value, label, sample:false, provider:"fish-speech-soon",
      ttsLang: current.dubbingLanguage, installed:false
    }));
  }
  return getEdgeVoiceOptionsForLanguage(current.dubbingLanguage);
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 3200);
}

function createSmartSelect(rootId, options, config) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  root.innerHTML = `<button type="button" class="select-trigger"><span class="select-value"></span></button><div class="select-panel">${config.search ? `<input class="select-search" placeholder="${config.placeholder || "Search..."}" />` : ""}<div class="option-list"></div></div>`;
  const trigger = root.querySelector(".select-trigger");
  const value = root.querySelector(".select-value");
  const search = root.querySelector(".select-search");
  const list = root.querySelector(".option-list");
  let selected = config.value;

  function render(filter = "") {
    const q = filter.toLowerCase().trim();
    const filtered = options.filter(opt => (opt.label + " " + (opt.tip || "")).toLowerCase().includes(q));
    list.innerHTML = filtered.map(opt => `
      <div class="option ${opt.value === selected ? "selected" : ""}" data-value="${opt.value}">
        <div class="option-main"><div class="option-title"><span>${opt.label}</span>${opt.tip ? `<span class="info" tabindex="0" data-tip="${opt.tip}">!</span>` : ""}</div></div>
        ${opt.sample ? `<button type="button" class="play-sample" data-play="${opt.value}" title="Play sample">▶</button>` : ""}
      </div>`).join("");

    list.querySelectorAll(".option").forEach(item => {
      item.addEventListener("click", (event) => {
        if (event.target.closest(".play-sample") || event.target.closest(".info")) return;
        selected = item.dataset.value;
        const opt = options.find(o => o.value === selected);
        value.textContent = opt?.label || selected;
        root.classList.remove("open");
        config.onChange?.(selected);
        render(search?.value || "");
      });
    });
    list.querySelectorAll(".play-sample").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      config.onSample?.(options.find(o => o.value === btn.dataset.play), btn);
    }));
  }

  trigger.addEventListener("click", () => {
    document.querySelectorAll(".smart-select.open").forEach(el => { if (el !== root) el.classList.remove("open"); });
    root.classList.toggle("open");
    if (root.classList.contains("open")) { if(search){ search.value = ""; setTimeout(() => search.focus(), 0); } render(""); }
  });
  search?.addEventListener("input", () => render(search.value));

  function setOptions(nextOptions, nextValue) {
    options = nextOptions;
    const exists = options.some(o => o.value === nextValue);
    selected = exists ? nextValue : options[0]?.value;
    value.textContent = options.find(o => o.value === selected)?.label || "";
    render(search?.value || "");
  }

  setOptions(options, selected);
  return {setOptions, getValue:() => selected};
}

document.addEventListener("click", e => {
  if (!e.target.closest(".smart-select")) document.querySelectorAll(".smart-select.open").forEach(el => el.classList.remove("open"));
});

async function ensureChromeTtsVoices() {
  return new Promise(resolve => {
    if (!chrome.tts?.getVoices) {
      chromeTtsVoices = [];
      resolve([]);
      return;
    }
    chrome.tts.getVoices(voices => {
      chromeTtsVoices = voices || [];
      resolve(chromeTtsVoices);
    });
  });
}

async function canUseContentScripts(tab) {
  return !!tab?.id && /^https?:|^file:/.test(tab.url || "");
}

async function ensureContentReady(tab) {
  if (!await canUseContentScripts(tab)) {
    toast("Open a normal webpage or video page first. Quick buttons cannot run on chrome:// pages.");
    return false;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {type:"OCD_PING"});
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:["content.js"]});
      await chrome.scripting.insertCSS({target:{tabId:tab.id}, files:["content.css"]});
      await chrome.tabs.sendMessage(tab.id, {type:"OCD_PING"});
      return true;
    } catch (error) {
      toast("Could not inject quick buttons on this page. Try refreshing a normal video page.");
      return false;
    }
  }
}

async function sendCommand(type, payload = {}) {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!await ensureContentReady(tab)) return false;
  await chrome.tabs.sendMessage(tab.id, {type, payload});
  return true;
}

async function saveAll() {
  await chrome.storage.sync.set(current);
  await sendCommand("OCD_SETTINGS_CHANGED", current);
  updatePreview();
}

async function syncQuickButtonsNow() {
  await chrome.storage.sync.set({quickButtons: current.quickButtons});
  const ok = await sendCommand("OCD_SET_QUICK_BUTTONS", {enabled: current.quickButtons});
  if (ok) toast(current.quickButtons ? "Quick buttons enabled on this page." : "Quick buttons hidden.");
}

function refreshVoices(keep = false) {
  const voices = getVoiceOptions();
  if (!keep || !voices.some(v => v.value === current.voiceName)) current.voiceName = voices[0]?.value || "";
  selects.voice?.setOptions(voices, current.voiceName);

  if (current.modelName === "quality") {
    toast("Quality uses faster-whisper large-v3 + NLLB-200 + OmniVoice Auto Clone on RunPod.");
  } else if (current.modelName === "pro") {
    toast("✨ Pro / Fish-Speech S1-mini is coming soon. This is a preview only.");
  } else if (current.modelName === "fast" && !voices.some(v => v.installed)) {
    toast("Fast uses original OpenAI Whisper large + Microsoft Edge TTS.");
  }
}

function playFallbackBeep(button) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = current.modelName === "professional" ? 660 : current.modelName === "thinker" ? 520 : 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
    button.classList.add("playing");
    const old = button.textContent;
    button.textContent = "✓";
    setTimeout(() => { button.classList.remove("playing"); button.textContent = old; ctx.close?.(); }, 700);
  } catch {
    button.textContent = "✓";
    setTimeout(() => { button.textContent = "▶"; }, 700);
  }
}

function sampleTextForLanguage(langCode) {
  const key = langKey(langCode);
  const samples = {
    ar:"هذه عينة قصيرة من الصوت.",
    en:"This is a short Edge TTS voice sample.",
    es:"Esta es una breve muestra de voz.",
    fr:"Ceci est un court échantillon vocal.",
    de:"Dies ist eine kurze Stimmprobe.",
    it:"Questo è un breve esempio vocale.",
    pt:"Esta é uma pequena amostra de voz.",
    ru:"Это короткий пример голоса.",
    ja:"これは短い音声サンプルです。",
    ko:"이것은 짧은 음성 샘플입니다.",
    zh:"这是一个简短的语音示例。"
  };
  return samples[key] || samples.en;
}

async function playVoiceSample(opt, button) {
  if (!opt) return;

  if (opt.provider === "edge") {
    button.classList.add("playing");
    button.textContent = "■";
    try {
      const response = await chrome.runtime.sendMessage({
        type:"OCD_FAST_EDGE_DUB",
        payload:{text:sampleTextForLanguage(current.dubbingLanguage), targetLanguage:current.dubbingLanguage, voiceName:opt.value}
      });
      if (!response?.ok) throw new Error(response?.error || "Edge sample failed");
      const audio = new Audio("data:audio/mpeg;base64," + response.audioBase64);
      audio.onended = audio.onerror = () => { button.classList.remove("playing"); button.textContent = "▶"; };
      await audio.play();
    } catch (error) {
      button.classList.remove("playing");
      button.textContent = "▶";
      toast(error?.message || "Could not play Edge TTS sample.");
    }
    return;
  }

  if (opt.provider === "omnivoice-ref" && opt.samplePath) {
    button.classList.add("playing");
    button.textContent = "■";
    try {
      const audioUrl = chrome.runtime.getURL(opt.samplePath) + `?t=${Date.now()}`;
      const audio = new Audio(audioUrl);
      audio.onended = audio.onerror = () => { button.classList.remove("playing"); button.textContent = "▶"; };
      await audio.play();
    } catch (error) {
      button.classList.remove("playing");
      button.textContent = "▶";
      toast("لم أجد ملف العينة داخل voice-samples أو تعذر تشغيله.");
    }
    return;
  }

  playFallbackBeep(button);
}

function setModeButtons() {
  document.querySelectorAll("#originalVolumeMode button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === current.originalVolumeMode);
    btn.onclick = () => { current.originalVolumeMode = btn.dataset.value; setModeButtons(); saveAll(); };
  });
}

function updatePreview() {
  const preview = document.getElementById("captionPreview");
  if (!preview) return;
  preview.className = `caption-preview ${current.captionStyle}`;
  const color = {yellow:"#facc15",purple:"#c084fc",cyan:"#22d3ee",green:"#34d399",red:"#fb7185"}[current.captionColor] || "#facc15";
  preview.querySelector("span").style.color = color;
  preview.style.fontSize = {small:"13px",medium:"15px",large:"17px",xl:"20px"}[current.captionSize] || "17px";
  document.getElementById("captionSettings")?.classList.toggle("hidden", !current.captions);
}

async function init() {
  current = await chrome.storage.sync.get(defaults);
  if (!["fast", "quality", "pro"].includes(current.modelName)) current.modelName = "fast";
  await ensureChromeTtsVoices();

  const languageOptions = LANGUAGES.map(l => ({value:l.code,label:l.name}));
  selects.target = createSmartSelect("targetLanguageDropdown", languageOptions, {value:current.targetLanguage, placeholder:"Search language...", search:true, onChange:v => {current.targetLanguage=v; saveAll();}});
  selects.dubbing = createSmartSelect("dubbingLanguageDropdown", languageOptions, {value:current.dubbingLanguage, placeholder:"Search dubbing language...", search:true, onChange:v => {current.dubbingLanguage=v; refreshVoices(false); saveAll();}});
  selects.model = createSmartSelect("modelDropdown", MODELS.map(m => ({value:m.value,label:m.label,tip:m.tip})), {value:current.modelName, onChange:v => {current.modelName=v; refreshVoices(false); saveAll();}});
  selects.voice = createSmartSelect("voiceDropdown", getVoiceOptions(), {value:current.voiceName, onChange:v => {current.voiceName=v; saveAll();}, onSample:playVoiceSample});

  selects.captionStyle = createSmartSelect("captionStyleDropdown", CAPTION_STYLES, {value:current.captionStyle, onChange:v => {current.captionStyle=v; updatePreview(); saveAll();}});
  selects.captionPosition = createSmartSelect("captionPositionDropdown", CAPTION_POSITIONS, {value:current.captionPosition, onChange:v => {current.captionPosition=v; updatePreview(); saveAll();}});
  selects.captionSize = createSmartSelect("captionSizeDropdown", CAPTION_SIZES, {value:current.captionSize, onChange:v => {current.captionSize=v; updatePreview(); saveAll();}});
  selects.captionColor = createSmartSelect("captionColorDropdown", CAPTION_COLORS, {value:current.captionColor, onChange:v => {current.captionColor=v; updatePreview(); saveAll();}});
  selects.captionAnimation = createSmartSelect("captionAnimationDropdown", CAPTION_ANIMATIONS, {value:current.captionAnimation, onChange:v => {current.captionAnimation=v; updatePreview(); saveAll();}});

  refreshVoices(true);
  setModeButtons();
  updatePreview();

  const captions = document.getElementById("captionsToggle");
  captions?.classList.toggle("on", !!current.captions);
  if (captions) captions.onclick = () => { current.captions=!current.captions; captions.classList.toggle("on", current.captions); updatePreview(); saveAll(); };

  const quick = document.getElementById("quickButtonsToggle");
  quick?.classList.toggle("on", !!current.quickButtons);
  if (quick) quick.onclick = async () => {
    current.quickButtons = !current.quickButtons;
    quick.classList.toggle("on", current.quickButtons);
    await syncQuickButtonsNow();
  };

  const dub = document.getElementById("toggleDub");
  if (dub) {
    dub.classList.toggle("active", !!current.dubbing);
    dub.textContent = current.dubbing ? "Stop dubbing" : "Start dubbing";
    dub.onclick = async () => {
      if (current.modelName === "pro") {
        toast("✨ Pro / Fish-Speech S1-mini قريبًا. هذا الخيار مظهر فقط الآن.");
        return;
      }
      await sendCommand("OCD_TOGGLE_DUB");
      setTimeout(async () => {
        current = await chrome.storage.sync.get(defaults);
        if (!["fast", "quality", "pro"].includes(current.modelName)) current.modelName = "fast";
        dub.classList.toggle("active", !!current.dubbing);
        dub.textContent = current.dubbing ? "Stop dubbing" : "Start dubbing";
      }, 300);
    };
  }
}
init();
