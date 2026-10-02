// Contexto compartido entre vistas y hojas: fecha de trabajo, refresco y guardado.
import { save, today } from './store.js';
import { sheets, alertBox, toast } from './ui.js';

export const ctx = { date: today(), tab: 'hoy' };

let renderView = () => {};
export const onRefresh = (f) => (renderView = f);

/** Vuelve a pintar la vista y las hojas "vivas" (salvo `except`). */
export function refresh(except = null) {
  renderView();
  for (const s of sheets) if (s.opts.live && !s.closed && s !== except) s.render();
}

export function commit() {
  if (!save()) {
    alertBox({ title: 'No se pudo guardar', message: 'El almacenamiento del dispositivo está lleno o bloqueado. Exporta una copia de seguridad.' });
  }
  refresh();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado');
}

export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  await copyText(text);
  toast('Copiado: pégalo en WhatsApp');
}
