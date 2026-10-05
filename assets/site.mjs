import { catalog, licenses, storageKey, normalizeSelection, selectionLines } from './catalog.mjs?v=20261004-lab';
import { selectionMetrics, createInquiryTracker } from './inquiry-analytics.mjs?v=20261004-lab';
import * as siteConfig from './site-config.mjs';

// Older cached configuration files may predate optional spam-protection settings.
// Keep list controls working while those files refresh independently.
const { inquiryEndpoint = '', turnstileSiteKey = '' } = siteConfig;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const cross = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
let selection = [];
let storageWorks = true;
let toastTimer;
let dialogItem;
let busy = false;

try { selection = normalizeSelection(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { selection = []; }

function track(name, params = {}) {
  try {
    if (window.nioquantAnalytics) window.nioquantAnalytics.track(name, params);
    else {
      const queue = window.nioquantAnalyticsQueue ||= [];
      if (queue.length < 100) queue.push([name, params]);
    }
  } catch { /* Tracking must never affect the list or form. */ }
}
function itemParams(value, source) {
  const item = catalog.find(item => item.id === value.id);
  const service = item?.kind === 'service';
  const laboratory = item?.collection === 'laboratory_stands';
  const labSection = { laboratory_hero:'lab-intro', laboratory_feature:'selected-work', laboratory_cta:'custom-fit' }[source] || 'lab-designs';
  return {
    items:[value], catalog_item_id:value.id, catalog_item_kind:service ? 'service' : 'model',
    license_type:value.license, link_location:source,
    section_id:source === 'contact_list' ? 'inquiry_list' : laboratory ? labSection : service ? 'packages' : 'collection',
    item_list_id:laboratory ? 'laboratory_stands' : service ? 'modeling_packages' : 'design_concepts', item_count:selection.length
  };
}

function announce(message) {
  const toast = $('#selectionToast');
  if (!toast) return;
  $('#toastMessage').textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function saveSelection() {
  try { localStorage.setItem(storageKey, JSON.stringify(selection)); }
  catch {
    storageWorks = false;
    // Keep the list across page navigation if persistent storage is unavailable.
    try { sessionStorage.setItem(storageKey, JSON.stringify(selection)); } catch { /* Memory only. */ }
    announce('Browser storage is unavailable. Your list may not survive leaving this page.');
  }
  renderSelection();
}

// Restore the session fallback only when local storage really is blocked.
try { localStorage.setItem('nioquant.storage-check', '1'); localStorage.removeItem('nioquant.storage-check'); }
catch {
  storageWorks = false;
  try { selection = normalizeSelection(JSON.parse(sessionStorage.getItem(storageKey) || '[]')); } catch { /* Memory only. */ }
}

function licenseFor(id) {
  return document.querySelector(`[data-license-for="${id}"]`)?.value || 'personal';
}

function setSelection(id, license = 'personal', source = 'item_card') {
  if (busy) return;
  const item = catalog.find(item => item.id === id);
  if (!item) return;
  const existing = selection.find(value => value.id === id);
  if (existing && (item.kind === 'service' || existing.license === license)) {
    selection = selection.filter(value => value.id !== id);
    announce(`${item.name} removed from your list.`);
  } else {
    selection = normalizeSelection([...selection.filter(value => value.id !== id), { id, license }]);
    announce(`${item.name} ${existing ? 'updated' : 'added to your list'}.`);
  }
  saveSelection();
  const chosen = selection.find(value => value.id === id);
  if (!chosen) track('remove_from_cart', itemParams(existing, source));
  else if (existing) track('inquiry_license_change', itemParams(chosen, source));
  else track('add_to_cart', itemParams(chosen, source));
}

function setButtonState(button, item, chosen) {
  button.setAttribute('aria-pressed', String(chosen));
  button.setAttribute('aria-label', `${chosen ? 'Remove' : 'Add'} ${item.name} ${chosen ? 'from' : 'to'} your inquiry list`);
  if (button.classList.contains('add-button')) {
    // Keep one SVG so CSS can animate the same plus into a removal cross.
    if (!button.querySelector('svg')) button.innerHTML = plus;
  }
  else button.textContent = chosen ? 'Remove from my list' : 'Add to my inquiry';
  if (button === tooltipTarget) showInquiryTooltip(button);
}

function renderSelection() {
  $$('[data-list-count]').forEach(element => {
    element.textContent = selection.length;
    element.closest('.list-link')?.setAttribute('aria-label', `Review your inquiry list, ${selection.length} selected ${selection.length === 1 ? 'item' : 'items'}`);
  });
  $$('[data-add]').forEach(button => {
    const item = catalog.find(item => item.id === button.dataset.add);
    if (!item) return;
    const chosen = selection.some(value => value.id === item.id && (item.kind === 'service' || value.license === licenseFor(item.id)));
    setButtonState(button, item, chosen);
  });
  $$('[data-selection-for]').forEach(element => {
    element.hidden = !selection.some(value => value.id === element.dataset.selectionFor);
  });
  if (dialogItem) {
    const chosen = selection.some(value => value.id === dialogItem.id && value.license === $('#dialogLicense').value);
    setButtonState($('#dialogAdd'), dialogItem, chosen);
  }
  const list = $('#selectionItems');
  if (list) {
    list.replaceChildren();
    for (const selected of selection) {
      const item = catalog.find(item => item.id === selected.id);
      const row = document.createElement('li');
      row.className = 'selection-item';
      if (item.image) {
        const image = document.createElement('img');
        image.src = item.image; image.alt = ''; row.append(image);
      }
      const body = document.createElement('div'); body.className = 'selection-item-body';
      const name = document.createElement('strong'); name.textContent = item.name;
      const description = document.createElement('p');
      description.textContent = item.kind === 'service' ? item.scope : `${licenses[selected.license].name} · interest in future files`;
      body.append(name, description);
      if (item.kind === 'model') {
        const status = document.createElement('small'); status.textContent = 'Concept preview · not yet available'; body.append(status);
      }
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'remove-button'; remove.innerHTML = cross;
      remove.setAttribute('aria-label', `Remove ${item.name}`); remove.disabled = busy;
      remove.addEventListener('click', () => {
        const index = selection.findIndex(value => value.id === selected.id);
        selection = selection.filter(value => value.id !== selected.id);
        saveSelection();
        track('remove_from_cart', itemParams(selected, 'contact_list'));
        // Keep keyboard focus in the list after its DOM is rebuilt.
        const next = list.querySelectorAll('button');
        (next[Math.min(index, next.length - 1)] || $('#browseServices')).focus();
      });
      row.append(body, remove); list.append(row);
    }
    $('#emptySelection').hidden = selection.length > 0;
    $('#selectionTail').hidden = selection.length === 0;
    const clearButton = $('#clearSelection');
    if (clearButton) {
      clearButton.hidden = selection.length === 0;
      clearButton.disabled = busy;
    }
    $('#storageWarning').hidden = storageWorks;
    updateEmailPreview();
  }
}

function updateEmailPreview() {
  const preview = $('#emailPreview');
  if (!preview) return;
  const name = $('#inquiryName').value.trim() || '[Your name]';
  const email = $('#inquiryEmail').value.trim() || '[Your email]';
  const message = $('#inquiryMessage').value.trim() || '[Your message]';
  preview.textContent = `From: ${name} <${email}>\n\n${message}\n\n--- Selected items · appended automatically ---\n${selectionLines(selection) || 'General inquiry: no items selected.'}\n\nThis is a request for information or a quote, not a purchase.`;
}

$$('[data-license-for]').forEach(select => {
  const stored = selection.find(value => value.id === select.dataset.licenseFor);
  if (stored) select.value = stored.license;
  select.addEventListener('change', () => {
    const existing = selection.find(value => value.id === select.dataset.licenseFor);
    if (existing) {
      existing.license = select.value;
      saveSelection();
      announce('Licence preference updated.');
    } else renderSelection();
    track('inquiry_license_change', itemParams({ id:select.dataset.licenseFor, license:select.value }, 'concept_card'));
  });
});
$$('[data-add]').forEach(button => button.addEventListener('click', () => setSelection(button.dataset.add, licenseFor(button.dataset.add), button.dataset.inquirySource || (button.closest('.package-grid') ? 'package_card' : 'concept_card'))));
// A contact CTA keeps an existing choice selected instead of toggling it off.
$$('[data-inquire]').forEach(link => link.addEventListener('click', () => {
  const id = link.dataset.inquire;
  if (!selection.some(value => value.id === id)) setSelection(id, 'personal', link.dataset.inquirySource || 'laboratory_cta');
}));
$('#clearSelection')?.addEventListener('click', () => {
  if (busy || selection.length === 0) return;
  const removed = selection;
  selection = [];
  saveSelection();
  track('remove_from_cart', { items:removed, item_count:0, link_location:'contact_list', method:'clear_all' });
  track('inquiry_list_clear', { ...selectionMetrics(removed), link_location:'contact_list' });
  announce('Your inquiry list has been cleared.');
  $('#browseServices').focus();
});

// One shared tooltip follows each inquiry-list icon, on hover or keyboard focus.
const inquiryTooltip = document.createElement('div');
inquiryTooltip.id = 'inquiryActionTooltip';
inquiryTooltip.className = 'inquiry-tooltip';
inquiryTooltip.setAttribute('role', 'tooltip');
inquiryTooltip.hidden = true;
document.body.append(inquiryTooltip);
let tooltipTarget = null;
let tooltipHideTimer;

function hideInquiryTooltip() {
  clearTimeout(tooltipHideTimer);
  tooltipTarget?.removeAttribute('aria-describedby');
  tooltipTarget = null;
  inquiryTooltip.hidden = true;
}

function showInquiryTooltip(button) {
  clearTimeout(tooltipHideTimer);
  if (tooltipTarget !== button) hideInquiryTooltip();
  tooltipTarget = button;
  inquiryTooltip.textContent = button.getAttribute('aria-label');
  inquiryTooltip.hidden = false;
  button.setAttribute('aria-describedby', inquiryTooltip.id);
  const anchor = button.getBoundingClientRect();
  if (anchor.bottom < 0 || anchor.top > innerHeight) { inquiryTooltip.hidden = true; return; }
  const box = inquiryTooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(anchor.right - box.width, innerWidth - box.width - 12));
  const top = anchor.top >= box.height + 22 ? anchor.top - box.height - 10 : anchor.bottom + 10;
  inquiryTooltip.style.left = `${left}px`;
  inquiryTooltip.style.top = `${top}px`;
}

function queueTooltipHide() {
  if (tooltipTarget?.matches(':focus-visible')) return;
  clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(hideInquiryTooltip, 120);
}

$$('.add-button').forEach(button => {
  button.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'touch') showInquiryTooltip(button);
  });
  button.addEventListener('pointerleave', queueTooltipHide);
  button.addEventListener('focus', () => {
    if (button.matches(':focus-visible')) showInquiryTooltip(button);
  });
  button.addEventListener('blur', hideInquiryTooltip);
});
inquiryTooltip.addEventListener('pointerenter', () => clearTimeout(tooltipHideTimer));
inquiryTooltip.addEventListener('pointerleave', queueTooltipHide);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideInquiryTooltip(); });
function repositionInquiryTooltip() {
  if (tooltipTarget) showInquiryTooltip(tooltipTarget);
}
window.addEventListener('scroll', repositionInquiryTooltip, { passive:true });
window.addEventListener('resize', repositionInquiryTooltip);

