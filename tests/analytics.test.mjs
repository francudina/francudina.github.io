import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { apps, analyticsItems, bootAnalytics, classifyLink, pageType, safeUrl, sanitizeEvent } from '../assets/analytics.mjs';
import { createInquiryTracker } from '../assets/inquiry-analytics.mjs';

const base = 'https://nioquant.com/software/';
function fixture(href) {
  const scripts = [];
  const listeners = {};
  const location = new URL(href);
  const win = { location, localStorage:{ getItem:() => null } };
  const doc = {
    readyState:'complete', referrer:'https://example.com/article?email=private@example.com',
    head:{ append:script => scripts.push(script) }, createElement:() => ({}),
    addEventListener:(name, handler) => { listeners[name] = handler; }, querySelectorAll:() => []
  };
  return { win, doc, scripts, listeners };
}
const eventEntries = win => win.dataLayer.map(entry => [...entry]).filter(entry => entry[0] === 'event');

test('bootstrap counts once, loads Google only on production, and keeps safe campaign attribution', () => {
  const prod = fixture('https://nioquant.com/?utm_source=instagram&utm_medium=social&utm_campaign=form_collection&email=private@example.com#about');
  const first = bootAnalytics(prod.win, prod.doc);
  assert.equal(bootAnalytics(prod.win, prod.doc), first);
  assert.equal(prod.scripts.length, 1);
  assert.match(prod.scripts[0].src, /gtag\/js\?id=G-4W5N770LK6$/);
  assert.equal(eventEntries(prod.win).filter(entry => entry[1] === 'page_view').length, 1);
  const config = [...prod.win.dataLayer[1]][2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.campaign_source, 'instagram');
  assert.equal(config.campaign_name, 'form_collection');
  assert.equal(config.page_location, 'https://nioquant.com/');
  assert.doesNotMatch(JSON.stringify(prod.win.dataLayer), /private@|email=/);
  assert.equal(eventEntries(prod.win)[0][2].debug_mode, undefined);
  const local = fixture('http://127.0.0.1:8765/racketscore/');
  bootAnalytics(local.win, local.doc);
  assert.equal(local.scripts.some(script => script.src?.includes('googletagmanager')), false);
  assert.equal(eventEntries(local.win)[0][2].debug_mode, true);
  assert.equal(eventEntries(local.win).filter(entry => entry[1] === 'view_item').length, 1);
  assert.equal(JSON.parse(local.scripts[0].textContent)[0].event, 'page_view');
});

test('same Garmin action shares its event across all placements and all ten apps', () => {
  for (const [id, [, uuid]] of Object.entries(apps)) {
    if (!uuid) continue;
    for (const placement of ['app_card', 'app_hero', 'content', 'footer']) {
      const action = classifyLink({ href:'https://apps.garmin.com/apps/' + uuid, placement, legacy:'download_link_' + id }, base);
      assert.equal(action.name, 'app_download');
      assert.equal(action.params.app_id, id);
      assert.equal(action.params.link_location, placement);
      assert.equal(action.params.legacy_event, 'download_link_' + id);
      assert.equal(action.params.items[0].item_id, id);
    }
  }
});

test('link classification distinguishes sales and supporting controls without exposing mail addresses', () => {
  const cases = [
    ['/contact/', 'inquiry_list', 'inquiry_list_open'], ['/contact/', 'hero', 'contact_click'],
    ['mailto:private@example.com?body=Private', 'content', 'contact_email_click'],
    ['/racketscore/', 'app_card', 'select_item'], ['/software/', 'header', 'navigation_click'],
    ['#selfhost', 'app_hero', 'section_navigation'], ['#changelog', 'app_hero', 'content_toggle'],
    ['/racketscore/privacy-policy.html', 'footer', 'legal_open'], ['/legal/', 'footer', 'legal_open'],
    ['https://scanplan.nioquant.com', 'app_hero', 'tool_open'],
    ['https://github.com/francudina/RamanMicroscopeTool', 'app_hero', 'source_code_open'],
    ['https://instagram.com/nioquant', 'footer', 'social_click'],
    ['https://example.com/?name=Private', 'content', 'outbound_click'],
    ['/assets/racketscore/player-analytics.png', 'content', 'image_open']
  ];
  for (const [href, placement, name] of cases) {
    const action = classifyLink({ href, placement }, base);
    assert.equal(action.name, name);
    assert.doesNotMatch(JSON.stringify(action), /private@|Private|name=/);
  }
  assert.equal(classifyLink({ href:'#guide', anchor:true }, base).name, 'section_anchor_copy');
  assert.equal(classifyLink({ href:'javascript:void(0)' }, base), null);
  assert.equal(pageType('/contact/index.html'), 'contact');
});

