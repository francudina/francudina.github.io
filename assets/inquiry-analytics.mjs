import { catalog, normalizeSelection } from './catalog.mjs?v=20261004-lab';

// Keep public catalog choices separate from the private mail payload.
export function selectionMetrics(values) {
  const items = normalizeSelection(values);
  const serviceCount = items.filter(value => catalog.find(item => item.id === value.id).kind === 'service').length;
  return { items, item_count:items.length, service_count:serviceCount, concept_count:items.length - serviceCount };
}
export function createInquiryTracker(track) {
  let started = false;
  let completed = false;
  let fieldsComplete = false;
  let stage = 'editing';
  const invalidFields = new Set();
  const emit = (name, params = {}) => track(name, { form_id:'inquiry', link_location:'contact_form', ...params });
  return {
    start(values) {
      if (started || completed) return;
      started = true;
      emit('inquiry_form_start', selectionMetrics(values));
    },
    completeFields(values) {
      if (fieldsComplete || completed) return;
      fieldsComplete = true;
      stage = 'ready';
      emit('inquiry_form_complete', selectionMetrics(values));
    },
    attempt(values) {
      if (completed) return;
      invalidFields.clear();
      emit('inquiry_submit_attempt', selectionMetrics(values));
    },
    invalid(fieldId) {
      if (!['inquiryName', 'inquiryEmail', 'inquiryMessage', 'inquiryConsent'].includes(fieldId) || invalidFields.has(fieldId)) return;
      invalidFields.add(fieldId);
      emit('inquiry_validation_error', { field_id:fieldId });
    },
    blocked(reason) { emit('inquiry_submit_blocked', { reason }); },
    sending(values) { stage = 'sending'; emit('inquiry_send_started', selectionMetrics(values)); },
    failed(errorType, status = 0) {
      stage = 'send_error';
      emit('inquiry_send_error', { error_type:errorType, http_status:status });
    },
    confirmed(values, response, result) {
      // A button click, blocked request or unconfirmed response is never a lead.
      if (completed || !response?.ok || result?.ok !== true) return;
      completed = true;
      stage = 'sent';
      const metrics = selectionMetrics(values);
      emit('generate_lead', { ...metrics, method:'contact_form' });
      // Flat public dimensions work in lead reports even outside ecommerce events.
      for (const value of metrics.items) {
        emit('inquiry_item_lead', {
          catalog_item_id:value.id, catalog_item_kind:catalog.find(item => item.id === value.id).kind,
          license_type:value.license, items:[value], method:'contact_form'
        });
      }
    },
    abandon(values) {
      if (started && !completed) emit('inquiry_form_abandon', { ...selectionMetrics(values), form_stage:stage });
    }
  };
}