window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  try { selection = normalizeSelection(JSON.parse(event.newValue || '[]')); } catch { selection = []; }
  $$('[data-license-for]').forEach(select => {
    const stored = selection.find(value => value.id === select.dataset.licenseFor);
    if (stored) select.value = stored.license;
  });
  renderSelection();
});

// Back/forward cache restores can otherwise show a list from before a contact-page edit.
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  try {
    const saved = storageWorks ? localStorage.getItem(storageKey) : sessionStorage.getItem(storageKey);
    selection = normalizeSelection(JSON.parse(saved || '[]'));
  } catch { /* Keep the in-memory list if storage is unavailable. */ }
  $$('[data-license-for]').forEach(select => {
    const selected = selection.find(value => value.id === select.dataset.licenseFor);
    if (selected) select.value = selected.license;
  });
  renderSelection();
});

// Lightweight theme and mobile navigation, with readable content even without JS.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const savedTheme = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#141613' : '#faf8f3';
  $('#themeToggle')?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}
setTheme(savedTheme || (darkQuery.matches ? 'dark' : 'light'));
$('#themeToggle')?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('theme', theme); } catch { /* Theme still works for this page. */ }
});
darkQuery.addEventListener('change', () => {
  let stored; try { stored = localStorage.getItem('theme'); } catch { /* Use system. */ }
  if (!stored) setTheme(darkQuery.matches ? 'dark' : 'light');
});
function closeMenu() { $('#navLinks').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false'); }
$('#navToggle')?.addEventListener('click', () => {
  const open = $('#navLinks').classList.toggle('open');
  $('#navToggle').setAttribute('aria-expanded', String(open));
});
$$('#navLinks a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

// Concept details stay in a dialog; they are previews, not fictional sale pages.
$$('[data-view-model]').forEach(button => button.addEventListener('click', () => {
  dialogItem = catalog.find(item => item.id === button.dataset.viewModel);
  $('#dialogImage').src = dialogItem.image;
  $('#dialogImage').alt = `${dialogItem.subtitle} concept render`;
  $('#dialogTitle').textContent = dialogItem.name;
  $('#dialogSubtitle').textContent = dialogItem.subtitle;
  $('#dialogDescription').textContent = dialogItem.description;
  $('#dialogLicense').value = licenseFor(dialogItem.id);
  renderSelection();
  $('#modelDialog').showModal();
  track('view_item', itemParams({ id:dialogItem.id, license:$('#dialogLicense').value }, 'concept_card'));
}));
$('#dialogClose')?.addEventListener('click', () => $('#modelDialog').close());
$('#modelDialog')?.addEventListener('click', event => { if (event.target === $('#modelDialog')) $('#modelDialog').close(); });
$('#modelDialog')?.addEventListener('close', () => {
  if (dialogItem) track('model_preview_close', { catalog_item_id:dialogItem.id, link_location:'model_dialog' });
  dialogItem = null;
});
$('#dialogLicense')?.addEventListener('change', () => {
  const select = document.querySelector(`[data-license-for="${dialogItem.id}"]`);
  select.value = $('#dialogLicense').value;
  const existing = selection.find(value => value.id === dialogItem.id);
  if (existing) { existing.license = select.value; saveSelection(); } else renderSelection();
  track('inquiry_license_change', itemParams({ id:dialogItem.id, license:select.value }, 'model_dialog'));
});
$('#dialogAdd')?.addEventListener('click', () => { setSelection(dialogItem.id, $('#dialogLicense').value, 'model_dialog'); });

const form = $('#inquiryForm');
if (form) {
  const analytics = createInquiryTracker(track);
  let attemptRecorded = false;
  $('#submitInquiry').addEventListener('click', () => {
    if (busy || completed || !sendingReady) return;
    analytics.attempt(selection);
    attemptRecorded = true;
  });
  form.addEventListener('invalid', event => analytics.invalid(event.target.id), true);
  function trackFormProgress(event) {
    if (!['inquiryName', 'inquiryEmail', 'inquiryMessage', 'inquiryConsent'].includes(event.target.id)) return;
    analytics.start(selection);
    const fields = ['inquiryName', 'inquiryEmail', 'inquiryMessage'].map(id => $(`#${id}`));
    if (fields.every(field => field.validity.valid && field.value.trim()) && $('#inquiryConsent').checked) analytics.completeFields(selection);
  }
  form.addEventListener('input', trackFormProgress);
  form.addEventListener('change', trackFormProgress);
  window.addEventListener('pagehide', () => analytics.abandon(selection));
  let requestId = null;
  let lastPayload = '';
  let completed = false;
  let turnstileWidgetId = null;
  const endpointReady = (() => {
    if (!inquiryEndpoint) return false;
    try {
      const url = new URL(inquiryEndpoint);
      const localHosts = ['localhost', '127.0.0.1', '[::1]'];
      return url.protocol === 'https:' || (url.protocol === 'http:' && localHosts.includes(location.hostname) && localHosts.includes(url.hostname));
    } catch { return false; }
  })();
  const sendingReady = endpointReady && Boolean(turnstileSiteKey);
  $('#submitInquiry').disabled = !sendingReady;
  $('#setupNote').hidden = sendingReady;
  if (turnstileSiteKey) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      turnstileWidgetId = window.turnstile.render('#turnstile', {
        sitekey: turnstileSiteKey,
        action: 'contact',
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      });
    };
    script.onerror = () => { $('#submitInquiry').disabled = true; $('#setupNote').hidden = false; analytics.failed('verification_load'); };
    document.head.append(script);
  }
  $$('[data-preview-field]').forEach(field => field.addEventListener('input', () => {
    field.setCustomValidity('');
    updateEmailPreview();
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || completed || !sendingReady) return;
    if (!attemptRecorded) analytics.attempt(selection);
    attemptRecorded = false;
    for (const id of ['inquiryName', 'inquiryMessage']) {
      const input = $(`#${id}`);
      input.setCustomValidity(input.value.trim() ? '' : 'Please enter a value.');
    }
    if (!form.reportValidity()) return;
    const turnstileToken = turnstileWidgetId === null ? '' : window.turnstile?.getResponse(turnstileWidgetId);
    if (!turnstileToken) {
      analytics.blocked('verification_required');
      $('#formStatus').dataset.kind = 'error';
      $('#formStatus').textContent = 'Please complete the verification before sending.';
      return;
    }
    const selectedAtSend = selection.map(value => ({ ...value }));
    const payload = {
      name: $('#inquiryName').value.trim(), email: $('#inquiryEmail').value.trim(),
      message: $('#inquiryMessage').value.trim(), selection: selectedAtSend,
      consent: $('#inquiryConsent').checked, website: $('#inquiryWebsite').value, turnstileToken
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload) { requestId = crypto.randomUUID(); lastPayload = serialized; }
    busy = true;
    const status = $('#formStatus');
    status.textContent = 'Sending your inquiry…'; status.dataset.kind = '';
    $('#submitInquiry').disabled = true;
    $('#submitInquiry').textContent = 'Sending…';
    form.querySelector('fieldset').disabled = true;
    renderSelection();
    analytics.sending(selectedAtSend);
    let failureType = 'network';
    let httpStatus = 0;
    try {
      const response = await fetch(inquiryEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId }), signal: AbortSignal.timeout(20000)
      });
      httpStatus = response.status;
      failureType = response.ok ? 'invalid_response' : response.status === 429 ? 'rate_limit' : response.status === 400 ? 'validation' : response.status === 403 ? 'verification' : 'server';
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Your inquiry could not be sent. Please try again.');
      completed = true;
      analytics.confirmed(selectedAtSend, response, result);
      // Remove only the exact submitted choices; retain later changes made in another tab.
      selection = selection.filter(value => !selectedAtSend.some(sent => sent.id === value.id && sent.license === value.license));
      busy = false; saveSelection();
      form.hidden = true;
      $('#successPanel').hidden = false;
      $('#successTitle').focus();
    } catch (error) {
      analytics.failed(error.name === 'TimeoutError' ? 'timeout' : failureType, httpStatus);
      status.dataset.kind = 'error';
      status.textContent = error.name === 'TimeoutError'
        ? 'Sending took too long. Your list and message are still here. Retry to check this same inquiry.'
        : `${error.message || 'We could not confirm sending.'} Your list and message are still here. Please retry, or contact info@nioquant.com.`;
      if (turnstileWidgetId !== null) window.turnstile?.reset(turnstileWidgetId);
      busy = false;
      form.querySelector('fieldset').disabled = false;
      $('#submitInquiry').disabled = false;
      $('#submitInquiry').textContent = 'Send inquiry';
      renderSelection();
    }
  });
}

