import { mountAssistant } from '../../web/event-assistant.js';
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function button(label, action, css = '') { return el('button', { type: 'button', class: css, onClick: action }, label); }
mountAssistant({ el, button, page: 'panel', getContext: () => ({ events: [] }) });
window.openSylarGuide = () => document.querySelector('.guide-launcher').click();
// The first-step link stays on this fictitious example instead of opening an account.
document.addEventListener('click', event => {
  const link = event.target.closest?.('#event-assistant a');
  if (link?.getAttribute('href') === '/cliente-panel.html#nuevo-evento') {
    event.preventDefault(); document.querySelector('#nuevo-evento').scrollIntoView({ behavior: 'instant' });
    document.querySelector('#nuevo-evento').focus();
  }
});
document.addEventListener('close', event => {
  if (event.target.id === 'event-assistant') window.Sylar3D?.focus();
}, true);
