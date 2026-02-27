const state = {
  bibleData: null,
  bookIndex: 0,
  chapterIndex: 0,
  paragraphIndex: 0,
  totalParagraphs: 0,
  isReading: false,
  status: "停止中",
  voices: [],
  preferredVoices: { male: null, female: null },
  selectedVoiceURI: "",
};

const els = {
  bookSelect: document.getElementById("bookSelect"),
  chapterSelect: document.getElementById("chapterSelect"),
  voiceSelect: document.getElementById("voiceSelect"),
  rateRange: document.getElementById("rateRange"),
  pitchRange: document.getElementById("pitchRange"),
  rateValue: document.getElementById("rateValue"),
  pitchValue: document.getElementById("pitchValue"),
  continuousToggle: document.getElementById("continuousToggle"),
  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusText: document.getElementById("statusText"),
  currentRef: document.getElementById("currentRef"),
  progressText: document.getElementById("progressText"),
  paragraphList: document.getElementById("paragraphList"),
  errorText: document.getElementById("errorText"),
  voicePresetRadios: document.querySelectorAll('input[name="voicePreset"]'),
};

const synth = window.speechSynthesis;
const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  if (!supportsSpeech) {
    showError("このブラウザはSpeechSynthesis APIに対応していません。");
  }
  await loadData();
  renderSelectors();
  renderChapter();
  setupVoices();
  updateStatus("停止中");
}

function bindEvents() {
  els.bookSelect.addEventListener("change", onBookChange);
  els.chapterSelect.addEventListener("change", onChapterChange);
  els.voiceSelect.addEventListener("change", onVoiceSelectChange);
  els.rateRange.addEventListener("input", () => {
    els.rateValue.textContent = Number(els.rateRange.value).toFixed(1);
  });
  els.pitchRange.addEventListener("input", () => {
    els.pitchValue.textContent = Number(els.pitchRange.value).toFixed(1);
  });
  els.playBtn.addEventListener("click", startReading);
  els.pauseBtn.addEventListener("click", pauseReading);
  els.resumeBtn.addEventListener("click", resumeReading);
  els.stopBtn.addEventListener("click", stopReading);
  els.voicePresetRadios.forEach((radio) => {
    radio.addEventListener("change", () => applyVoicePreset(radio.value));
  });
}

async function loadData() {
  try {
    const res = await fetch("./data/bible_ja_sample.json");
    const json = await res.json();
    state.bibleData = json;
  } catch (err) {
    showError("本文データの読み込みに失敗しました。");
    console.error(err);
  }
}

function renderSelectors() {
  const books = state.bibleData?.books ?? [];
  els.bookSelect.innerHTML = books
    .map((book, index) => `<option value="${index}">${book.name}</option>`)
    .join("");
  renderChapterOptions();
}

function renderChapterOptions() {
  const chapters = getCurrentBook()?.chapters ?? [];
  els.chapterSelect.innerHTML = chapters
    .map((chapter, index) => `<option value="${index}">${chapter.number}章</option>`)
    .join("");
}

function onBookChange(event) {
  stopReading();
  state.bookIndex = Number(event.target.value);
  state.chapterIndex = 0;
  renderChapterOptions();
  renderChapter();
}

function onChapterChange(event) {
  stopReading();
  state.chapterIndex = Number(event.target.value);
  renderChapter();
}

function onVoiceSelectChange(event) {
  state.selectedVoiceURI = event.target.value;
}

function getCurrentBook() {
  return state.bibleData?.books?.[state.bookIndex] ?? null;
}

function getCurrentChapter() {
  return getCurrentBook()?.chapters?.[state.chapterIndex] ?? null;
}

function renderChapter() {
  const chapter = getCurrentChapter();
  const paragraphs = chapter?.paragraphs ?? [];
  state.totalParagraphs = paragraphs.length;
  state.paragraphIndex = 0;

  els.paragraphList.innerHTML = paragraphs
    .map(
      (p, index) =>
        `<p class="paragraph" data-index="${index}"><strong>${index + 1}.</strong> ${p}</p>`
    )
    .join("");

  updateCurrentRef();
  updateProgress();
  clearActiveParagraph();
}

function setupVoices() {
  if (!supportsSpeech) {
    els.voiceSelect.innerHTML = "<option>非対応</option>";
    return;
  }

  const loadVoices = () => {
    const voices = synth.getVoices();
    state.voices = voices;
    renderVoiceOptions();
  };

  loadVoices();
  synth.onvoiceschanged = loadVoices;
}