renderSelection();

// Existing Garmin stats, kept on the software overview.
if (!document.body.classList.contains('app-detail') && $('#stats_racketscore')) {
  const apps = { racketscore:'3e320d95-a886-4f6a-96dc-dc9dd225bae3', coachpulse:'e8e7a400-f711-495c-b9a5-eaed8cc5f349', tictactoe:'1166f5c7-6b4e-46c9-b00c-e67081076a7e', connect4:'726d6a2b-6781-4b48-96a1-54011a8f4de1', dotsandboxes:'70d5c00b-9ce7-4a2f-a9f0-27a39d0196c1', raindrop:'9437bbd2-e218-4e8a-bc53-a1d3a5bad911', '3dtime':'e79296f1-a375-4742-8358-8cbb8be84996', gradient:'831da381-871f-48cd-892d-9e467eb434cb', bubbledive:'da38ce90-cf33-4e31-b7e0-57026405850d', simple3dtime:'be324f2c-7dbc-46e3-9e75-dab936a54b4b' };
  fetch('https://garmin-stats.cudina-fran.workers.dev/developer').then(response => response.ok ? response.json() : {}).then(stats => {
    for (const [key, id] of Object.entries(apps)) {
      const element = $(`#stats_${key}`), data = stats[id];
      if (!element || !data) continue;
      const count = Number(data.downloadCount), rating = Number(data.averageRating);
      if (!Number.isFinite(count) || !Number.isFinite(rating)) continue;
      element.textContent = `${count.toLocaleString()}+ downloads · ${rating.toFixed(1)} / 5`;
      element.classList.add('app-stat');
    }
  }).catch(() => { /* Stats are optional; every app link stays available. */ });
}
