import { catalog } from './catalog.mjs?v=20261004-lab';

function track(name, params) {
  if (window.nioquantAnalytics) window.nioquantAnalytics.track(name, params);
  else (window.nioquantAnalyticsQueue ||= []).push([name, params]);
}
document.querySelectorAll('[data-lab-open]').forEach(button => button.addEventListener('click', () => {
  const id = button.dataset.labOpen;
  const item = catalog.find(item => item.id === id);
  document.querySelector(`[data-lab-dialog="${id}"]`).showModal();
  track('view_item', { items:[{ id }], catalog_item_id:id, catalog_item_kind:item.kind, item_list_id:'laboratory_stands', link_location:'laboratory_card', section_id:'lab-designs' });
}));
document.querySelectorAll('.lab-dialog').forEach(dialog => {
  dialog.querySelector('[data-lab-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => track('model_preview_close', { catalog_item_id:dialog.dataset.labDialog, link_location:'laboratory_gallery' }));
  dialog.querySelectorAll('[data-lab-view]').forEach(button => button.addEventListener('click', () => {
    dialog.querySelector('.lab-gallery-main img').src = button.dataset.labView;
    dialog.querySelector('.lab-gallery-main img').alt = button.dataset.caption;
    dialog.querySelector('figcaption').textContent = button.dataset.caption;
    dialog.querySelectorAll('[data-lab-view]').forEach(view => view.setAttribute('aria-pressed', String(view === button)));
    track('image_open', { catalog_item_id:dialog.dataset.labDialog, content_id:button.dataset.contentId, link_location:'laboratory_gallery' });
  }));
});
