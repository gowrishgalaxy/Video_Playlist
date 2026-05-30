const app = document.getElementById("app");
const sectionListEl = document.getElementById("sectionList");
const binBodyEl = document.getElementById("binBody");
const recycleBinEl = document.getElementById("recycleBin");
const themeToggleEl = document.getElementById("themeToggle");
const newTopicInputEl = document.getElementById("newTopicInput");
const addSectionBtnEl = document.getElementById("addSectionBtn");
const linkDialogEl = document.getElementById("linkDialog");
const videoTitleInputEl = document.getElementById("videoTitleInput");
const videoUrlInputEl = document.getElementById("videoUrlInput");
const saveLinkBtnEl = document.getElementById("saveLinkBtn");
const cancelLinkBtnEl = document.getElementById("cancelLinkBtn");
const exportDataBtnEl = document.getElementById("exportDataBtn");
const importDataBtnEl = document.getElementById("importDataBtn");
const importDataInputEl = document.getElementById("importDataInput");
const STORAGE_KEY = "youtube-playlist-builder-state-v1";

const state = {
  theme: "dark",
  sections: [],
  deletedSections: [],
  deletedVideos: [],
  dialogTargetSectionId: null
};

function saveState() {
  const data = {
    theme: state.theme,
    sections: state.sections,
    deletedSections: state.deletedSections,
    deletedVideos: state.deletedVideos,
    lastSaved: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      if (data.lastSaved && (Date.now() - data.lastSaved > 10 * 60 * 1000)) {
        const navEntries = performance.getEntriesByType && performance.getEntriesByType("navigation");
        const isReload = navEntries && navEntries.length > 0 && navEntries[0].type === "reload";
        
        if (!isReload) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
      }
      state.theme = data.theme === "light" ? "light" : "dark";
      state.sections = Array.isArray(data.sections) ? data.sections : [];
      state.deletedSections = Array.isArray(data.deletedSections) ? data.deletedSections : [];
      state.deletedVideos = Array.isArray(data.deletedVideos) ? data.deletedVideos : [];
    }
  } catch (err) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: state.theme,
    sections: state.sections,
    deletedSections: state.deletedSections,
    deletedVideos: state.deletedVideos
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeDate = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "youtube-playlist-data-" + safeDate + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeAllVideoOrder() {
  state.sections.forEach((section) => {
    if (!Array.isArray(section.videos)) section.videos = [];
    normalizeVideoOrder(section);
  });
}

function applyImportedState(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid file format");
  }
  state.theme = data.theme === "light" ? "light" : "dark";
  state.sections = Array.isArray(data.sections) ? data.sections : [];
  state.deletedSections = Array.isArray(data.deletedSections) ? data.deletedSections : [];
  state.deletedVideos = Array.isArray(data.deletedVideos) ? data.deletedVideos : [];
  normalizeSectionOrder();
  normalizeAllVideoOrder();
}

function importDataFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      applyImportedState(parsed);
      app.dataset.theme = state.theme;
      document.body.dataset.theme = state.theme;
      themeToggleEl.textContent = state.theme === "light" ? "Dark mode" : "Light mode";
      saveState();
      renderSections();
      renderDeleted();
    } catch (err) {
      alert("Could not import data. Please use a valid export JSON file.");
    } finally {
      importDataInputEl.value = "";
    }
  };
  reader.onerror = () => {
    alert("Could not read the selected file.");
    importDataInputEl.value = "";
  };
  reader.readAsText(file);
}

function id() {
  return crypto.randomUUID();
}

