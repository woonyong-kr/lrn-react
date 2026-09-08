import { createApp, h } from '../index.js';
import { App } from '../app/App.js';

const flush = () => Promise.resolve().then(() => Promise.resolve());
const check = (condition, message) => { if (!condition) throw Error(message); };

export async function runAppTests() {
  const results = [];
  async function run(name, test) {
    try { await test(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  }
  await run('offline collection search, sort, favorite, detail and runtime inspection', async () => {
    globalThis.__CARD_SHOWCASE_DATA_MODE__ = 'local';
    globalThis.__CARD_SHOWCASE_LOCALE__ = 'en';
    globalThis.localStorage?.clear();
    const root = document.createElement('div');
    const app = createApp({ root, component: App, batching: 'microtask' });
    const event = async (id, type, value) => {
      const node = root.querySelector(id);
      check(node, `Missing ${id}`);
      if (value !== undefined) node.value = value;
      node.dispatchEvent(new Event(type, { bubbles: true }));
      await flush();
    };
    app.mount();
    try {
      await flush();
      check(root.querySelector('#summary-total-cards').textContent.includes('6'), 'Offline seed missing');
      await event('#nav-collection', 'click');
      await event('#collection-sort-select', 'change', 'name');
      check(root.querySelector('#collection-card-grid').firstChild.textContent.includes('Charizard'), 'Sort did not change first card');
      await event('#card-favorite-card-025', 'click');
      await event('#nav-dashboard', 'click');
      check(root.querySelector('#summary-favorite-cards').textContent.includes('1'), 'Favorite did not reach dashboard');
      await event('#nav-collection', 'click');
      await event('#collection-search-input', 'input', 'char');
      const grid = root.querySelector('#collection-card-grid').textContent;
      check(grid.includes('Charizard') && !grid.includes('Pikachu'), 'Search did not narrow cards');
      await event('#card-open-card-006', 'click');
      check(root.querySelector('#detail-card-name').textContent.includes('Charizard'), 'Detail shows wrong card');
      const snapshot = app.inspect();
      check(snapshot.renderCount > 1 && snapshot.totalPatchCount > 0, 'Inspector did not observe updates');
    } finally { app.unmount(); }
    check(root.textContent === '', 'Unmount left rendered content');
  });
  await run('DOM props and event handlers are replaced and removed', () => {
    const root = document.createElement('div');
    const calls = [];
    const View = props => h('button', props, 'action');
    const app = createApp({ root, component: View, props: {
      title: 'old', className: 'old', onClick: () => calls.push('old'), disabled: false,
    } });
    app.mount();
    try {
      const button = root.firstChild;
      button.dispatchEvent(new Event('click'));
      app.updateProps({ title: 'new', onClick: () => calls.push('new'), disabled: true });
      check(root.firstChild === button && button.getAttribute('title') === 'new', 'Updated node identity or title lost');
      // Inspector may add its own transient highlight class. Only the removed prop must disappear.
      check(!button.className.split(/\s+/).includes('old') && button.disabled, 'Old class or boolean property not patched');
      // Synthetic dispatch still reaches a disabled button and reveals stale listeners.
      button.dispatchEvent(new Event('click'));
      app.updateProps({});
      button.dispatchEvent(new Event('click'));
      check(calls.join(',') === 'old,new', 'Old or removed event handler ran');
      check(button.getAttribute('title') === null && !button.disabled, 'Removed props remained');
    } finally { app.unmount(); }
  });
  return results;
}
