import { mountMomentosHelp } from '../../web/sylar/momentos-help.js';
const assistant = document.querySelector('#sylar-demo');
if (assistant && customElements.get('sylar-assistant')) {
  const stop = mountMomentosHelp(assistant, {local:true});
  window.addEventListener('pagehide', stop, {once:true});
}