function extractYouTubeVideoId(url) {
  if (!url) return null;
  const text = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/embed/")[1];
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/shorts/")[1];
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function createSection(name) {
  return {
    id: id(),
    title: name || "Playlist Name",
    orderNumber: state.sections.length + 1,
    createdAt: Date.now(),
    videos: []
  };
}

function normalizeSectionOrder() {
  state.sections.forEach((section, idx) => {
    section.orderNumber = idx + 1;
  });
}

function moveSectionToPriority(sectionId, targetPriority) {
  const currentIndex = state.sections.findIndex((s) => s.id === sectionId);
  if (currentIndex === -1) return;

  const [moved] = state.sections.splice(currentIndex, 1);
  const clampedIndex = Math.max(0, Math.min(targetPriority - 1, state.sections.length));
  state.sections.splice(clampedIndex, 0, moved);
  normalizeSectionOrder();
}

function normalizeVideoOrder(section) {
  section.videos.forEach((video, idx) => {
    video.index = idx + 1;
  });
}

function moveVideoToPriority(section, videoId, targetPriority) {
  const currentIndex = section.videos.findIndex((v) => v.id === videoId);
  if (currentIndex === -1) return;

  const [moved] = section.videos.splice(currentIndex, 1);
  const clampedIndex = Math.max(0, Math.min(targetPriority - 1, section.videos.length));
  section.videos.splice(clampedIndex, 0, moved);
  normalizeVideoOrder(section);
}

function openDialog(sectionId) {
  state.dialogTargetSectionId = sectionId;
  videoTitleInputEl.value = "";
  videoUrlInputEl.value = "";
  linkDialogEl.classList.add("show");
  videoTitleInputEl.focus();
}

function closeDialog() {
  state.dialogTargetSectionId = null;
  linkDialogEl.classList.remove("show");
}

function createVideoElement(section, video) {
  const slot = document.createElement("div");
  slot.className = "video-slot";
  slot.dataset.videoId = video.id;

  const thumb = document.createElement("div");
  thumb.className = "thumb-wrap";

  if (video.youtubeId) {
    const iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube.com/embed/" + video.youtubeId + "?controls=1&fs=1&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3";
    iframe.title = video.name || "YouTube video player";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    thumb.appendChild(iframe);
  }

  const meta = document.createElement("div");
  meta.className = "video-meta";

  const idx = document.createElement("select");
  idx.className = "video-index";
  const maxVideoPriority = Math.max(1, section.videos.length);
  for (let i = 1; i <= maxVideoPriority; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === video.index) opt.selected = true;
    idx.appendChild(opt);
  }
  idx.addEventListener("change", (e) => {
    moveVideoToPriority(section, video.id, Number(e.target.value));
    saveState();
    
    const grid = document.querySelector(`.section-card[data-section-id="${section.id}"] .video-grid`);
    if (grid) {
      section.videos.forEach(v => {
        const s = grid.querySelector(`.video-slot[data-video-id="${v.id}"]`);
        if (s) grid.appendChild(s);
      });
      updateSectionVideoDropdowns(section);
    } else {
      renderSections();
    }
  });

  const name = document.createElement("input");
  name.className = "video-name";
  name.type = "text";
  name.value = video.name;
  name.placeholder = "Video name";
  name.addEventListener("input", (e) => {
    video.name = e.target.value;
    saveState();
  });
  name.addEventListener("blur", (e) => {
    video.name = e.target.value.trim() || "Video name";
    name.value = video.name;
    saveState();
  });

  const deleteVideoBtn = document.createElement("button");
  deleteVideoBtn.className = "btn ghost video-delete";
  deleteVideoBtn.type = "button";
  deleteVideoBtn.textContent = "Delete";
  deleteVideoBtn.addEventListener("click", () => deleteVideo(section.id, video.id));

  meta.appendChild(idx);
  meta.appendChild(name);
  meta.appendChild(deleteVideoBtn);
  slot.appendChild(thumb);
  slot.appendChild(meta);
  
  return slot;
}

function updateSectionVideoDropdowns(section) {
  const grid = document.querySelector(`.section-card[data-section-id="${section.id}"] .video-grid`);
  if (!grid) return;
  const maxPriority = Math.max(1, section.videos.length);
  
  section.videos.forEach((video) => {
    const slot = grid.querySelector(`.video-slot[data-video-id="${video.id}"]`);
    if (!slot) return;
    const select = slot.querySelector(".video-index");
    if (!select) return;
    
    select.innerHTML = "";
    for (let i = 1; i <= maxPriority; i += 1) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === video.index) opt.selected = true;
      select.appendChild(opt);
    }
  });
}

function updateAllSectionDropdowns() {
  const maxPriority = Math.max(1, state.sections.length);
  state.sections.forEach((section) => {
    const card = document.querySelector(`.section-card[data-section-id="${section.id}"]`);
    if (!card) return;
    const select = card.querySelector(".section-id");
    if (!select) return;
    
    select.innerHTML = "";
    for (let i = 1; i <= maxPriority; i += 1) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === section.orderNumber) opt.selected = true;
      select.appendChild(opt);
    }
  });
}

