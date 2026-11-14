// "QR-Code" button in the header bar: opens a large popup with the QR code that
// links to the live app (docs/qr-code.svg), e.g. to show it on a projector.
// Closes with the × button, the Esc key or a click outside the code.
(function () {
  const bar = document.querySelector('.app-bar');
  if (!bar) return;
  const url = (window.APP_CONFIG && window.APP_CONFIG.liveUrl) || 'https://glamhack.github.io/Hoppstory/';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'qr-btn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.title = 'QR-Code zur App anzeigen';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm-6 2h2v2h-2zm4 0h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2z"/>
    </svg><span class="qr-btn-text">QR-Code</span>`;
  bar.appendChild(btn);

  const dialog = document.createElement('dialog');
  dialog.className = 'qr-dialog';
  dialog.setAttribute('aria-label', 'QR-Code zur App');
  dialog.innerHTML = `
    <button type="button" class="qr-close" aria-label="Schliessen">&times;</button>
    <img class="qr-image" src="docs/qr-code.svg" alt="QR-Code: ${url}">
    <p class="qr-caption">Hopp!story auf dem Handy öffnen</p>
    <p class="qr-url">${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>`;
  document.body.appendChild(dialog);

  btn.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('.qr-close').addEventListener('click', () => dialog.close());
  // A click on the dark backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
})();
