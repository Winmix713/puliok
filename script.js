
/* --- START OF FILE script.js --- */
(function() {
    'use strict';

    // --- Config ---
    const CONFIG = {
        localStorageKey: 'slideEditorPresentation_v3',
        debounceDelay: 300,
        zoomLevels: [0.5, 0.75, 1.0, 1.5, 2.0],
        defaultZoom: 1.0,
        minZoom: 0.2,
        maxZoom: 3.0,
        defaultSlideTitle: 'Cím nélküli dia',
        defaultSlideSubtitle: '',
        newSlideBaseTitle: 'Új Dia',
        newSlideContentPlaceholder: '<p>Kezdj el gépelni...</p>',
        slideContentPlaceholderText: 'Tartalom hozzáadása...',
        // --- === KRITIKUS FIGYELMEZTETÉS (execCommand) === ---
        // A 'document.execCommand' használata ELAVULT, MEGBÍZHATATLAN és potenciálisan NEM BIZTONSÁGOS.
        // Az alábbi formázási funkciók (különösen szín, betűtípus, méret) MEGBÍZHATATLANOK lesznek.
        // ERŐSEN AJÁNLOTT a cseréje modern API-kra vagy könyvtárra komolyabb felhasználás esetén.
        // --- === FIGYELMEZTETÉS VÉGE === ---
        textFormattingCommands: ['bold', 'italic', 'underline'], // StrikeThrough opcionális
        listCommands: ['insertOrderedList', 'insertUnorderedList'],
        alignmentCommands: ['justifyLeft', 'justifyCenter', 'justifyRight'],
        colorCommands: ['foreColor', 'backColor'],
        otherCommands: ['undo', 'redo', 'removeFormat', 'indent', 'outdent']
    };

    // --- State ---
    const editorState = {
        presentationTitle: "Névtelen Prezentáció",
        slides: [],
        selectedSlideId: null,
        currentZoom: CONFIG.defaultZoom,
        lastSaved: null,
        isDirty: false,
        isTitleEditing: false,
        searchQuery: '', // Keresési állapot
    };

    // --- DOM Cache ---
    const DOM = {
         slideTitleInput: null, slideSubtitleInput: null, slideContentEditor: null,
         slideList: null, slideCanvas: null, editorToolbar: null, saveButton: null,
         saveButtonText: null, presentationTitle: null, presentationLastEdited: null,
         canvasHeading: null, canvasPlaceholder: null, prevSlideButton: null,
         nextSlideButton: null, slideIndicator: null, shareModal: null, shareUrlInput: null,
         copyShareUrlButton: null, shareButton: null, addSlideButton: null, canvasScaler: null,
         mainArea: null, bottomBar: null, zoomLevelSelect: null, fullscreenEnterIcon: null,
         fullscreenExitIcon: null, fullscreenButton: null, presentButton: null, downloadButton: null,
         moreOptionsDropdown: null, moreOptionsButton: null, renameOption: null,
         duplicateOption: null, historyOption: null, downloadOptionAlt: null,
         slideListLoading: null, errorDisplay: null, zoomOutButton: null, zoomInButton: null,
         searchSlidesInput: null, fontFamilySelect: null, fontSizeSelect: null, slideListEmpty: null, // Új elemek
         body: document.body,
    };

    // --- Utilities ---
    function showError(message, duration = 5000) {
        if (!DOM.errorDisplay) return;
        console.error("Editor Hiba:", message);
        DOM.errorDisplay.textContent = message;
        DOM.errorDisplay.classList.remove('hidden');
        DOM.errorDisplay.setAttribute('aria-hidden', 'false');
        if (DOM.errorDisplay.timer) clearTimeout(DOM.errorDisplay.timer);
        if (duration > 0) {
            DOM.errorDisplay.timer = setTimeout(() => {
                hideError();
                DOM.errorDisplay.timer = null;
            }, duration);
        }
    }
    function hideError() {
        if (!DOM.errorDisplay) return;
        if (DOM.errorDisplay.timer) { clearTimeout(DOM.errorDisplay.timer); DOM.errorDisplay.timer = null; }
        DOM.errorDisplay.classList.add('hidden');
        DOM.errorDisplay.setAttribute('aria-hidden', 'true');
        DOM.errorDisplay.textContent = '';
    }
    function formatTimestamp(timestamp) {
        if (!timestamp || isNaN(timestamp)) return 'még nem mentve';
        try {
             const date = new Date(timestamp);
             return date.toLocaleString('hu-HU', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
         } catch (e) { console.error("Timestamp formázási hiba:", timestamp, e); showError("Dátum formázási hiba."); return 'érvénytelen dátum'; }
    }
    function generateUniqueId(prefix = 'id') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
    function getContrastColor(hexcolor) {
        const defaultColor = CONFIG.slideTextDefault; const lightColor = '#FFFFFF';
        if (!hexcolor || typeof hexcolor !== 'string' || !hexcolor.startsWith('#')) return defaultColor;
        hexcolor = hexcolor.slice(1);
        if (hexcolor.length === 3) hexcolor = hexcolor[0].repeat(2) + hexcolor[1].repeat(2) + hexcolor[2].repeat(2);
        if (hexcolor.length !== 6) return defaultColor;
        try {
            const r = parseInt(hexcolor.substring(0, 2), 16), g = parseInt(hexcolor.substring(2, 4), 16), b = parseInt(hexcolor.substring(4, 6), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? defaultColor : lightColor;
        } catch (e) { console.error("Kontraszt szín hiba:", hexcolor, e); return defaultColor; }
    }
    function debounce(func, delay) {
        let timeout;
        return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); };
    }
    function setDirty(isDirty) {
        if (editorState.isDirty === isDirty) return;
        editorState.isDirty = isDirty;
        DOM.saveButton?.classList.toggle('text-yellow-400', isDirty);
        const saveLabel = isDirty ? 'Prezentáció mentése (mentetlen változások)' : 'Prezentáció mentése';
        DOM.saveButton?.setAttribute('aria-label', saveLabel);
        const saveTitle = isDirty ? 'Mentés (Ctrl+S) - Mentetlen változások!' : 'Mentés (Ctrl+S)';
        DOM.saveButton?.setAttribute('title', saveTitle);
        const baseTitle = "Modern Prezentáció Szerkesztő";
        const currentPresTitle = editorState.presentationTitle || "Névtelen Prezentáció";
        document.title = isDirty ? `* ${currentPresTitle} - ${baseTitle}` : `${currentPresTitle} - ${baseTitle}`;
    }

    // --- Slide Structure & Creation ---
    function createDefaultSlides() { const id = generateUniqueId('slide'); return [{ id: id, title: 'Kezdő Dia', subtitle: 'Kattints ide a szerkesztéshez', content: '', backgroundColor: '#FFFFFF' }]; }
    function createNewSlide() { const id = generateUniqueId('slide'); return { id: id, title: `${CONFIG.newSlideBaseTitle} ${editorState.slides.length + 1}`, subtitle: '', content: CONFIG.newSlideContentPlaceholder, backgroundColor: '#FFFFFF' }; }

    // --- Rendering Functions ---
    function renderSidebar() {
        if (!DOM.slideList || !DOM.slideListEmpty) { console.error("renderSidebar: Hiányzó DOM elemek."); return; }
        DOM.slideList.textContent = '';
        DOM.slideListLoading?.classList.add('hidden');

        const query = editorState.searchQuery.trim().toLowerCase();
        const filteredSlides = query ? editorState.slides.filter(s => (s.title || '').toLowerCase().includes(query)) : editorState.slides;

        if (filteredSlides.length === 0) {
            DOM.slideListEmpty.textContent = query ? 'Nincs a keresésnek megfelelő dia.' : 'Nincsenek diák. Adj hozzá egyet!';
            DOM.slideListEmpty.classList.remove('hidden');
            updateNavigationButtons();
            return;
        }
        DOM.slideListEmpty.classList.add('hidden');

        const fragment = document.createDocumentFragment();
        let selectedElement = null;

        filteredSlides.forEach((slide) => {
            const originalIndex = editorState.slides.findIndex(s => s.id === slide.id);
            const isSelected = slide.id === editorState.selectedSlideId;
            const item = document.createElement('div');
            item.className = 'slide-item'; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', isSelected.toString()); item.tabIndex = -1; item.setAttribute('aria-labelledby', `slide-title-label-${slide.id}`); item.dataset.slideId = slide.id;
            const slideNumber = document.createElement('span'); slideNumber.className = 'slide-number'; slideNumber.textContent = originalIndex + 1; slideNumber.setAttribute('aria-hidden', 'true');
            const preview = document.createElement('div'); preview.className = 'slide-preview'; preview.style.backgroundColor = slide.backgroundColor || '#FFFFFF'; preview.setAttribute('aria-hidden', 'true');
            const previewTextSpan = document.createElement('span'); previewTextSpan.style.color = getContrastColor(preview.style.backgroundColor); previewTextSpan.textContent = (slide.title || CONFIG.defaultSlideTitle).substring(0, 25) + ((slide.title || '').length > 25 ? '…' : ''); preview.appendChild(previewTextSpan);
            const titleLabel = document.createElement('span'); titleLabel.id = `slide-title-label-${slide.id}`; titleLabel.className = 'slide-title-label'; titleLabel.textContent = slide.title || CONFIG.defaultSlideTitle;
            const deleteButton = document.createElement('button'); deleteButton.type = 'button'; deleteButton.className = 'delete-button action-button icon-only'; deleteButton.title = `Dia ${originalIndex + 1} törlése`; deleteButton.setAttribute('aria-label', `Dia ${originalIndex + 1} (${slide.title || CONFIG.defaultSlideTitle}) törlése`); deleteButton.tabIndex = -1; deleteButton.dataset.slideId = slide.id;
            const svgNS = "http://www.w3.org/2000/svg"; const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("pointer-events-none"); const polyline1 = document.createElementNS(svgNS, "polyline"); polyline1.setAttribute("points", "3 6 5 6 21 6"); const path1 = document.createElementNS(svgNS, "path"); path1.setAttribute("d", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"); svg.appendChild(polyline1); svg.appendChild(path1); deleteButton.appendChild(svg);
            item.appendChild(slideNumber); item.appendChild(preview); item.appendChild(titleLabel); item.appendChild(deleteButton);
            if (isSelected) selectedElement = item;
            fragment.appendChild(item);
        });
        DOM.slideList.appendChild(fragment);

        const allItems = DOM.slideList.querySelectorAll('.slide-item');
        if (allItems.length > 0) {
             let focusableItem = selectedElement || allItems[0];
             allItems.forEach(it => it.setAttribute('tabindex', '-1'));
             focusableItem.setAttribute('tabindex', '0');
             if (selectedElement && document.activeElement !== selectedElement && !selectedElement.contains(document.activeElement)) {
                  const rect = selectedElement.getBoundingClientRect(); const listRect = DOM.slideList.getBoundingClientRect();
                  if (rect.top < listRect.top || rect.bottom > listRect.bottom) selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
             }
         }
        updateNavigationButtons();
    }
    function renderCanvas() {
        if (!DOM.slideCanvas) return;
        const selectedSlide = editorState.slides.find(s => s.id === editorState.selectedSlideId);
        DOM.slideCanvas.textContent = '';
        if (!selectedSlide) {
             DOM.canvasPlaceholder?.classList.remove('hidden');
             DOM.slideTitleInput = DOM.slideSubtitleInput = DOM.slideContentEditor = DOM.canvasHeading = null;
             DOM.slideCanvas.style.backgroundColor = CONFIG.slideBgDefault; DOM.slideCanvas.style.color = CONFIG.slideTextDefault; DOM.slideCanvas.contentEditable = 'false';
             updateToolbarState(); updateNavigationButtons(); return;
        }
        DOM.canvasPlaceholder?.classList.add('hidden'); DOM.slideCanvas.contentEditable = 'inherit';
        const bgColor = selectedSlide.backgroundColor || CONFIG.slideBgDefault; const textColor = getContrastColor(bgColor);
        DOM.slideCanvas.style.backgroundColor = bgColor; DOM.slideCanvas.style.color = textColor;
        const srHeading = document.createElement('h2'); srHeading.id = 'canvas-heading'; srHeading.className = 'sr-only'; srHeading.textContent = `Dia szerkesztése: ${selectedSlide.title || CONFIG.defaultSlideTitle}`;
        const titleDiv = document.createElement('div'); titleDiv.id = 'slide-title-input'; titleDiv.contentEditable = 'true'; titleDiv.textContent = selectedSlide.title || ''; titleDiv.setAttribute('placeholder', CONFIG.defaultSlideTitle); titleDiv.dataset.field = 'title'; titleDiv.setAttribute('aria-label', 'Dia Címe');
        const subtitleDiv = document.createElement('div'); subtitleDiv.id = 'slide-subtitle-input'; subtitleDiv.contentEditable = 'true'; subtitleDiv.textContent = selectedSlide.subtitle || ''; subtitleDiv.setAttribute('placeholder', CONFIG.defaultSlideSubtitle); subtitleDiv.dataset.field = 'subtitle'; subtitleDiv.setAttribute('aria-label', 'Dia Alcíme');
        const contentEditor = document.createElement('div'); contentEditor.id = 'slide-content-editor'; contentEditor.role = 'textbox'; contentEditor.setAttribute('aria-multiline', 'true'); contentEditor.setAttribute('aria-label', 'Dia tartalma'); contentEditor.contentEditable = 'true'; contentEditor.setAttribute('placeholder', CONFIG.slideContentPlaceholderText); contentEditor.innerHTML = selectedSlide.content || CONFIG.newSlideContentPlaceholder; contentEditor.dataset.field = 'content';
        DOM.slideCanvas.appendChild(srHeading); DOM.slideCanvas.appendChild(titleDiv); DOM.slideCanvas.appendChild(subtitleDiv); DOM.slideCanvas.appendChild(contentEditor);
        DOM.canvasHeading = srHeading; DOM.slideTitleInput = titleDiv; DOM.slideSubtitleInput = subtitleDiv; DOM.slideContentEditor = contentEditor;
        updateNavigationButtons(); updateToolbarState();
    }
    function updateLastEditedStatus(timestamp = editorState.lastSaved) { if (DOM.presentationLastEdited) { DOM.presentationLastEdited.textContent = `Mentve: ${formatTimestamp(timestamp)}`; DOM.presentationLastEdited.setAttribute('datetime', timestamp ? new Date(timestamp).toISOString() : ''); } }
    function updateNavigationButtons() {
        if (!DOM.prevSlideButton || !DOM.nextSlideButton || !DOM.slideIndicator) return;
        const total = editorState.slides.length; const currentIdx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId);
        if (currentIdx === -1 || total === 0) { DOM.prevSlideButton.disabled = true; DOM.nextSlideButton.disabled = true; DOM.slideIndicator.textContent = `- / -`; DOM.slideIndicator.setAttribute('aria-label', 'Nincs kiválasztott dia'); DOM.slideIndicator.title = ''; }
        else { DOM.prevSlideButton.disabled = currentIdx === 0; DOM.nextSlideButton.disabled = currentIdx === total - 1; DOM.slideIndicator.textContent = `${currentIdx + 1} / ${total}`; const label = `Jelenlegi dia: ${currentIdx + 1} / ${total}`; DOM.slideIndicator.setAttribute('aria-label', label); DOM.slideIndicator.title = label; }
    }
    function updateToolbarState() {
        if (!document.queryCommandState || !DOM.editorToolbar) return;
        const activeEl = document.activeElement;
        const isEditableFocus = activeEl?.isContentEditable && DOM.slideCanvas?.contains(activeEl);
        const commandsToCheck = [...CONFIG.textFormattingCommands, ...CONFIG.listCommands, ...CONFIG.alignmentCommands, 'indent', 'outdent'];
        commandsToCheck.forEach(cmd => {
            const btn = DOM.editorToolbar.querySelector(`button[data-command="${cmd}"]`);
            if (btn) { let isActive = false; if (isEditableFocus) try { isActive = document.queryCommandState(cmd); } catch(e) {} btn.setAttribute('aria-pressed', isActive.toString()); btn.classList.toggle('active-toolbar-button', isActive); }
        });
        const isDisabled = !isEditableFocus;
        DOM.editorToolbar.querySelectorAll('button[data-command], select[data-command], button[data-feature]').forEach(el => {
             const cmd = el.dataset.command; if (cmd === 'undo' || cmd === 'redo') return;
             if (el.getAttribute('aria-disabled') !== 'true') el.disabled = isDisabled;
        });
        // Font/Size select update (unreliable with execCommand) - commented out
        // if (isEditableFocus) { try { /* queryCommandValue attempts */ } catch(e) {} }
    }
    function updateFullscreenButtonIcon(isFullscreen) { if (DOM.fullscreenEnterIcon && DOM.fullscreenExitIcon && DOM.fullscreenButton) { DOM.fullscreenEnterIcon.classList.toggle('hidden', isFullscreen); DOM.fullscreenExitIcon.classList.toggle('hidden', !isFullscreen); const label = isFullscreen ? 'Kilépés (Esc)' : 'Teljes képernyő (f)'; DOM.fullscreenButton.setAttribute('aria-label', label); DOM.fullscreenButton.title = label; } }

    // --- Actions ---
    function selectSlide(slideId) { if (!slideId || editorState.selectedSlideId === slideId) return; editorState.selectedSlideId = slideId; hideError(); renderSidebar(); renderCanvas(); setTimeout(() => { if (!DOM.body.classList.contains('presentation-mode')) DOM.slideContentEditor?.focus({ preventScroll: true }); }, 50); }
    function addSlide() { hideError(); const newSlide = createNewSlide(); const currentIdx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId); const insertIdx = (currentIdx === -1) ? editorState.slides.length : currentIdx + 1; editorState.slides.splice(insertIdx, 0, newSlide); setDirty(true); selectSlide(newSlide.id); setTimeout(() => { const newItem = DOM.slideList?.querySelector(`.slide-item[data-slide-id="${newSlide.id}"]`); if (newItem) { DOM.slideList?.querySelectorAll('.slide-item').forEach(it => it.setAttribute('tabindex', '-1')); newItem.setAttribute('tabindex', '0'); newItem.focus(); newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, 50); }
    function deleteSlide(slideIdToDelete) {
        const slideIndex = editorState.slides.findIndex(s => s.id === slideIdToDelete); if (slideIndex === -1) return;
        const slideTitle = editorState.slides[slideIndex].title || CONFIG.defaultSlideTitle; if (!confirm(`Biztosan törölni szeretnéd: "${slideTitle}"?\nEz nem vonható vissza.`)) return;
        const wasSelected = editorState.selectedSlideId === slideIdToDelete; editorState.slides.splice(slideIndex, 1); setDirty(true); let nextSelectedId = null; let elementToFocus = null;
        if (editorState.slides.length === 0) { editorState.selectedSlideId = null; elementToFocus = DOM.addSlideButton; }
        else { const newIndex = Math.min(slideIndex, editorState.slides.length - 1); nextSelectedId = wasSelected ? editorState.slides[newIndex].id : editorState.selectedSlideId; editorState.selectedSlideId = nextSelectedId; }
        renderSidebar(); renderCanvas();
        setTimeout(() => { if (nextSelectedId) elementToFocus = DOM.slideList?.querySelector(`.slide-item[data-slide-id="${nextSelectedId}"][tabindex="0"]`); if (!elementToFocus) elementToFocus = DOM.addSlideButton; elementToFocus?.focus(); }, 50);
    }
    const debouncedUpdateSlideData = debounce((field, value) => {
        if (!editorState.selectedSlideId) return; const idx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId); if (idx === -1) return;
        const slide = editorState.slides[idx]; if (slide[field] !== value) { slide[field] = value; if (field === 'title' || field === 'backgroundColor') { renderSidebar(); if (field === 'title' && DOM.canvasHeading) DOM.canvasHeading.textContent = `Dia szerkesztése: ${value || CONFIG.defaultSlideTitle}`; } setDirty(true); }
    }, CONFIG.debounceDelay);
    function findNextSlideId() { const idx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId); return (idx !== -1 && idx < editorState.slides.length - 1) ? editorState.slides[idx + 1].id : null; }
    function findPreviousSlideId() { const idx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId); return (idx > 0) ? editorState.slides[idx - 1].id : null; }
    function navigateSlides(direction) { hideError(); const targetId = direction === 'next' ? findNextSlideId() : findPreviousSlideId(); if (targetId) { selectSlide(targetId); setTimeout(() => { if (!DOM.body.classList.contains('presentation-mode')) DOM.slideList?.querySelector(`.slide-item[data-slide-id="${targetId}"]`)?.focus(); }, 50); } }
    function captureFocusedElementState() {
        const activeEl = document.activeElement; const idx = editorState.slides.findIndex(s => s.id === editorState.selectedSlideId);
        if (idx === -1 || !DOM.slideCanvas?.contains(activeEl) || !activeEl.isContentEditable) return;
        let field = null, value = null;
        if (activeEl === DOM.slideTitleInput) field = 'title'; else if (activeEl === DOM.slideSubtitleInput) field = 'subtitle'; else if (activeEl === DOM.slideContentEditor) field = 'content';
        if (field) { value = (field === 'content') ? activeEl.innerHTML : activeEl.textContent; if (editorState.slides[idx][field] !== value) { editorState.slides[idx][field] = value; setDirty(true); if (field === 'title') { renderSidebar(); if (DOM.canvasHeading) DOM.canvasHeading.textContent = `Dia szerkesztése: ${value || CONFIG.defaultSlideTitle}`; } } }
    }
    function savePresentation() {
        hideError(); captureFocusedElementState();
        if (DOM.presentationTitle) { if (!editorState.presentationTitle) editorState.presentationTitle = "Névtelen Prezentáció"; DOM.presentationTitle.textContent = editorState.presentationTitle; }
        try {
            const data = { presentationTitle: editorState.presentationTitle, slides: editorState.slides, selectedSlideId: editorState.selectedSlideId, savedAt: new Date().toISOString(), version: CONFIG.localStorageKey };
            localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(data)); editorState.lastSaved = Date.parse(data.savedAt); setDirty(false); updateLastEditedStatus();
            if (DOM.saveButton && DOM.saveButtonText) { const original = "Mentés"; DOM.saveButtonText.textContent = 'Mentve!'; DOM.saveButton.classList.add('text-green-500'); DOM.saveButton.disabled = true; setTimeout(() => { if (DOM.saveButton && DOM.saveButtonText.textContent === 'Mentve!') { DOM.saveButtonText.textContent = original; DOM.saveButton.classList.remove('text-green-500'); DOM.saveButton.disabled = false; } }, 1500); }
            console.log('Mentve:', data.savedAt);
        } catch (e) { console.error('Mentési hiba:', e); let msg = 'Hiba mentéskor.'; if (e.name === 'QuotaExceededError') msg = 'Nincs elég hely.'; showError(msg); }
    }
    function loadPresentation() {
        hideError(); const saved = localStorage.getItem(CONFIG.localStorageKey); let loaded = null;
        if (saved) { try { loaded = JSON.parse(saved); if (!loaded || typeof loaded !== 'object') throw new Error("Invalid format."); if (loaded.version !== CONFIG.localStorageKey) console.warn(`Verzió eltérés: ${loaded.version} vs ${CONFIG.localStorageKey}`); if (!loaded.slides || !Array.isArray(loaded.slides)) { console.warn("Hiányzó/érvénytelen 'slides', alaphelyzet."); loaded = null; } } catch (e) { console.error('Betöltési hiba:', e); showError("Hiba betöltéskor, lehet sérült adat. Alaphelyzet."); localStorage.removeItem(CONFIG.localStorageKey); loaded = null; } }
        if (loaded) {
             editorState.presentationTitle = loaded.presentationTitle || "Névtelen Prez.";
             editorState.slides = loaded.slides.map(s => ({ id: s.id || generateUniqueId('slide'), title: s.title ?? CONFIG.defaultSlideTitle, subtitle: s.subtitle ?? '', content: s.content ?? '', backgroundColor: s.backgroundColor || CONFIG.slideBgDefault }));
             let validId = loaded.selectedSlideId && editorState.slides.some(s => s.id === loaded.selectedSlideId) ? loaded.selectedSlideId : null;
             if (!validId && editorState.slides.length > 0) validId = editorState.slides[0].id; editorState.selectedSlideId = validId;
             editorState.lastSaved = loaded.savedAt ? Date.parse(loaded.savedAt) : null; if (isNaN(editorState.lastSaved)) editorState.lastSaved = null; console.log('Betöltve.');
        } else { initializeDefaultState(); console.log('Alap állapot.'); }
        if (DOM.presentationTitle) DOM.presentationTitle.textContent = editorState.presentationTitle; document.title = `${editorState.presentationTitle} - Modern Prez. Szerk.`;
        setDirty(false); updateLastEditedStatus(); renderSidebar(); renderCanvas(); setZoom(editorState.currentZoom);
    }
    function initializeDefaultState() { editorState.presentationTitle = "Névtelen Prez."; editorState.slides = createDefaultSlides(); editorState.selectedSlideId = editorState.slides[0]?.id || null; editorState.lastSaved = null; editorState.isDirty = false; editorState.currentZoom = CONFIG.defaultZoom; editorState.searchQuery = ''; hideError(); }
    function showShareModal() { if (!DOM.shareModal) return; hideError(); const url = `${location.origin}${location.pathname}?s=${generateUniqueId('sh')}`; if (DOM.shareUrlInput) DOM.shareUrlInput.value = url; if (DOM.copyShareUrlButton) DOM.copyShareUrlButton.textContent = 'Másolás'; if (typeof DOM.shareModal.showModal === 'function') DOM.shareModal.showModal(); else DOM.shareModal.setAttribute('open', ''); setTimeout(() => DOM.copyShareUrlButton?.focus(), 50); }
    function hideShareModal() { if (!DOM.shareModal) return; if (typeof DOM.shareModal.close === 'function') DOM.shareModal.close(); else DOM.shareModal.removeAttribute('open'); DOM.shareButton?.focus(); }
    async function copyShareUrl() {
        if (!DOM.shareUrlInput || !DOM.copyShareUrlButton) return; hideError(); const url = DOM.shareUrlInput.value; const btn = DOM.copyShareUrlButton; const original = btn.textContent; btn.disabled = true;
        try { if (!navigator.clipboard) throw new Error("Clipboard API unavailable."); await navigator.clipboard.writeText(url); btn.textContent = 'Másolva!'; console.log('URL másolva (API).'); }
        catch (err) { console.warn('API másolás hiba, fallback:', err); try { DOM.shareUrlInput.select(); btn.textContent = 'Kijelölve!'; alert("Link kijelölve. Másold (Ctrl+C)."); console.log('URL kijelölve (Fallback).'); } catch (fbErr) { console.error('Fallback hiba:', fbErr); btn.textContent = 'Hiba'; showError("Másolás nem sikerült."); } }
        finally { setTimeout(() => { if (btn) { btn.textContent = original; btn.disabled = false; } }, 2000); }
    }
    function startPresentation() {
        hideError(); if (editorState.slides.length === 0) { showError("Nincs dia a bemutatáshoz.", 3000); return; } if (!editorState.selectedSlideId && editorState.slides.length > 0) editorState.selectedSlideId = editorState.slides[0].id; if(editorState.isDirty) { console.log("Mentés prez. előtt."); savePresentation(); }
        DOM.body.classList.add('presentation-mode'); renderCanvas();
        const el = document.documentElement; try { (el.requestFullscreen?.() || el.webkitRequestFullscreen?.() || el.msRequestFullscreen?.())?.catch(e => console.warn("Fullscreen hiba:", e)); } catch (e) { console.error("Fullscreen hiba:", e); }
        document.addEventListener('keydown', handlePresentationKeys); updateFullscreenButtonIcon(true);
    }
    function exitPresentation() {
        if (!DOM.body.classList.contains('presentation-mode')) return; DOM.body.classList.remove('presentation-mode');
        const doc = document; try { (doc.exitFullscreen?.() || doc.webkitExitFullscreen?.() || doc.msExitFullscreen?.())?.catch(e => console.error("Exit Fullscreen hiba:", e)); } catch (e) { console.error("Exit Fullscreen hiba:", e); }
        document.removeEventListener('keydown', handlePresentationKeys); updateFullscreenButtonIcon(false); renderCanvas(); applyZoom(); DOM.presentButton?.focus();
    }
    async function toggleFullscreen() {
         const doc = document; const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement); hideError();
         try { if (!isFs) { const el = document.documentElement; await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.() || el.msRequestFullscreen?.()); } else { await (doc.exitFullscreen?.() || doc.webkitExitFullscreen?.() || doc.msExitFullscreen?.()); } }
         catch(err) { console.warn("Fullscreen váltás hiba:", err); showError(`Fullscreen ${isFs ? 'elhagyása' : 'bekapcsolása'} sikertelen.`, 4000); }
     }
    function downloadPresentation() {
         hideError(); if (editorState.isDirty) captureFocusedElementState();
         try {
             const data = { presentationTitle: editorState.presentationTitle, slides: editorState.slides, savedAt: editorState.lastSaved ? new Date(editorState.lastSaved).toISOString() : null, downloadedAt: new Date().toISOString(), appVersion: CONFIG.localStorageKey };
             const json = JSON.stringify(data, null, 2); const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
             const fNameBase = (editorState.presentationTitle || 'prez').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
             const dateStr = new Date().toISOString().split('T')[0]; const filename = `${fNameBase || 'prezentacio'}_${dateStr}.json`;
             const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); console.log('Letöltés:', filename);
         } catch (e) { console.error('Letöltési hiba:', e); showError('Hiba a JSON letöltése közben.'); }
     }
    function toggleMoreOptions() { if (!DOM.moreOptionsDropdown || !DOM.moreOptionsButton) return; hideError(); const hidden = DOM.moreOptionsDropdown.classList.toggle('hidden'); DOM.moreOptionsButton.setAttribute('aria-expanded', !hidden); if (!hidden) { const firstItem = DOM.moreOptionsDropdown.querySelector('a[role="menuitem"]:not([aria-disabled="true"])'); setTimeout(() => firstItem?.focus(), 0); } }
    function applyZoom() { /* ... (Változatlan) ... */ }
    function changeZoom(delta) { /* ... (Változatlan) ... */ }
    function setZoom(value) { /* ... (Változatlan) ... */ }

    // --- Event Handlers ---
    function handleSidebarInteraction(event) { /* ... (Változatlan) ... */ }
    function handleSidebarKeyDown(event) { /* ... (Változatlan) ... */ }
    async function handleToolbarAction(event) {
        const element = event.target.closest('button[data-command], select[data-command]');
        if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return;
        hideError(); const command = element.dataset.command; let value = element.value || element.dataset.value || null;
        if (!editorState.selectedSlideId) { showError("Nincs kiválasztott dia.", 3000); return; }
        let targetEditor = null; const activeEl = document.activeElement; if (activeEl?.isContentEditable && DOM.slideCanvas?.contains(activeEl)) targetEditor = activeEl; else if (DOM.slideContentEditor) { DOM.slideContentEditor.focus(); await new Promise(r => setTimeout(r, 0)); if (document.activeElement === DOM.slideContentEditor) targetEditor = DOM.slideContentEditor; }
        if (!targetEditor) { showError("Kattints a szerkesztendő szövegbe.", 4000); return; }

        // FONTOS: fontName/fontSize nem fut execCommanddal
        if (command === 'fontName' || command === 'fontSize') { console.warn(`"${command}" nincs implementálva execCommanddal.`); showError(`A ${command === 'fontName' ? 'betűtípus' : 'betűméret'} állítása nem támogatott.`, 3000); targetEditor.focus(); return; }

        if (CONFIG.colorCommands.includes(command)) { const type = command === 'foreColor' ? 'szöveg' : 'kiemelés'; const def = command === 'foreColor' ? '#000000' : '#FFFF00'; const color = prompt(`Add meg a ${type} színét:`, def); if (color !== null && color !== '') value = color; else { console.log("Színválasztás megszakítva."); targetEditor.focus(); return; } }

        try { console.log(`execCommand: ${command}, érték: ${value}`); let executed = document.execCommand(command, false, value); if (executed) { targetEditor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); updateToolbarState(); } else { console.warn(`execCommand "${command}" sikertelennek tűnik.`); } }
        catch (e) { console.error(`Hiba "${command}" közben:`, e); showError(`Hiba a(z) "${command}" művelet közben.`); }
        targetEditor.focus();
    }
    function handleCanvasInput(event) { const target = event.target; if (target?.isContentEditable && (target === DOM.slideTitleInput || target === DOM.slideSubtitleInput || target === DOM.slideContentEditor)) { const field = target.dataset.field; if (field) { const value = (field === 'content') ? target.innerHTML : target.textContent; debouncedUpdateSlideData(field, value); } } }
    function handlePresentationKeys(event) { /* ... (Változatlan) ... */ }
    function handleFullscreenChange() { /* ... (Változatlan) ... */ }
    function handleGlobalClick(event) { if (DOM.moreOptionsDropdown && !DOM.moreOptionsDropdown.classList.contains('hidden')) { if (!DOM.moreOptionsButton?.contains(event.target) && !DOM.moreOptionsDropdown.contains(event.target)) toggleMoreOptions(); } }
    function handleTitleEdit(event) { /* ... (Változatlan) ... */ }
    function handleSearchInput(event) { const query = event.target.value; if (editorState.searchQuery !== query) { editorState.searchQuery = query; renderSidebar(); } }

    // --- Initialization ---
    function cacheDOMElements() {
        const ids = [ 'save-button', 'share-button', 'present-button', 'download-button', 'more-options-button', 'presentation-title', 'presentation-last-edited', 'share-modal', 'share-url-input', 'copy-share-url-button', 'more-options-dropdown', 'rename-option', 'duplicate-option', 'history-option', 'download-option-alt', 'editor-toolbar', 'slide-list', 'add-slide-button', 'canvas-scaler', 'slide-canvas', 'canvas-placeholder', 'slide-list-loading', 'bottom-bar', 'prev-slide-button', 'next-slide-button', 'slide-indicator', 'zoom-out-button', 'zoom-in-button', 'zoom-level', 'fullscreen-button', 'fullscreen-enter-icon', 'fullscreen-exit-icon', 'error-display', 'search-slides', 'font-family-select', 'font-size-select', 'slide-list-empty' ];
        ids.forEach(id => { const key = id.replace(/-([a-z])/g, g => g[1].toUpperCase()); DOM[key] = document.getElementById(id); const optional = ['canvas-placeholder', 'download-option-alt', 'slide-list-loading', 'rename-option', 'duplicate-option', 'history-option']; if (!DOM[key] && !optional.includes(id)) console.warn(`DOM elem ID='${id}' (key='${key}') nem található.`); });
        DOM.mainArea = document.querySelector('main[role="main"]'); DOM.saveButtonText = DOM.saveButton?.querySelector('#save-button-text');
        const essential = ['slideList', 'slideCanvas', 'editorToolbar', 'canvasScaler', 'mainArea', 'bottomBar', 'presentationTitle', 'saveButton', 'searchSlidesInput', 'slideListEmpty']; const missing = essential.filter(key => !DOM[key]); if (missing.length > 0) { const msg = `Kritikus DOM elemek hiányoznak: ${missing.join(', ')}.`; console.error(msg); showError(msg, 0); throw new Error(msg); }
    }
    function bindEventListeners() {
        DOM.saveButton?.addEventListener('click', savePresentation); DOM.shareButton?.addEventListener('click', showShareModal); DOM.presentButton?.addEventListener('click', startPresentation); DOM.downloadButton?.addEventListener('click', downloadPresentation); DOM.moreOptionsButton?.addEventListener('click', toggleMoreOptions);
        DOM.presentationTitle?.addEventListener('click', handleTitleEdit); DOM.presentationTitle?.addEventListener('focus', handleTitleEdit); DOM.presentationTitle?.addEventListener('blur', handleTitleEdit); DOM.presentationTitle?.addEventListener('keydown', handleTitleEdit);
        DOM.copyShareUrlButton?.addEventListener('click', copyShareUrl);
        DOM.renameOption?.addEventListener('click', (e) => { e.preventDefault(); toggleMoreOptions(); DOM.presentationTitle?.click(); });
        DOM.duplicateOption?.addEventListener('click', (e) => { e.preventDefault(); toggleMoreOptions(); showError("Másolat készítése nincs implementálva.", 3000); });
        DOM.downloadOptionAlt?.addEventListener('click', (e) => { e.preventDefault(); toggleMoreOptions(); downloadPresentation(); });
        DOM.slideList?.addEventListener('click', handleSidebarInteraction); DOM.slideList?.addEventListener('keydown', handleSidebarKeyDown); DOM.addSlideButton?.addEventListener('click', addSlide);
        DOM.editorToolbar?.addEventListener('click', handleToolbarAction); DOM.editorToolbar?.addEventListener('change', handleToolbarAction); // Selectekhez
        if (DOM.slideCanvas) { DOM.slideCanvas.addEventListener('input', handleCanvasInput, { capture: true }); document.addEventListener('selectionchange', debounce(updateToolbarState, 100)); DOM.slideCanvas.addEventListener('focusin', updateToolbarState); DOM.slideCanvas.addEventListener('focusout', () => setTimeout(updateToolbarState, 0)); }
        DOM.prevSlideButton?.addEventListener('click', () => navigateSlides('prev')); DOM.nextSlideButton?.addEventListener('click', () => navigateSlides('next')); DOM.zoomOutButton?.addEventListener('click', () => changeZoom(-0.1)); DOM.zoomInButton?.addEventListener('click', () => changeZoom(0.1)); DOM.zoomLevelSelect?.addEventListener('change', (e) => setZoom(e.target.value)); DOM.fullscreenButton?.addEventListener('click', toggleFullscreen);
        DOM.searchSlidesInput?.addEventListener('input', debounce(handleSearchInput, 250)); // Kereső figyelője
        document.addEventListener('click', handleGlobalClick);
        document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); savePresentation(); } if (e.key === 'F5') { e.preventDefault(); startPresentation(); } if (e.key === 'Escape' && !DOM.body.classList.contains('presentation-mode')) { if (DOM.shareModal?.hasAttribute('open')) {} else if (DOM.moreOptionsDropdown && !DOM.moreOptionsDropdown.classList.contains('hidden')) { toggleMoreOptions(); DOM.moreOptionsButton?.focus(); } else if (editorState.isTitleEditing) {} } });
        window.addEventListener('resize', debounce(() => { if (editorState.currentZoom === 'fit') applyZoom(); }, 150));
        document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange); document.addEventListener('msfullscreenchange', handleFullscreenChange);
        window.addEventListener('beforeunload', (event) => { captureFocusedElementState(); if (editorState.isDirty) { const msg = 'Nem mentett változások vannak. Biztosan elhagyod?'; event.preventDefault(); event.returnValue = msg; return msg; } });
    }

    // --- Initial Run ---
    document.addEventListener('DOMContentLoaded', () => {
        try { console.log("DOM betöltődött. Inicializálás..."); cacheDOMElements(); loadPresentation(); bindEventListeners(); const doc = document; updateFullscreenButtonIcon(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement)); console.log('Prezentáció Szerkesztő inicializálva (v3 - fejlesztett).'); DOM.slideListLoading?.classList.add('hidden'); }
        catch (error) { console.error("!!! KRITIKUS INICIALIZÁLÁSI HIBA !!!", error); const errDiv = document.getElementById('error-display') || document.createElement('div'); if (!errDiv.id) { errDiv.id = 'error-display'; /* basic styles */ errDiv.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:red;color:white;padding:10px;z-index:1000;border-radius:5px;text-align:center;'; document.body.prepend(errDiv); } errDiv.textContent = `Kritikus hiba: ${error.message}. Az oldal nem működik megfelelően.`; errDiv.classList.remove('hidden'); errDiv.setAttribute('aria-hidden', 'false'); }
    });

})(); // End of IIFE
/* --- END OF FILE script.js --- */