function createSectionElement(section) {
  const card = document.createElement("article");
  card.className = "section-card";
  card.dataset.sectionId = section.id;

  const left = document.createElement("div");
  left.className = "left-rail";

  const nameInput = document.createElement("input");
  nameInput.className = "section-name";
  nameInput.type = "text";
  nameInput.value = section.title;
  nameInput.placeholder = "Playlist Name";
  nameInput.addEventListener("input", (e) => {
    section.title = e.target.value;
    saveState();
  });
  nameInput.addEventListener("blur", (e) => {
    section.title = e.target.value.trim() || "Playlist Name";
    nameInput.value = section.title;
    saveState();
  });

  const select = document.createElement("select");
  select.className = "section-id";
  const maxPriority = Math.max(1, state.sections.length);
  for (let i = 1; i <= maxPriority; i += 1) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === section.orderNumber) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", (e) => {
    moveSectionToPriority(section.id, Number(e.target.value));
    saveState();
    
    const movedCard = document.querySelector(`.section-card[data-section-id="${section.id}"]`);
    if (movedCard) {
      const newIndex = state.sections.findIndex((s) => s.id === section.id);
      if (newIndex === state.sections.length - 1) {
        sectionListEl.appendChild(movedCard);
      } else {
        const nextSection = state.sections[newIndex + 1];
        const nextCard = document.querySelector(`.section-card[data-section-id="${nextSection.id}"]`);
        if (nextCard) {
          sectionListEl.insertBefore(movedCard, nextCard);
        } else {
          renderSections();
        }
      }
      updateAllSectionDropdowns();
    } else {
      renderSections();
    }
  });

  left.appendChild(nameInput);
  left.appendChild(select);

  const main = document.createElement("div");
  main.className = "main-content";

  const topBtns = document.createElement("div");
  topBtns.className = "add-link-row";

  const addLinkBtn = document.createElement("button");
  addLinkBtn.className = "btn";
  addLinkBtn.type = "button";
  addLinkBtn.textContent = "Add link";
  addLinkBtn.addEventListener("click", () => openDialog(section.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn ghost";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteSection(section.id));

  topBtns.appendChild(addLinkBtn);
  topBtns.appendChild(deleteBtn);

  const grid = document.createElement("div");
  grid.className = "video-grid";

  section.videos.forEach((video) => {
    const slot = createVideoElement(section, video);
    grid.appendChild(slot);
  });

  main.appendChild(topBtns);
  main.appendChild(grid);

  card.appendChild(left);
  card.appendChild(main);
  
  return card;
}

function renderSections() {
  sectionListEl.innerHTML = "";
  state.sections.forEach((section) => {
    const card = createSectionElement(section);
    sectionListEl.appendChild(card);
  });
}

function renderDeleted() {
  if (state.deletedSections.length === 0 && state.deletedVideos.length === 0) {
    binBodyEl.innerHTML = '<div class="empty-msg">No deleted sections or videos</div>';
    return;
  }

  binBodyEl.innerHTML = "";
  state.deletedSections.forEach((section) => {
    const row = document.createElement("div");
    row.className = "deleted-item";

    const label = document.createElement("span");
    label.textContent = section.title + " (no. " + section.orderNumber + ")";

    const actions = document.createElement("div");
    const restore = document.createElement("button");
    restore.className = "btn";
    restore.type = "button";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreSection(section.id));

    actions.appendChild(restore);
    row.appendChild(label);
    row.appendChild(actions);
    binBodyEl.appendChild(row);
  });

  state.deletedVideos.forEach((deletedVideo) => {
    const row = document.createElement("div");
    row.className = "deleted-item";

    const label = document.createElement("span");
    label.textContent = "Video: " + (deletedVideo.video.name || "Video name") + " (from " + deletedVideo.sectionTitle + ")";

    const actions = document.createElement("div");
    const restore = document.createElement("button");
    restore.className = "btn";
    restore.type = "button";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreVideo(deletedVideo.id));

    actions.appendChild(restore);
    row.appendChild(label);
    row.appendChild(actions);
    binBodyEl.appendChild(row);
  });
}

function addSection() {
  const title = newTopicInputEl.value.trim();
  const newSection = createSection(title);
  state.sections.push(newSection);
  normalizeSectionOrder();
  newTopicInputEl.value = "";
  saveState();
  
  const card = createSectionElement(newSection);
  sectionListEl.appendChild(card);
  updateAllSectionDropdowns();
}

