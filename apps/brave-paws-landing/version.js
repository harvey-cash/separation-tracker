/* global __APP_VERSION__ */
// Injected at build time by the landing page Vite config.

const versionElement = document.querySelector('#app-version');

if (versionElement) {
  versionElement.textContent = `v${__APP_VERSION__}`;
}
