import { render } from 'preact';
import content from 'virtual:content';
import { App } from './app/App';
import { AppProviders } from './app/context';
import { Store } from './app/store';
import { listenForInstallPrompt } from './app/install';
import { applyTheme } from './app/theme';
import { registerSW } from './pwa/register';
import { UpdateToast } from './pwa/UpdateToast';
import './app/styles/tokens.css';
import './app/styles/app.css';
import { installTestHook } from './app/test-hook';

const store = new Store();
installTestHook(store);
applyTheme(store.settings);
registerSW();
listenForInstallPrompt();

render(
  <AppProviders content={content} store={store}>
    <App />
    <UpdateToast />
  </AppProviders>,
  document.getElementById('app')!,
);
