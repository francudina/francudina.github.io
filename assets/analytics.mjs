import { catalog, normalizeSelection, storageKey } from './catalog.mjs?v=20261004-lab';

export const measurementId = 'G-4W5N770LK6';
export const apps = {
  racketscore: ['RacketScore', '3e320d95-a886-4f6a-96dc-dc9dd225bae3'],
  coachpulse: ['CoachPulse', 'e8e7a400-f711-495c-b9a5-eaed8cc5f349'],
  raindrop: ['Raindrop', '9437bbd2-e218-4e8a-bc53-a1d3a5bad911'],
  '3dtime': ['3D Time', 'e79296f1-a375-4742-8358-8cbb8be84996'],
  simple3dtime: ['Simple 3D Time', 'be324f2c-7dbc-46e3-9e75-dab936a54b4b'],
  gradient: ['Gradient', '831da381-871f-48cd-892d-9e467eb434cb'],
  bubbledive: ['Bubble Dive', 'da38ce90-cf33-4e31-b7e0-57026405850d'],
  tictactoe: ['TicTacToe', '1166f5c7-6b4e-46c9-b00c-e67081076a7e'],
  connect4: ['Connect 4', '726d6a2b-6781-4b48-96a1-54011a8f4de1'],
  dotsandboxes: ['Dots & Boxes', '70d5c00b-9ce7-4a2f-a9f0-27a39d0196c1'],
  scanplan: ['ScanPlan', null]
};
const events = new Set([
  'page_view', 'view_section', 'view_item_list', 'select_item', 'view_item', 'add_to_cart',
  'remove_from_cart', 'view_cart', 'inquiry_list_clear', 'inquiry_list_open', 'inquiry_license_change',
  'model_preview_close', 'contact_click', 'contact_email_click', 'navigation_click', 'outbound_click',
  'social_click', 'app_download', 'tool_open', 'source_code_open', 'legal_open', 'image_open',
  'section_navigation', 'section_anchor_copy', 'content_toggle', 'copy_code', 'theme_change',
  'menu_toggle', 'preview_playback', 'button_click', 'inquiry_form_start', 'inquiry_form_complete',
  'inquiry_form_abandon', 'inquiry_submit_attempt', 'inquiry_validation_error', 'inquiry_submit_blocked',
  'inquiry_send_started', 'inquiry_send_error', 'generate_lead', 'inquiry_item_lead'
]);
const stringKeys = new Set([
  'page_type', 'page_path', 'app_id', 'catalog_item_id', 'catalog_item_kind', 'item_category', 'license_type', 'link_location',
  'section_id', 'destination', 'legacy_event', 'control_id', 'content_id', 'content_type', 'state',
  'method', 'form_id', 'field_id', 'reason', 'error_type', 'item_list_id', 'item_list_name', 'form_stage'
]);
const numberKeys = new Set(['item_count', 'service_count', 'concept_count', 'http_status']);
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_./ -]{1,100}$/.test(value) ? value : undefined;
const canonicalPath = path => path.replace(/\/index\.html$/, '/');
export function pageType(path) {
  path = canonicalPath(path);
  if (path === '/') return 'home';
  if (path.endsWith('privacy-policy.html')) return 'privacy';
  if (path === '/legal/' || path.endsWith('licence.html')) return 'legal';
  if (path === '/design/') return '3d_design';
  if (path === '/stands/') return 'laboratory_stands';
  if (path === '/contact/') return 'contact';
  if (path === '/software/') return 'software';
  return apps[path.split('/')[1]] ? 'app_detail' : 'other';
}
export function safeUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.origin + (token(url.pathname) || '/');
  } catch { return undefined; }
}
export function analyticsItems(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 30).flatMap(value => {
    const id = value?.id || value?.item_id;
    const model = catalog.find(item => item.id === id);
    const app = Object.hasOwn(apps, id || '') ? apps[id] : null;
    if (!model && !app) return [];
    const item = { item_id:id, item_name:model?.name || app[0], item_category:model?.kind || 'software', quantity:1 };
    if (model?.kind === 'model') {
      const license = value.license || value.item_variant;
      if (['personal', 'commercial'].includes(license)) item.item_variant = license;
    }
    return [item];
  });
}
// Parameters are deliberately allowlisted. Form values, error messages, email URLs,
// tokens, provider IDs and request IDs can never reach the Google event payload.
export function sanitizeEvent(name, params = {}, context = {}) {
  if (!events.has(name)) return null;
  const clean = {};
  for (const [key, value] of Object.entries({ ...params, ...context })) {
    if (stringKeys.has(key) && token(value)) clean[key] = value;
    if (numberKeys.has(key) && Number.isFinite(value) && value >= 0) clean[key] = value;
    if (key === 'items') clean.items = analyticsItems(value);
    if (['page_location', 'page_referrer'].includes(key)) {
      const url = safeUrl(value);
      if (url) clean[key] = url;
    }
  }
  return clean;
}
export function classifyLink({ href, placement = 'content', legacy = '', section = '', anchor = false }, base) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  const params = { link_location:placement, section_id:section, ...(legacy ? { legacy_event:legacy } : {}) };
  if (url.protocol === 'mailto:') return { name:'contact_email_click', params:{ ...params, method:'email' } };
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const path = canonicalPath(url.pathname);
  params.destination = (url.origin === new URL(base).origin ? '' : url.hostname) + path;
  if (anchor) return { name:'section_anchor_copy', params:{ ...params, content_id:url.hash.slice(1) } };
  const app = Object.entries(apps).find(([, value]) => value[1] && url.hostname === 'apps.garmin.com' && url.pathname === '/apps/' + value[1]);
  if (app) return { name:'app_download', params:{ ...params, app_id:app[0], items:analyticsItems([{ id:app[0] }]) } };
  if (url.hostname === 'scanplan.nioquant.com') return { name:'tool_open', params:{ ...params, app_id:'scanplan' } };
  if (url.hostname === 'github.com' && url.pathname === '/francudina/RamanMicroscopeTool') return { name:'source_code_open', params:{ ...params, app_id:'scanplan' } };
  if (url.origin !== new URL(base).origin) return { name:['instagram.com', 'github.com', 'www.linkedin.com'].includes(url.hostname) ? 'social_click' : 'outbound_click', params };
  if (url.pathname.includes('privacy-policy') || url.pathname.includes('licence') || path === '/legal/') return { name:'legal_open', params };
  if (/\.(png|jpg|jpeg|svg|webp)$/i.test(url.pathname)) return { name:'image_open', params };
  if (pageType(path) === 'contact') return { name:placement === 'inquiry_list' || placement === 'toast' ? 'inquiry_list_open' : 'contact_click', params };
  if (url.hash) {
    if (url.hash === '#changelog') return { name:'content_toggle', params:{ ...params, content_id:'changelog', content_type:'changelog', state:'open' } };
    return { name:'section_navigation', params:{ ...params, content_id:url.hash.slice(1) } };
  }
  const id = path.split('/')[1];
  if (Object.hasOwn(apps, id) && ['app_card', 'content'].includes(placement)) return { name:'select_item', params:{ ...params, app_id:id, item_list_id:section || 'software', items:analyticsItems([{ id }]) } };
  return { name:'navigation_click', params };
}
function placement(element) {
  if (element.closest('.list-link')) return 'inquiry_list';
  if (element.closest('.toast')) return 'toast';
  if (element.closest('.nav')) return 'header';
  if (element.closest('.footer')) return 'footer';
  if (element.closest('.lab-dialog')) return 'laboratory_gallery';
  if (element.closest('.home-lab')) return 'laboratory_home';
  if (element.closest('.lab-card')) return 'laboratory_card';
  if (element.closest('.lab-feature')) return 'laboratory_feature';
  if (element.closest('.lab-custom-fit')) return 'laboratory_cta';
  if (element.closest('dialog')) return 'model_dialog';
  if (element.closest('.app-gallery-card')) return 'app_card';
  if (element.closest('.page-actions')) return 'app_hero';
  if (element.closest('.contact-band')) return 'contact_band';
  if (element.closest('.hero,.software-hero,.page-intro,.lab-intro')) return 'hero';
  if (element.closest('#inquiryForm')) return 'contact_form';
  if (element.closest('.policy-nav')) return 'legal_navigation';
  return 'content';
}
function contentId(element) {
  const text = element.id || element.querySelector('h2,.section-label,summary')?.textContent || 'content';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}