function deleteSection(sectionId) {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return;
  const [section] = state.sections.splice(idx, 1);
  state.deletedSections.unshift(section);
  normalizeSectionOrder();
  saveState();
  
  const card = document.querySelector(`.section-card[data-section-id="${sectionId}"]`);
  if (card) {
    card.remove();
    updateAllSectionDropdowns();
  } else {
    renderSections();
  }
  renderDeleted();
}

function restoreSection(sectionId) {
  const idx = state.deletedSections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return;
  const [section] = state.deletedSections.splice(idx, 1);
  state.sections.push(section);
  normalizeSectionOrder();
  saveState();
  
  const card = createSectionElement(section);
  sectionListEl.appendChild(card);
  updateAllSectionDropdowns();
  
  renderDeleted();
}

function deleteVideo(sectionId, videoId) {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return;
  const idx = section.videos.findIndex((v) => v.id === videoId);
  if (idx === -1) return;

  const [video] = section.videos.splice(idx, 1);
  state.deletedVideos.unshift({
    id: id(),
    sectionId,
    sectionTitle: section.title || "Playlist Name",
    video
  });
  normalizeVideoOrder(section);
  saveState();

  const grid = document.querySelector(`.section-card[data-section-id="${section.id}"] .video-grid`);
  if (grid) {
    const slot = grid.querySelector(`.video-slot[data-video-id="${videoId}"]`);
    if (slot) slot.remove();
    updateSectionVideoDropdowns(section);
  } else {
    renderSections();
  }
  renderDeleted();
}

function restoreVideo(deletedVideoId) {
  const idx = state.deletedVideos.findIndex((v) => v.id === deletedVideoId);
  if (idx === -1) return;
  const [deletedVideo] = state.deletedVideos.splice(idx, 1);

  const section = state.sections.find((s) => s.id === deletedVideo.sectionId);
  if (!section) {
    state.deletedVideos.unshift(deletedVideo);
    alert("Original section not available. Restore the section first.");
    renderDeleted();
    return;
  }

  section.videos.push(deletedVideo.video);
  normalizeVideoOrder(section);
  saveState();
  
  const grid = document.querySelector(`.section-card[data-section-id="${section.id}"] .video-grid`);
  if (grid) {
    const slot = createVideoElement(section, deletedVideo.video);
    grid.appendChild(slot);
    updateSectionVideoDropdowns(section);
  } else {
    renderSections();
  }
  renderDeleted();
}

function saveLink() {
  const section = state.sections.find((s) => s.id === state.dialogTargetSectionId);
  if (!section) return;

  const title = videoTitleInputEl.value.trim();
  const url = videoUrlInputEl.value.trim();
  const youtubeId = extractYouTubeVideoId(url);

  if (!youtubeId) {
    alert("Please paste a valid YouTube link.");
    return;
  }

  const newVideo = {
    id: id(),
    index: 0,
    name: title || "Video name",
    youtubeId,
    createdAt: Date.now()
  };

  section.videos.push(newVideo);
  normalizeVideoOrder(section);
  saveState();
  
  const grid = document.querySelector(`.section-card[data-section-id="${section.id}"] .video-grid`);
  if (grid) {
    const slot = createVideoElement(section, newVideo);
    grid.appendChild(slot);
    updateSectionVideoDropdowns(section);
  } else {
    renderSections();
  }
  closeDialog();
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  app.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  themeToggleEl.textContent = state.theme === "light" ? "Dark mode" : "Light mode";
  saveState();
}

document.getElementById("binToggle").addEventListener("click", () => {
  recycleBinEl.classList.toggle("open");
});
addSectionBtnEl.addEventListener("click", addSection);
newTopicInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSection();
});
cancelLinkBtnEl.addEventListener("click", closeDialog);
saveLinkBtnEl.addEventListener("click", saveLink);
exportDataBtnEl.addEventListener("click", exportData);
importDataBtnEl.addEventListener("click", () => importDataInputEl.click());
importDataInputEl.addEventListener("change", (e) => {
  const target = e.target;
  const file = target.files && target.files[0] ? target.files[0] : null;
  importDataFromFile(file);
});
linkDialogEl.addEventListener("click", (e) => {
  if (e.target === linkDialogEl) closeDialog();
});
themeToggleEl.addEventListener("click", toggleTheme);
window.addEventListener("beforeunload", saveState);

loadState();
app.dataset.theme = state.theme;
document.body.dataset.theme = state.theme;
themeToggleEl.textContent = state.theme === "light" ? "Dark mode" : "Light mode";
renderSections();
renderDeleted();