test('delegated click tracking counts once and leaves real list controls to state-change handlers', () => {
  const { win, doc, listeners } = fixture(base);
  bootAnalytics(win, doc);
  const element = {
    id:'download_link_racketscore', dataset:{ legacyEvent:'download_link_racketscore' },
    classList:{ 0:'download-btn', contains:() => false },
    closest:selector => selector === '.page-actions' ? {} : null,
    matches:selector => selector === 'a',
    getAttribute:() => 'https://apps.garmin.com/apps/' + apps.racketscore[1]
  };
  listeners.click({ target:{ closest:() => element } });
  const downloads = eventEntries(win).filter(entry => entry[1] === 'app_download');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0][2].link_location, 'app_hero');
  assert.equal(downloads[0][2].page_path, '/software/');
  element.matches = selector => selector.includes('[data-add]');
  listeners.click({ target:{ closest:() => element } });
  assert.equal(eventEntries(win).length, 2); // Only page_view and the download.
});

test('analytics emits canonical public items and strips private payloads and URL queries', () => {
  const clean = sanitizeEvent('generate_lead', {
    name:'Private Person', email:'private@example.com', message:'Private message',
    turnstileToken:'secret', requestId:'secret', error:'Private provider response',
    destination:'mailto:private@example.com', http_status:NaN,
    items:[{ id:'form-vase', license:'commercial', item_name:'Private Person', price:99 }, { id:'model-sprint' }, { id:'unknown' }],
    page_location:'https://nioquant.com/contact/?email=private@example.com#private',
    page_referrer:'https://example.com/?message=private'
  });
  assert.deepEqual(clean.items, [
    { item_id:'form-vase', item_name:'Form / 01', item_category:'model', quantity:1, item_variant:'commercial' },
    { item_id:'model-sprint', item_name:'Model sprint', item_category:'service', quantity:1 }
  ]);
  assert.equal(clean.page_location, 'https://nioquant.com/contact/');
  assert.equal(clean.page_referrer, 'https://example.com/');
  assert.doesNotMatch(JSON.stringify(clean), /private|Private|secret|price|99/);
  assert.equal(sanitizeEvent('purchase', {}), null);
  assert.equal(safeUrl('mailto:private@example.com'), undefined);
  assert.deepEqual(analyticsItems([{ id:'__proto__' }]), []);
});

test('inquiry lead requires confirmed delivery, counts once across retries, and retains submitted public choices', () => {
  const events = [];
  const tracker = createInquiryTracker((name, params) => events.push({ name, ...sanitizeEvent(name, params) }));
  const selected = [{ id:'model-sprint' }, { id:'form-vase', license:'commercial' }];
  tracker.start(selected); tracker.start(selected);
  tracker.completeFields(selected); tracker.completeFields(selected);
  tracker.attempt(selected); tracker.invalid('inquiryEmail'); tracker.invalid('inquiryEmail'); tracker.invalid('inquiryWebsite');
  tracker.blocked('verification_required');
  tracker.sending(selected); tracker.failed('network');
  tracker.confirmed(selected, { ok:false }, { ok:true });
  tracker.confirmed(selected, { ok:true }, { ok:false });
  assert.equal(events.filter(event => event.name === 'generate_lead').length, 0);
  tracker.attempt(selected); tracker.sending(selected);
  tracker.confirmed(selected, { ok:true }, { ok:true });
  tracker.confirmed(selected, { ok:true }, { ok:true });
  tracker.abandon(selected);
  assert.equal(events.filter(event => event.name === 'generate_lead').length, 1);
  assert.equal(events.filter(event => event.name === 'inquiry_form_start').length, 1);
  assert.equal(events.filter(event => event.name === 'inquiry_form_complete').length, 1);
  assert.equal(events.filter(event => event.name === 'inquiry_validation_error').length, 1);
  assert.equal(events.filter(event => event.name === 'inquiry_form_abandon').length, 0);
  const lead = events.find(event => event.name === 'generate_lead');
  assert.equal(lead.item_count, 2);
  assert.equal(lead.service_count, 1);
  assert.equal(lead.concept_count, 1);
  assert.equal(lead.items[1].item_variant, 'commercial');
  const itemLeads = events.filter(event => event.name === 'inquiry_item_lead');
  assert.equal(itemLeads.length, 2);
  assert.equal(itemLeads[1].catalog_item_id, 'form-vase');
  assert.equal(itemLeads[1].catalog_item_kind, 'model');
  assert.equal(itemLeads[1].license_type, 'commercial');
});

test('unfinished forms record their stage, while untouched forms do not count as abandoned', () => {
  const events = [];
  const tracker = createInquiryTracker((name, params) => events.push({ name, ...params }));
  tracker.abandon([]);
  assert.equal(events.length, 0);
  tracker.start([]); tracker.failed('verification_load'); tracker.abandon([]);
  assert.equal(events.at(-1).form_stage, 'send_error');
});

