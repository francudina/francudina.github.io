// Shared by the browser and mail worker. IDs, labels and scopes are authoritative.
export const catalog = [
  { id: 'custom-lab-stand', kind: 'service', collection: 'laboratory_stands', name: 'Custom laboratory stand', subtitle: 'Your equipment. Your stand.', scope: 'Custom stand design for lab equipment or glassware. Share the equipment, dimensions, intended use and required positions. Modeling, prototype tests and file rights are agreed in the quote.', status: 'quote' },
  { id: 'lab-flask-stand', kind: 'service', collection: 'laboratory_stands', name: 'Laboratory flask stand', subtitle: 'Six positions, two arrangements', image: '/assets/lab-stands/flask-stand-olive.jpg', scope: 'Custom-fit inquiry based on the built six-position flask stand, for upright use and inverted drying. Glassware dimensions, modeling scope and prototype tests are agreed in the quote.', status: 'quote' },
  { id: 'lab-flask-tube-stand', kind: 'service', collection: 'laboratory_stands', name: 'Laboratory flask + test tube stand', subtitle: 'Six aligned positions', image: '/assets/lab-stands/flask-tube-stand-olive.jpg', scope: 'Custom-fit inquiry based on the built two-level flask and test tube stand. Upper holes keep tubes positioned with the flasks below. Equipment dimensions, modeling scope and prototype tests are agreed in the quote.', status: 'quote' },
  { id: 'lab-funnel-stand', kind: 'service', collection: 'laboratory_stands', name: 'Laboratory funnel stand', subtitle: 'Three notched positions', image: '/assets/lab-stands/funnel-stand-olive.jpg', scope: 'Custom-fit inquiry based on the built three-position funnel stand. Glassware fit, outlet clearance, modeling scope and prototype tests are agreed in the quote.', status: 'quote' },
  { id: 'model-sprint', kind: 'service', name: 'Model sprint', subtitle: 'Give your idea a shape', scope: 'One concept, a 3D model, two revision rounds and agreed digital exports. No printed prototype.', status: 'quote' },
  { id: 'prototype-loop', kind: 'service', name: 'Prototype loop', subtitle: 'Make. Test. Refine.', scope: 'One model, two design-and-test cycles, up to two test prints and a refined digital model. Print size, material and delivery agreed in the quote.', status: 'quote' },
  { id: 'design-partner', kind: 'service', name: 'Design partner', subtitle: 'Room for the next iteration', scope: 'Four focused design cycles, with review checkpoints, agreed prototype tests and documented digital handoff. Print scope agreed in the quote.', status: 'quote' },
  { id: 'form-vase', kind: 'model', name: 'Form / 01', subtitle: 'Sculptural vase', image: '/assets/studio/form-vase.jpg', description: 'A study in soft twists, repeated ribs and a quiet silhouette.', status: 'coming-soon' },
  { id: 'arc-tray', kind: 'model', name: 'Arc / 02', subtitle: 'Desk tray', image: '/assets/studio/arc-tray.jpg', description: 'A small landing place for everyday things. Rounded, open, simple.', status: 'coming-soon' },
  { id: 'loop-holder', kind: 'model', name: 'Loop / 03', subtitle: 'Desk organiser', image: '/assets/studio/loop-holder.jpg', description: 'Two connected volumes. A little order, with room for personality.', status: 'coming-soon' }
];

export const licenses = {
  personal: { name: 'Personal use', detail: 'Interest in a file licence for your own prints.' },
  commercial: { name: 'Commercial use', detail: 'Interest in a licence to sell physical prints; terms to be agreed.' }
};

export const storageKey = 'nioquant.inquiry.v1';

export function normalizeSelection(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.slice(0, 30).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const item = catalog.find(item => item.id === value.id);
    if (!item || seen.has(item.id)) return [];
    if (item.kind === 'model' && !Object.hasOwn(licenses, value.license)) return [];
    seen.add(item.id);
    return [{ id: item.id, ...(item.kind === 'model' ? { license: value.license } : {}) }];
  });
}

export function selectionLines(selection) {
  return normalizeSelection(selection).map((selected, index) => {
    const item = catalog.find(item => item.id === selected.id);
    const detail = item.kind === 'service' ? item.scope : `${licenses[selected.license].name}: concept preview; files not yet available. Interest only, no order or licence granted.`;
    return `${index + 1}. ${item.name} [${item.id}]\n   ${detail}`;
  }).join('\n\n');
}
