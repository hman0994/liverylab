/**
 * export.js — PNG and TGA download helpers for Livery Lab
 *
 * Relies on:
 *  - TGA.encode()  from lib/tga.js
 *  - editor.getExportImageData(size) from js/editor.js
 */

/**
 * Trigger a browser file download for a Blob.
 * Works in all modern browsers without any server.
 *
 * @param {Blob|Uint8Array} data
 * @param {string}          filename
 */
function triggerDownload(data, filename) {
  const blob = (data instanceof Uint8Array)
    ? new Blob([data], { type: 'application/octet-stream' })
    : data;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Export the current canvas as a PNG file.
 *
 * iRacing also accepts PNG as a paint file (drop in
 *   Documents\iRacing\paint\<car_folder>\ as car_XXXXXXXX.png)
 *
 * @param {PaintEditor} editor
 * @param {number}      outputSize   1024 | 2048
 * @param {string}      carFolder
 */
async function exportPNG(editor, outputSize = 2048, carFolder = '') {
  showToast('Preparing PNG export…');
  const imageData = await editor.getExportImageData(outputSize);
  const targetFolder = carFolder || 'your_car_folder';

  const tmpCanvas    = document.createElement('canvas');
  tmpCanvas.width    = outputSize;
  tmpCanvas.height   = outputSize;
  const tmpCtx       = tmpCanvas.getContext('2d');
  tmpCtx.putImageData(imageData, 0, 0);

  tmpCanvas.toBlob((blob) => {
    triggerDownload(blob, `car_custom_${outputSize}.png`);
    showToast(`PNG saved!  Place it in Documents\\iRacing\\paint\\${targetFolder}\\`, 'success');
  }, 'image/png');
}

/**
 * Export the current canvas as a 32-bit TGA file.
 *
 * This is the primary format iRacing recognises.
 * Rename the downloaded file to   car_XXXXXXXX.tga   (replace XXXXXXXX with
 * your iRacing customer ID) and place it in:
 *   Documents\iRacing\paint\<car_folder>\
 *
 * @param {PaintEditor} editor
 * @param {number}      outputSize   1024 | 2048
 * @param {string}      carFolder
 */
async function exportTGA(editor, outputSize = 2048, carFolder = '') {
  showToast('Preparing TGA export…');
  const imageData  = await editor.getExportImageData(outputSize);
  const targetFolder = carFolder || 'your_car_folder';
  const tgaBytes   = TGA.encode(imageData);
  triggerDownload(tgaBytes, `car_custom_${outputSize}.tga`);
  showToast(`TGA saved!  Rename to car_XXXXXXXX.tga and place in Documents\\iRacing\\paint\\${targetFolder}\\`, 'success');
}

/* ── Toast notification helper ─────────────────────────────── */
// (also used by editor.js)
let _toastTimer = null;
function showToast(message, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const div = document.createElement('div');
  div.className = 'toast' + (type ? ' ' + type : '');
  div.textContent = message;
  root.appendChild(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.4s';
    setTimeout(() => root.removeChild(div), 400);
  }, 3500);
}
