// WhatsApp / phone helpers. Works in browsers and in the Capacitor Android app
// (external https:// and tel: links are handed to WhatsApp / the dialer by Android).

/** Digits-only international number for wa.me. Nigeria (234) is the default country. */
export function waNumber(raw, defaultCc = '234') {
  if (!raw) return '';
  let d = String(raw).trim();
  if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
  d = d.replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return defaultCc + d.slice(1);
  if (d.startsWith(defaultCc) && d.length >= 12) return d;
  if (d.length === 10) return defaultCc + d;
  return d;
}
export const waLink = (number, text = '') => {
  const n = waNumber(number);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '';
};
export const telLink = number => {
  const n = String(number || '').replace(/[^\d+]/g, '');
  return n ? `tel:${n}` : '';
};

/** Opens a link outside the app (WhatsApp / dialer). */
export function openExternal(url) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

/** Builds the pre-order text. `t` is the i18n function. */
export function buildPreorderMessage({ t, business, supplier, items }) {
  const lines = items.map((i, n) => `${n + 1}. ${i.name} — ${i.quantity}${i.unit ? ` ${i.unit}` : ''}`);
  return [t('msg_hello', { supplier: supplier.contact_person || supplier.name, business }), '', ...lines, '', t('msg_thanks')].join('\n');
}
