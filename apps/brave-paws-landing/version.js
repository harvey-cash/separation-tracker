const versionElement = document.querySelector('#app-version');

if (versionElement) {
  versionElement.textContent = `v${__APP_VERSION__}`;
}
