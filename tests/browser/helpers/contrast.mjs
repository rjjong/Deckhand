import { writeFile } from 'node:fs/promises';

// Use computed ink colors against a screenshot with text and SVGs hidden.
// This measures the actual gradients and translucent surfaces without counting
// antialiasing as a change to the intended foreground color.
export async function auditContrast(page, selector, backgroundPath) {
  const samples = await page.locator(selector).evaluate((root) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const path = (el) => {
      const parts = [];
      for (let n = el; n && parts.length < 4; n = n.parentElement) {
        parts.unshift(
          n.id
            ? `#${n.id}`
            : n.tagName.toLowerCase() + [...n.classList].map((c) => '.' + c).join(''),
        );
        if (n.id) break;
      }
      return parts.join(' > ');
    };
    const result = [];
    const add = (el, rect, text, kind, color) => {
      if (
        !rect ||
        rect.width < 1 ||
        rect.height < 1 ||
        el.closest(':disabled, [aria-disabled="true"], svg, script, style')
      )
        return;
      const style = getComputedStyle(el);
      if (style.visibility !== 'visible' || style.display === 'none') return;
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      if (opacity < 0.01) return;
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      if (x < 1 || y < 1 || x >= innerWidth - 1 || y >= innerHeight - 1) return;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit) || hit === el.parentElement)) return;
      const ink = rgba(color || style.webkitTextFillColor || style.color);
      if (!ink[3]) return; // Gradient-filled lettering is reviewed in previews.
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.667 && Number(style.fontWeight) >= 700);
      const symbol = /^[×✕✖✗+−✓›▾←→]+$/.test(text.trim());
      result.push({
        selector: path(el),
        text: text.trim().slice(0, 90),
        kind,
        x,
        y,
        ink,
        opacity,
        minimum: kind === 'icon' || large || symbol ? 3 : 4.5,
      });
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // Color emoji are raster glyphs; their colors do not follow CSS ink.
      if (
        !node.textContent.trim() ||
        /^[\p{Extended_Pictographic}\uFE0F\s]+$/u.test(node.textContent)
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects())
        add(node.parentElement, rect, node.textContent, 'text');
    }
    root
      .querySelectorAll(
        'input:not([type="checkbox"]):not([type="range"]):not([type="file"]), textarea, select',
      )
      .forEach((el) => {
        const placeholder = !el.value && el.placeholder;
        add(
          el,
          el.getBoundingClientRect(),
          el.value || placeholder || '',
          'field',
          getComputedStyle(el, placeholder ? '::placeholder' : null).color,
        );
      });
    root.querySelectorAll('button svg, .hub-icon svg, [role="img"] svg').forEach((svg) => {
      const ink = getComputedStyle(svg).stroke;
      if (ink === 'none') return;
      // Sample through its parent: an SVG can itself have aria-hidden but still
      // be the only visible identification of a button.
      add(
        svg.parentElement,
        svg.getBoundingClientRect(),
        svg.closest('button')?.getAttribute('aria-label') || 'icon',
        'icon',
        ink,
      );
    });
    return result;
  });
  // The app also uses !important for title ink. A mask with higher specificity
  // must win there too, otherwise a glyph is mistaken for its own background.
  const mask = ':is(#contrast-mask-a#contrast-mask-b#contrast-mask-c, *)';
  const hidden = await page.addStyleTag({
    content: `${mask} { -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } ${mask}::before, ${mask}::after { -webkit-text-fill-color: transparent !important; } ${mask} svg { visibility: hidden !important; }`,
  });
  try {
    const png = await page.screenshot({ scale: 'css', animations: 'disabled' });
    if (backgroundPath) await writeFile(backgroundPath, png);
    return await page.evaluate(
      async ({ samples, png }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + png;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const lum = (rgb) =>
          rgb
            .map((c) => c / 255)
            .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
            .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        return samples.map((s) => {
          const background = [
            ...ctx.getImageData(Math.floor(s.x), Math.floor(s.y), 1, 1).data,
          ].slice(0, 3);
          const alpha = (s.ink[3] / 255) * s.opacity;
          const foreground = s.ink
            .slice(0, 3)
            .map((c, i) => c * alpha + background[i] * (1 - alpha));
          const a = lum(background),
            b = lum(foreground);
          return {
            ...s,
            background,
            foreground,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
      },
      { samples, png: png.toString('base64') },
    );
  } finally {
    await hidden.evaluate((el) => el.remove());
  }
}