export function bootAnalytics(win, doc) {
  if (win.nioquantAnalytics) return win.nioquantAnalytics;
  const path = win.location.pathname;
  const production = ['nioquant.com', 'www.nioquant.com'].includes(win.location.hostname);
  win.dataLayer = win.dataLayer || [];
  win.gtag = function () { win.dataLayer.push(arguments); };
  const referrer = safeUrl(doc.referrer);
  const context = { page_path:path, page_type:pageType(path), page_location:safeUrl(win.location.href), page_referrer:referrer };
  if (pageType(path) === 'app_detail') context.app_id = path.split('/')[1];
  // Preserve explicit campaign attribution without forwarding arbitrary query fields.
  const campaign = {};
  const campaignKeys = { utm_source:'campaign_source', utm_medium:'campaign_medium', utm_campaign:'campaign_name', utm_id:'campaign_id', utm_term:'campaign_term', utm_content:'campaign_content' };
  const query = new URL(win.location.href).searchParams;
  for (const [key, parameter] of Object.entries(campaignKeys)) {
    const value = token(query.get(key));
    if (value) campaign[parameter] = value;
  }
  const debug = !production || new URL(win.location.href).searchParams.get('analytics_debug') === '1';
  const debugEvents = [];
  const debugLog = debug ? doc.createElement('script') : null;
  if (debugLog) {
    debugLog.type = 'application/json';
    debugLog.id = 'analyticsDebugEvents';
    doc.head.append(debugLog);
  }
  function track(name, params = {}) {
    try {
      const clean = sanitizeEvent(name, params, context);
      if (clean) {
        win.gtag('event', name, { ...clean, transport_type:'beacon', ...(debug ? { debug_mode:true } : {}) });
        if (debugLog) {
          debugEvents.push({ event:name, ...clean });
          if (debugEvents.length > 100) debugEvents.shift();
          debugLog.textContent = JSON.stringify(debugEvents);
        }
      }
    } catch { /* Analytics must never interfere with an interaction or an inquiry. */ }
  }
  win.nioquantAnalytics = { track, production, measurementId };
  win.gtag('js', new Date());
  win.gtag('config', measurementId, { send_page_view:false, page_location:context.page_location, page_referrer:context.page_referrer, ...campaign });
  // One page view per document, rather than every section-anchor history update.
  track('page_view');
  if (production) {
    const script = doc.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    doc.head.append(script);
  }
  for (const [name, params] of win.nioquantAnalyticsQueue || []) track(name, params);
  win.nioquantAnalyticsQueue = [];
  function ready() {
    doc.addEventListener('click', event => {
      const element = event.target.closest?.('a,button,summary');
      if (!element || element.disabled) return;
      const section = element.closest('main section[id],.journey-section[id],.closing[id]')?.id || '';
      const params = { link_location:placement(element), section_id:section, control_id:element.id || element.classList[0] || 'button' };
      if (element.matches('a')) {
        if (element.classList.contains('skip-link')) return;
        const action = classifyLink({ href:element.getAttribute('href'), placement:params.link_location, section, legacy:element.dataset.legacyEvent, anchor:element.classList.contains('section-anchor') }, win.location.href);
        if (action) track(action.name, { ...action.params, control_id:element.id || element.classList[0] || 'link' });
        return;
      }
      if (element.matches('summary')) {
        const details = element.closest('details');
        const type = details.classList.contains('mail-preview') ? 'email_preview' : details.closest('.changelog-section') ? 'changelog' : 'faq';
        track('content_toggle', { ...params, content_id:type === 'faq' ? contentId(details) : type, content_type:type, state:details.open ? 'closed' : 'open' });
        return;
      }
      // These actions are tracked only after their state actually changes in site.mjs.
      if (element.matches('[data-add],[data-view-model],[data-lab-open],[data-lab-view],[data-lab-close],.remove-button,#clearSelection,#dialogAdd,#dialogClose,#submitInquiry')) return;
      if (element.id === 'themeToggle') track('theme_change', { ...params, state:doc.documentElement.dataset.theme });
      else if (element.id === 'navToggle') track('menu_toggle', { ...params, state:element.getAttribute('aria-expanded') === 'true' ? 'open' : 'closed' });
      else if (element.classList.contains('hero-carousel-toggle')) track('preview_playback', { ...params, state:element.getAttribute('aria-label').startsWith('Play') ? 'paused' : 'playing' });
      else if (element.classList.contains('copy-btn')) track('copy_code', { ...params, content_id:section || 'selfhost' });
      else if (element.id === 'backToTop') track('section_navigation', { ...params, content_id:'page_top' });
      else track('button_click', { ...params, control_id:element.id || element.classList[0] || 'button' });
    });
    const appId = path.split('/')[1];
    if (pageType(path) === 'app_detail') track('view_item', { app_id:appId, items:analyticsItems([{ id:appId }]) });
    if (pageType(path) === 'contact') {
      let selected = [];
      try { selected = normalizeSelection(JSON.parse(win.localStorage.getItem(storageKey) || '[]')); } catch {
        try { selected = normalizeSelection(JSON.parse(win.sessionStorage.getItem(storageKey) || '[]')); } catch { /* Memory only. */ }
      }
      track('view_cart', { item_count:selected.length, items:analyticsItems(selected) });
    }
    if (!('IntersectionObserver' in win)) return;
    const seen = new WeakSet();
    const observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        const element = entry.target;
        seen.add(element); observer.unobserve(element);
        const buttons = [...element.querySelectorAll('[data-add]')];
        if (element.matches('.package-grid,.collection-grid,.lab-grid')) {
          const id = element.dataset.itemList || (element.matches('.package-grid') ? 'modeling_packages' : 'design_concepts');
          track('view_item_list', { item_list_id:id, item_list_name:id, items:analyticsItems(buttons.map(button => ({ id:button.dataset.add }))) });
        } else if (element.matches('.app-featured-grid,.app-gallery-grid,.home-software-grid')) {
          const ids = [...new Set([...element.querySelectorAll('a[href]')].map(a => new URL(a.href).pathname.split('/')[1]).filter(id => Object.hasOwn(apps, id)))];
          track('view_item_list', { item_list_id:element.closest('section')?.id || 'software', items:analyticsItems(ids.map(id => ({ id }))) });
        } else track('view_section', { section_id:contentId(element) });
      }
    }, { rootMargin:'-15% 0px -15% 0px', threshold:0 });
    doc.querySelectorAll('main section[id],main .journey-section,main .closing[id],main .changelog-section[id],.package-grid,.collection-grid,.lab-grid,.app-featured-grid,.app-gallery-grid,.home-software-grid').forEach(element => observer.observe(element));
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready, { once:true });
  else ready();
  return win.nioquantAnalytics;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') bootAnalytics(window, document);
