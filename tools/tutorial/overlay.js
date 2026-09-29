// Injected into the recorded page (after vclock.js): what the video draws
// over the page. Headless Chromium shows no mouse pointer, so the pointer,
// its click ripples, a highlight ring and the title cards are elements on
// top of the page, placed every frame by the recorder (director.mjs) with
// window.__tutorial.apply(state). Nothing here animates on its own: every
// frame is drawn from the state, so a recording plays the same every time.
(() =>
{
  const ARROW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    + '<path d="M3 1.5 L3 19.5 L7.8 15.2 L11 22.3 L14.4 20.8 L11.3 13.9 L17.8 13.9 Z" '
    + 'fill="#ffffff" stroke="#10151b" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const FONT = '"Fira Sans", "Segoe UI", system-ui, sans-serif';
  let root = null;
  let cursor = null;
  let ring = null;
  let card = null;
  const ripples = [];

  const make = (css, parent) =>
  {
    const el = document.createElement('div');
    el.style.cssText = css;
    parent.appendChild(el);
    return el;
  };

  const build = () =>
  {
    root = make('position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;', document.body);
    ring = make('position:absolute;display:none;border:3px solid #2dd4bf;border-radius:10px;'
      + 'box-shadow:0 0 0 4px rgba(45,212,191,0.18),0 0 24px rgba(45,212,191,0.35);', root);
    card = make('position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;'
      + `font-family:${FONT};color:#e8f1f8;text-align:center;`, root);
    card.innerHTML = '<div data-part="panel" style="display:flex;flex-direction:column;align-items:center;">'
      + '<div data-part="kicker" style="color:#2dd4bf;font-weight:700;letter-spacing:0.04em;"></div>'
      + '<div data-part="title" style="font-weight:800;line-height:1.1;"></div>'
      + '<div data-part="rule" style="background:#2dd4bf;border-radius:3px;"></div></div>';
    cursor = make('position:absolute;left:0;top:0;width:24px;height:24px;transform-origin:0 0;display:none;'
      + 'filter:drop-shadow(0 2px 3px rgba(0,0,0,0.55));', root);
    cursor.innerHTML = ARROW;
  };

  const ripple = (i) =>
  {
    while (ripples.length <= i)
    {
      ripples.push(make('position:absolute;border-radius:50%;border:3px solid #2dd4bf;background:rgba(45,212,191,0.25);display:none;', root));
    }
    return ripples[i];
  };

  const part = (name) => card.querySelector(`[data-part="${name}"]`);

  // state: { cursor: { x, y, scale, down }, ripples: [{ x, y, r, alpha }],
  //   ring: { x, y, w, h, alpha }, card: { kicker, title, alpha, banner } }
  // (page pixels; `scale` sizes the pointer, drawn 24 px at 1).
  const apply = (state) =>
  {
    if (!root)
    {
      build();
    }
    const c = state.cursor;
    cursor.style.display = c ? 'block' : 'none';
    if (c)
    {
      const s = c.scale * (c.down ? 0.86 : 1);
      cursor.style.transform = `translate(${c.x - 3 * s}px, ${c.y - 1.5 * s}px) scale(${s})`;
    }
    const list = state.ripples || [];
    list.forEach((r, i) =>
    {
      const el = ripple(i);
      el.style.display = 'block';
      el.style.left = `${r.x - r.r}px`;
      el.style.top = `${r.y - r.r}px`;
      el.style.width = el.style.height = `${2 * r.r}px`;
      el.style.opacity = String(r.alpha);
    });
    for (let i = list.length; i < ripples.length; i++)
    {
      ripples[i].style.display = 'none';
    }
    const g = state.ring;
    ring.style.display = g && g.alpha > 0 ? 'block' : 'none';
    if (g)
    {
      Object.assign(ring.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px`, opacity: String(g.alpha) });
    }
    const k = state.card;
    card.style.display = k && k.alpha > 0 ? 'flex' : 'none';
    if (k)
    {
      part('kicker').textContent = k.kicker;
      part('title').textContent = k.title;
      const panel = part('panel');
      card.style.opacity = String(k.alpha);
      if (k.banner)
      {
        card.style.background = 'transparent';
        card.style.justifyContent = 'flex-start';
        card.style.paddingTop = '96px';
        Object.assign(panel.style, { background: 'rgba(15,20,25,0.93)', border: '2px solid #2dd4bf', borderRadius: '18px', padding: '22px 44px 26px' });
        part('kicker').style.fontSize = '24px';
        part('title').style.fontSize = '40px';
        part('title').style.marginTop = '6px';
        Object.assign(part('rule').style, { display: 'none' });
      }
      else
      {
        card.style.background = 'radial-gradient(ellipse at 50% 45%, #18242f 0%, #0f1419 70%)';
        card.style.justifyContent = 'center';
        card.style.paddingTop = '0';
        Object.assign(panel.style, { background: 'none', border: 'none', padding: '0' });
        part('kicker').style.fontSize = '30px';
        part('title').style.fontSize = '72px';
        part('title').style.marginTop = '14px';
        Object.assign(part('rule').style, { display: 'block', width: `${Math.round(220 * (k.rule ?? 1))}px`, height: '6px', marginTop: '30px' });
      }
    }
  };

  window.__tutorial = { apply };
})();