function renderVoiceOptions() {
  if (!state.voices.length) {
    els.voiceSelect.innerHTML = "<option value=''>音声を取得中...</option>";
    return;
  }

  const jaVoices = state.voices.filter((v) => v.lang?.toLowerCase().startsWith("ja"));
  const fallbackVoices = jaVoices.length ? jaVoices : state.voices;

  state.preferredVoices.male =
    findVoiceByKeywords(fallbackVoices, ["male", "man", "taro", "ichiro", "ken"]) ||
    fallbackVoices[0] ||
    null;
  state.preferredVoices.female =
    findVoiceByKeywords(fallbackVoices, ["female", "woman", "hanako", "kyoko", "sakura"]) ||
    fallbackVoices[Math.min(1, fallbackVoices.length - 1)] ||
    fallbackVoices[0] ||
    null;

  els.voiceSelect.innerHTML = fallbackVoices
    .map(
      (voice) =>
        `<option value="${voice.voiceURI}">${voice.name} (${voice.lang})${
          voice.default ? " [default]" : ""
        }</option>`
    )
    .join("");

  const preset = document.querySelector('input[name="voicePreset"]:checked')?.value ?? "male";
  applyVoicePreset(preset);
}

function findVoiceByKeywords(voices, keywords) {
  return voices.find((voice) => {
    const name = voice.name.toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  });
}

function applyVoicePreset(preset) {
  const targetVoice = state.preferredVoices[preset] || state.preferredVoices.male || state.voices[0] || null;
  if (!targetVoice) {
    return;
  }
  state.selectedVoiceURI = targetVoice.voiceURI;
  els.voiceSelect.value = targetVoice.voiceURI;
}

function getSelectedVoice() {
  return state.voices.find((v) => v.voiceURI === state.selectedVoiceURI) || null;
}

function startReading() {
  if (!supportsSpeech) {
    showError("SpeechSynthesis APIに対応していないため再生できません。");
    return;
  }

  const chapter = getCurrentChapter();
  if (!chapter || !chapter.paragraphs?.length) {
    showError("読み上げ対象の章がありません。");
    return;
  }

  clearError();
  synth.cancel();
  state.paragraphIndex = 0;
  state.isReading = true;
  updateStatus("再生中");
  updateProgress();
  readNextParagraph();
}

function pauseReading() {
  if (!supportsSpeech) {
    return;
  }
  synth.pause();
  updateStatus("一時停止中");
}

function resumeReading() {
  if (!supportsSpeech) {
    return;
  }
  synth.resume();
  updateStatus("再生中");
}

function stopReading() {
  if (supportsSpeech) {
    synth.cancel();
  }
  state.isReading = false;
  state.paragraphIndex = 0;
  updateStatus("停止中");
  updateProgress();
  clearActiveParagraph();
}

function readNextParagraph() {
  const chapter = getCurrentChapter();
  const paragraphs = chapter?.paragraphs ?? [];

  if (!state.isReading) {
    return;
  }

  if (state.paragraphIndex >= paragraphs.length) {
    clearActiveParagraph();
    if (els.continuousToggle.checked) {
      goNextChapter();
      return;
    }
    state.isReading = false;
    updateStatus("停止中");
    return;
  }

  const text = paragraphs[state.paragraphIndex];
  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = getSelectedVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  } else {
    utterance.lang = "ja-JP";
  }
  utterance.rate = Number(els.rateRange.value);
  utterance.pitch = Number(els.pitchRange.value);

  highlightParagraph(state.paragraphIndex);
  updateProgress(state.paragraphIndex + 1);

  utterance.onend = () => {
    state.paragraphIndex += 1;
    readNextParagraph();
  };

  utterance.onerror = (event) => {
    state.isReading = false;
    updateStatus("停止中");
    showError(`読み上げ中にエラーが発生しました: ${event.error}`);
  };

  synth.speak(utterance);
}

function goNextChapter() {
  const book = getCurrentBook();
  const nextChapter = state.chapterIndex + 1;
  if (!book || nextChapter >= book.chapters.length) {
    state.isReading = false;
    updateStatus("停止中");
    return;
  }

  state.chapterIndex = nextChapter;
  els.chapterSelect.value = String(nextChapter);
  renderChapter();
  state.isReading = true;
  state.paragraphIndex = 0;
  updateStatus("再生中");
  readNextParagraph();
}

function highlightParagraph(index) {
  const paragraphNodes = [...els.paragraphList.querySelectorAll(".paragraph")];
  paragraphNodes.forEach((node) => node.classList.remove("active"));
  const current = paragraphNodes[index];
  if (current) {
    current.classList.add("active");
    current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function clearActiveParagraph() {
  const paragraphNodes = els.paragraphList.querySelectorAll(".paragraph");
  paragraphNodes.forEach((node) => node.classList.remove("active"));
}

function updateStatus(status) {
  state.status = status;
  els.statusText.textContent = status;
  updateCurrentRef();
}

function updateCurrentRef() {
  const book = getCurrentBook();
  const chapter = getCurrentChapter();
  if (!book || !chapter) {
    els.currentRef.textContent = "-";
    return;
  }
  els.currentRef.textContent = `${book.name} ${chapter.number}章`;
}

function updateProgress(current = state.paragraphIndex) {
  els.progressText.textContent = `${current} / ${state.totalParagraphs}`;
}

function showError(message) {
  els.errorText.textContent = message;
}

function clearError() {
  els.errorText.textContent = "";
}