test('all 24 content pages use one bootstrap, no old click handlers or duplicate loaders; redirects stay untracked', async () => {
  const pages = ['index.html', 'software/index.html', 'design/index.html', 'stands/index.html', 'contact/index.html', 'contact/privacy-policy.html', 'legal/index.html', 'scanplan/licence.html',
    ...Object.keys(apps).map(id => id + '/index.html'),
    ...['racketscore', 'coachpulse', 'tictactoe', 'connect4', 'dotsandboxes'].map(id => id + '/privacy-policy.html')];
  assert.equal(pages.length, 24);
  let oldLinks = 0;
  for (const page of pages) {
    const html = await readFile(new URL('../' + page, import.meta.url), 'utf8');
    assert.equal((html.match(/src="\/assets\/analytics\.mjs[^\"]*"/g) || []).length, 1, page);
    assert.doesNotMatch(html, /gtag\s*\(|googletagmanager\.com/, page);
    oldLinks += (html.match(/data-legacy-event=/g) || []).length;
  }
  assert.equal(oldLinks, 31);
  for (const page of ['raman/index.html', 'raman/licence.html']) {
    const html = await readFile(new URL('../' + page, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /analytics\.mjs|gtag\s*\(/);
    assert.match(html, /scanplan/);
  }
});

test('laboratory designs keep shared ecommerce events and count as custom-service inquiries', () => {
  assert.equal(pageType('/design/'), '3d_design');
  assert.equal(pageType('/design/index.html'), '3d_design');
  assert.equal(pageType('/stands/'), 'laboratory_stands');
  assert.equal(pageType('/stands/index.html'), 'laboratory_stands');
  const selected = [{ id:'lab-flask-stand' }, { id:'custom-lab-stand' }];
  const clean = sanitizeEvent('add_to_cart', { items:selected, item_list_id:'laboratory_stands', link_location:'laboratory_card' });
  assert.equal(clean.item_list_id, 'laboratory_stands');
  assert.equal(clean.items[0].item_id, 'lab-flask-stand');
  const events = [];
  createInquiryTracker((name, params) => events.push({ name, ...params })).confirmed(selected, { ok:true }, { ok:true });
  const lead = events.find(event => event.name === 'generate_lead');
  assert.equal(lead.service_count, 2);
  assert.equal(lead.concept_count, 0);
  assert.equal(events.filter(event => event.name === 'inquiry_item_lead').length, 2);
});

test('moved design routes redirect without analytics and preserve campaign queries and section links', async () => {
  const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
  for (const [oldPage, target] of [['3d-modeling/index.html', '/design/'], ['3d-modeling/lab-stands/index.html', '/stands/']]) {
    const html = await readFile(new URL('../' + oldPage, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /analytics\.mjs|gtag\s*\(/);
    assert.ok(html.includes('https://nioquant.com' + target));
    let destination;
    const location = { search:'?utm_source=instagram&analytics_debug=1', hash:'#selected-work', replace:url => { destination = url; } };
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { window:{ location }, location });
    assert.equal(destination, target + location.search + location.hash);
    const newHtml = await readFile(new URL('../' + target.slice(1) + 'index.html', import.meta.url), 'utf8');
    assert.ok(newHtml.includes('rel="canonical" href="https://nioquant.com' + target + '"'));
    assert.ok(sitemap.includes('<loc>https://nioquant.com' + target + '</loc>'));
    assert.doesNotMatch(newHtml, /(?:href|content)="[^\"]*\/3d-modeling\//);
  }
  assert.doesNotMatch(sitemap, /\/3d-modeling\//);
  const design = await readFile(new URL('../design/index.html', import.meta.url), 'utf8');
  assert.match(design, /href="\/stands\/"/);
});

test('every migrated app link and actual overview download maps to its intended shared action', async () => {
  let migrated = 0;
  for (const id of Object.keys(apps)) {
    const html = await readFile(new URL('../' + id + '/index.html', import.meta.url), 'utf8');
    for (const [tag, legacy] of html.matchAll(/<a\b[^>]*\bdata-legacy-event="([^"]*)"[^>]*>/g)) {
      const href = tag.match(/\bhref="([^"]*)"/)[1];
      const expected = legacy.startsWith('download_') ? 'app_download'
        : (legacy.startsWith('privacypolicy_') || legacy.startsWith('license_')) ? 'legal_open'
        : legacy.startsWith('whatsnew_') ? 'content_toggle'
        : legacy.startsWith('selfhost_') ? 'section_navigation'
        : legacy.startsWith('open_scanplan') ? 'tool_open'
        : legacy.startsWith('source_scanplan') ? 'source_code_open' : null;
      assert.ok(expected, legacy);
      assert.equal(classifyLink({ href, legacy }, 'https://nioquant.com/' + id + '/').name, expected, legacy);
      migrated++;
    }
  }
  assert.equal(migrated, 31);
  const overview = await readFile(new URL('../software/index.html', import.meta.url), 'utf8');
  const downloads = [...overview.matchAll(/href="(https:\/\/apps\.garmin\.com\/apps\/[^\"]*)"/g)];
  assert.equal(downloads.length, 10);
  for (const [, href] of downloads) assert.equal(classifyLink({ href, placement:'app_card' }, base).name, 'app_download');
});
