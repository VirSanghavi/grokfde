/**
 * In-page check functions, evaluated inside the browser by browser.mjs.
 *
 * These are written as plain source strings passed to page.evaluate, so they
 * run in the page context with no bundler involved. Each returns a plain
 * serialisable object describing what it found.
 */

/** Elements a user can operate. */
const INTERACTIVE_SELECTOR =
  'a, button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])';

/** Shared helpers injected into the page before every check. */
export const PAGE_HELPERS = `
  function qaVisible(el) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function qaDescribe(el) {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
    return el.tagName.toLowerCase() + id + cls + (text ? ' "' + text + '"' : '');
  }

  /** A CSS path a human can paste into devtools to land on the element. */
  function qaSelectorPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(part + '#' + node.id); break; }
      const cls = typeof node.className === 'string'
        ? node.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2)
        : [];
      if (cls.length) part += '.' + cls.join('.');
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function qaAccessibleName(el) {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\\s+/)
        .map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; })
        .join(' ').trim();
      if (parts) return parts;
    }
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    if (el.tagName === 'INPUT' && el.labels && el.labels.length) {
      const l = Array.from(el.labels).map(function (n) { return n.textContent; }).join(' ').trim();
      if (l) return l;
    }
    if (el.tagName === 'INPUT' && el.value && (el.type === 'submit' || el.type === 'button')) return el.value;
    return '';
  }

  /** React 19 hangs its props off the DOM node; this reads them when present. */
  function qaReactProps(el) {
    for (const key in el) {
      if (key.indexOf('__reactProps$') === 0) return el[key];
    }
    return null;
  }

  function qaScrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }

  const QA_INTERACTIVE = ${JSON.stringify(INTERACTIVE_SELECTOR)};
`;

/**
 * Playwright evaluates a string argument as an EXPRESSION, so a bare function
 * declaration at the top of the source is a SyntaxError and every check dies
 * before it runs. Wrapping the helpers and the check body in one arrow IIFE
 * keeps the whole thing a single expression.
 */
/**
 * Typeface families permitted by docs/DESIGN.md, as a regex source matched
 * against the first family in the computed font stack. The product ships on
 * Geist and the contract says to keep it. Override with QA_ALLOWED_FONTS if the
 * face ever changes again, so this is a config edit rather than a code change.
 */
const ALLOWED_FONT_PATTERN = process.env.QA_ALLOWED_FONTS || "Geist";

const inPage = (expression) => `(() => {
${PAGE_HELPERS}
  return (${expression});
})()`;

/** document.scrollWidth vs the viewport, plus any element sticking out. */
export const CHECK_OVERFLOW = inPage(`
  (() => {
    const viewport = window.innerWidth;
    const docScrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );

    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!qaVisible(el)) continue;
      if (qaScrollableAncestor(el)) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed') continue;
      const rect = el.getBoundingClientRect();
      const overRight = rect.right - viewport;
      const overLeft = -rect.left;
      if (overRight > 1 || overLeft > 1) {
        offenders.push({
          el: qaDescribe(el),
          overflowPx: Math.round(Math.max(overRight, overLeft)),
          width: Math.round(rect.width),
        });
      }
    }

    offenders.sort((a, b) => b.overflowPx - a.overflowPx);
    return { viewport, docScrollWidth, offenders: offenders.slice(0, 8), offenderCount: offenders.length };
  })()
`);

/** Anchors with no real destination, and buttons with no reachable handler. */
export const CHECK_ACTIONS = inPage(`
  (() => {
    const deadLinks = [];
    const deadButtons = [];
    let reactSeen = false;

    for (const a of document.querySelectorAll('a')) {
      if (!qaVisible(a)) continue;
      const href = a.getAttribute('href');
      const raw = href === null ? null : href.trim();
      if (raw === null || raw === '' || raw === '#' || /^javascript:\\s*(void\\(0\\))?;?$/i.test(raw)) {
        // An anchor with a click handler and no href is a styling choice, not a
        // dead end, so only flag it when nothing would happen on click.
        const props = qaReactProps(a);
        if (props) reactSeen = true;
        if (!props || !props.onClick) {
          deadLinks.push({ el: qaDescribe(a), href: raw === null ? '(missing)' : raw });
        }
      }
    }

    for (const b of document.querySelectorAll('button, [role=button]')) {
      if (!qaVisible(b)) continue;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
      if (b.type === 'submit' || b.type === 'reset') continue;
      if (b.closest('a[href]')) continue;
      if (b.closest('form') && !b.type) continue;
      const props = qaReactProps(b);
      if (!props) continue; // Not a React-owned node; handler cannot be inspected.
      reactSeen = true;
      const hasHandler = Boolean(
        props.onClick || props.onPointerDown || props.onMouseDown || props.onKeyDown || props.onSubmit
      );
      if (!hasHandler) deadButtons.push({ el: qaDescribe(b) });
    }

    return { deadLinks: deadLinks.slice(0, 8), deadButtons: deadButtons.slice(0, 8), reactSeen };
  })()
`);

/** Tap targets below 44x44 CSS px, excluding inline links inside prose. */
export const CHECK_TAP_TARGETS = inPage(`
  (() => {
    const small = [];
    for (const el of document.querySelectorAll(QA_INTERACTIVE)) {
      if (!qaVisible(el)) continue;
      const style = getComputedStyle(el);
      // WCAG 2.5.5 exempts links that sit inline within a sentence.
      if (el.tagName === 'A' && style.display.indexOf('inline') === 0) {
        const prose = el.closest('p, li, span, small, figcaption, label, td');
        if (prose && (prose.textContent || '').trim().length > (el.textContent || '').trim().length + 8) continue;
      }
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = el.labels && el.labels[0];
        if (label) {
          const lr = label.getBoundingClientRect();
          if (lr.width >= 44 && lr.height >= 44) continue;
        }
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width < 44 || rect.height < 44) {
        small.push({ el: qaDescribe(el), size: Math.round(rect.width) + 'x' + Math.round(rect.height) });
      }
    }
    return { small: small.slice(0, 10), count: small.length };
  })()
`);

/** Text whose computed colour fails WCAG contrast against its background. */
export const CHECK_CONTRAST = inPage(`
  (() => {
    function parseColor(value) {
      const m = value.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(',').map(function (n) { return parseFloat(n); });
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    function blend(fg, bg) {
      const a = fg.a;
      return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1,
      };
    }

    function luminance(c) {
      const chan = [c.r, c.g, c.b].map(function (v) {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
    }

    function ratio(a, b) {
      const la = luminance(a);
      const lb = luminance(b);
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    }

    /** Walk up for the first opaque background; bail out on images/gradients. */
    function effectiveBackground(el) {
      let node = el;
      let acc = null;
      while (node && node !== document.documentElement.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== 'none') return { unknown: true };
        const bg = parseColor(style.backgroundColor);
        if (bg && bg.a > 0) {
          acc = acc ? blend(acc, bg) : bg;
          if (acc.a >= 0.999) return acc;
        }
        node = node.parentElement;
      }
      return acc && acc.a >= 0.999 ? acc : { r: 255, g: 255, b: 255, a: 1 };
    }

    // Text sitting over a video, image, or canvas has no measurable background
    // colour: walking up the ancestors finds the page ground behind the media
    // and reports white-on-white, which is a false positive every time. The
    // marketing hero is exactly this case. Collect the media that covers the
    // page so text on top of it is counted as unmeasurable instead.
    const mediaOverlays = [];
    for (const media of document.querySelectorAll('video, img, canvas')) {
      const position = getComputedStyle(media).position;
      if (position !== 'absolute' && position !== 'fixed') continue;
      const r = media.getBoundingClientRect();
      if (r.width >= 40 && r.height >= 40) mediaOverlays.push(r);
    }
    function overMedia(rect) {
      for (const o of mediaOverlays) {
        if (rect.left >= o.left - 1 && rect.right <= o.right + 1 &&
            rect.top >= o.top - 1 && rect.bottom <= o.bottom + 1) return true;
      }
      return false;
    }

    const failures = [];
    let checked = 0;
    let skippedForImage = 0;

    for (const el of document.querySelectorAll('body *')) {
      if (!qaVisible(el)) continue;
      // Only leaf-ish nodes that own their own text.
      let ownText = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) ownText += node.textContent;
      }
      ownText = ownText.replace(/\\s+/g, ' ').trim();
      if (ownText.length < 2) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (overMedia(rect)) { skippedForImage++; continue; }

      const style = getComputedStyle(el);
      const fg = parseColor(style.color);
      if (!fg || fg.a === 0) continue;

      const bg = effectiveBackground(el);
      if (bg.unknown) { skippedForImage++; continue; }

      const resolved = fg.a < 1 ? blend(fg, bg) : fg;
      const size = parseFloat(style.fontSize);
      const weight = parseInt(style.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const required = large ? 3 : 4.5;
      const value = ratio(resolved, bg);
      checked++;

      if (value < required - 0.01) {
        failures.push({
          el: qaDescribe(el),
          text: ownText.slice(0, 40),
          ratio: Math.round(value * 100) / 100,
          required: required,
          color: style.color,
          // Naming the resolved background matters: a token can clear 4.5:1 on
          // paper and fail on a sunken surface, and only the pair tells you.
          background: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
          fontSize: Math.round(size),
        });
      }
    }

    failures.sort((a, b) => a.ratio - b.ratio);
    return { failures: failures.slice(0, 10), failureCount: failures.length, checked, skippedForImage };
  })()
`);

/** Images without alt text and controls without an accessible name. */
export const CHECK_LABELS = inPage(`
  (() => {
    const imagesWithoutAlt = [];
    for (const img of document.querySelectorAll('img')) {
      if (!qaVisible(img)) continue;
      if (img.getAttribute('aria-hidden') === 'true' || img.getAttribute('role') === 'presentation') continue;
      if (img.getAttribute('alt') === null) imagesWithoutAlt.push({ el: qaDescribe(img), src: (img.getAttribute('src') || '').slice(0, 60) });
    }

    const unnamed = [];
    for (const el of document.querySelectorAll('button, [role=button], a, input:not([type=hidden]), select, textarea')) {
      if (!qaVisible(el)) continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (el.tagName === 'INPUT' && el.type === 'submit' && el.value) continue;
      const name = qaAccessibleName(el) || el.getAttribute('placeholder') || '';
      if (!name.trim()) unnamed.push({ el: qaDescribe(el) });
    }

    return {
      imagesWithoutAlt: imagesWithoutAlt.slice(0, 8),
      imagesWithoutAltCount: imagesWithoutAlt.length,
      unnamed: unnamed.slice(0, 8),
      unnamedCount: unnamed.length,
    };
  })()
`);

/**
 * Focus visibility. Focuses a sample of interactive elements and compares the
 * computed outline and shadow before and after; nothing changing means the
 * focus ring was removed with no replacement.
 */
export const CHECK_FOCUS_VISIBLE = inPage(`
  (() => {
    function signature(el) {
      const s = getComputedStyle(el);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|');
    }

    const invisible = [];
    const candidates = Array.from(document.querySelectorAll(QA_INTERACTIVE)).filter(qaVisible).slice(0, 20);
    const active = document.activeElement;

    for (const el of candidates) {
      const before = signature(el);
      try { el.focus({ preventScroll: true }); } catch (e) { continue; }
      if (document.activeElement !== el) continue;
      const after = signature(el);
      if (before === after) invisible.push({ el: qaDescribe(el) });
      try { el.blur(); } catch (e) { /* ignore */ }
    }

    if (active && active.focus) { try { active.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    return { invisible: invisible.slice(0, 8), invisibleCount: invisible.length, sampled: candidates.length };
  })()
`);

/**
 * Design contract, enforced against computed style rather than source class
 * names, so a violation is caught however it was authored.
 *
 * Each rule below is a literal ban from docs/DESIGN.md:
 *   - rounded-full on anything that is not an avatar or a status dot
 *   - a page-width cap, since the contract now demands full width
 *   - any typeface other than IBM Plex Sans / IBM Plex Mono
 *   - em dashes in user-facing copy
 *   - gradient backgrounds, animate-pulse, and transition-all
 */
export const CHECK_DESIGN = inPage(`
  (() => {
    const viewport = window.innerWidth;
    const QA_ALLOWED_FONTS = ${JSON.stringify(ALLOWED_FONT_PATTERN)};

    // --- rounded-full ------------------------------------------------------
    function cornerIsRound(value, minSide) {
      if (!value) return false;
      if (value.indexOf('%') !== -1) return parseFloat(value) >= 45;
      const px = parseFloat(value);
      // A hairline rule is 1px tall, so half its height is under the 4px
      // control radius and a square corner would otherwise read as round.
      if (Number.isNaN(px) || px <= 0) return false;
      return px >= minSide / 2 - 0.5;
    }

    const pills = [];
    // --- typography, colour, motion, and copy, in one pass -----------------
    const badFonts = new Map();
    const gradients = [];
    const scrims = [];
    const animations = [];
    const transitionAll = [];
    const otherMotion = [];
    const shouty = [];
    const shoutyAllowed = [];
    const hardcodedHex = [];

    // Acronyms are uppercase because that is how they are spelled, not to shout.
    const ACRONYMS = ['FDE','API','MCP','AI','URL','PR','CI','CD','SLA','UTC','PST','PDT','QA','ID','OK','SDK','HTTP','JSON','SQL','AWS','GPU','RAM','SSO','MFA','PII','TLS'];

    /** The one legitimate uppercase: the mono "label" type tier. */
    function isLabelTier(style) {
      const size = parseFloat(style.fontSize);
      const tracking = parseFloat(style.letterSpacing);
      const mono = /IBM[_ ]?Plex[_ ]?Mono|monospace/i.test(style.fontFamily || '');
      return mono && size <= 12.5 && !Number.isNaN(tracking) && tracking >= 0.4;
    }

    // The product ships on Geist and docs/DESIGN.md now says to keep it, so
    // Geist Sans and Geist Mono are the contract and anything else is the
    // violation. "There is no third font."
    //
    // next/font emits hashed family names like "__Geist_a1b2c3", so this
    // matches on the family stem rather than an exact string. The allowlist is
    // overridable so a future change of face is a config edit, not a rewrite.
    const ALLOWED_FONT = new RegExp(QA_ALLOWED_FONTS, 'i');

    for (const el of document.querySelectorAll('body *')) {
      if (!qaVisible(el)) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' ? el.className : '';

      // The element's OWN text, excluding descendants, so a finding names the
      // node that actually paints the characters.
      let ownText = '';
      for (const node of el.childNodes) if (node.nodeType === 3) ownText += node.textContent;
      ownText = ownText.replace(/\\s+/g, ' ').trim();

      // rounded-full.
      //
      // The rule is geometric: a pill radius is allowed ONLY on a perfect
      // circle. That covers avatars (including an avatar showing initials,
      // which is still an avatar), status dots, and spinner rings. What stays
      // banned is a CAPSULE, meaning a rounded-full element wider than it is
      // tall: a status, a badge, a chip, a tag, a button. Checking computed
      // style rather than class names means a refactor cannot dodge it.
      if (rect.width > 0 && rect.height > 0) {
        const minSide = Math.min(rect.width, rect.height);
        const round =
          cornerIsRound(style.borderTopLeftRadius, minSide) &&
          cornerIsRound(style.borderBottomRightRadius, minSide);
        if (round && Math.abs(rect.width - rect.height) > 1) {
          pills.push({
            selector: qaSelectorPath(el),
            text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            radius: style.borderTopLeftRadius,
            reason: 'capsule: rounded-full but not a circle',
          });
        }
      }

      // typeface
      const family = (style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      // Only report elements that actually paint text in that family.
      if (family && !ALLOWED_FONT.test(family) && ownText.length > 1 && !badFonts.has(family)) {
        badFonts.set(family, { family: family, el: qaSelectorPath(el), text: ownText.slice(0, 30) });
      }

      // Gradients.
      //
      // The ban targets DECORATIVE COLOUR. An alpha ramp in black or the stage
      // colour, laid over the hero film so white text stays legible, is a
      // legibility tool and is permitted. So the test is not "is there a
      // gradient" but "does it carry colour": if every stop is neutral (grey,
      // black, or fully transparent) it is a scrim, and if any stop is a real
      // hue it is decoration.
      const bgImage = style.backgroundImage || '';
      if (bgImage.indexOf('gradient(') !== -1) {
        const stops = bgImage.match(/(rgba?|oklab|oklch|hsla?)\\([^)]*\\)/g) || [];
        let coloured = false;
        for (const stop of stops) {
          if (/^rgba?\\(/.test(stop)) {
            const parts = stop.replace(/^rgba?\\(|\\)$/g, '').split(',').map(parseFloat);
            const alpha = parts.length > 3 ? parts[3] : 1;
            if (alpha === 0) continue;
            const spread = Math.max(parts[0], parts[1], parts[2]) - Math.min(parts[0], parts[1], parts[2]);
            if (spread > 12) coloured = true;
          } else if (/^oklab\\(/.test(stop)) {
            // oklab(L a b / alpha): a and b near zero means no chroma.
            const nums = stop.replace(/^oklab\\(|\\)$/g, '').replace('/', ' ').trim().split(/\\s+/).map(parseFloat);
            if (nums.length >= 3 && (Math.abs(nums[1]) > 0.04 || Math.abs(nums[2]) > 0.04)) coloured = true;
          } else {
            coloured = true;
          }
        }
        if (coloured && gradients.length < 10) {
          gradients.push({ el: qaSelectorPath(el), value: bgImage.slice(0, 90) });
        } else if (!coloured && scrims.length < 10) {
          scrims.push({ el: qaSelectorPath(el) });
        }
      }

      // Decorative motion. The contract bans a specific family by name:
      // animate-pulse throbbing dots, and infinite bounce/ping/spin used as
      // decoration. Other infinite animations (the hero film pan, which is
      // gated behind prefers-reduced-motion) are reported, not failed, since
      // the contract explicitly allows one earned signature moment.
      const animName = style.animationName || 'none';
      const infinite = animName !== 'none' && style.animationIterationCount.indexOf('infinite') !== -1;
      const banned =
        /\\banimate-(pulse|ping|bounce|spin)\\b/.test(cls) || /pulse|ping|bounce|spin/i.test(animName);
      if (banned && animations.length < 10) {
        animations.push({ el: qaSelectorPath(el), animation: animName, iterations: style.animationIterationCount });
      } else if (infinite && otherMotion.length < 10) {
        otherMotion.push({ el: qaSelectorPath(el), animation: animName });
      }

      // transition-all.
      // "all" is the INITIAL value of transition-property, so every element
      // with no transition at all reports it. Only a real transition counts,
      // which means a non-zero duration.
      if (style.transitionProperty === 'all' && transitionAll.length < 10) {
        const longest = (style.transitionDuration || '0s')
          .split(',')
          .reduce(function (max, d) { return Math.max(max, parseFloat(d) || 0); }, 0);
        if (longest > 0) {
          transitionAll.push({ el: qaSelectorPath(el), duration: style.transitionDuration });
        }
      }

      // --- shouty all-caps -------------------------------------------------
      // "Uppercase is not a substitute for a shape." A status reading BLOCKED
      // is the same tell as the capsule it usually sits in. text-transform is
      // resolved first, so lowercase source that renders uppercase still counts.
      if (ownText.length > 1) {
        const rendered = style.textTransform === 'uppercase' ? ownText.toUpperCase() : ownText;
        const hasLetters = /[A-Za-z]/.test(rendered);
        const allCaps = hasLetters && rendered === rendered.toUpperCase();
        if (allCaps) {
          const words = rendered.split(' ').filter(function (w) { return /[A-Za-z]/.test(w); });
          const everyWordAnAcronym = words.every(function (w) {
            return ACRONYMS.indexOf(w.replace(/[^A-Za-z]/g, '')) !== -1;
          });
          const statusish = /status|badge|state|\\btag\\b|chip|pill|label/i.test(cls);
          const offends = (words.length > 1 || statusish) && !everyWordAnAcronym;
          if (offends) {
            const entry = {
              selector: qaSelectorPath(el),
              text: rendered.slice(0, 40),
              fontSize: Math.round(parseFloat(style.fontSize)),
              transform: style.textTransform,
            };
            // The mono label tier is the contract's one sanctioned uppercase.
            if (isLabelTier(style)) {
              if (shoutyAllowed.length < 10) shoutyAllowed.push(entry);
            } else if (shouty.length < 12) {
              shouty.push(entry);
            }
          }
        }
      }

      // --- hardcoded hex ---------------------------------------------------
      // All colour comes through the tokens in globals.css.
      const inlineStyle = el.getAttribute('style') || '';
      const hexInStyle = inlineStyle.match(/#[0-9a-fA-F]{3,8}\\b/);
      if (hexInStyle && hardcodedHex.length < 12) {
        hardcodedHex.push({ selector: qaSelectorPath(el), where: 'inline style', value: hexInStyle[0] });
      }
      const arbitrary = cls.match(/[a-z-]+-\\[#[0-9a-fA-F]{3,8}\\]/);
      if (arbitrary && hardcodedHex.length < 12) {
        hardcodedHex.push({ selector: qaSelectorPath(el), where: 'arbitrary class', value: arbitrary[0] });
      }
    }

    // --- page-width cap ----------------------------------------------------
    // Walk the layout spine: the main region and every wrapper that still
    // spans most of it. A px max-width narrower than the viewport on any of
    // them is the centred content well the contract removed.
    const widthCaps = [];
    const spine = [];
    const roots = document.querySelectorAll('main, [role=main], .page-frame, [data-page-frame]');
    for (const root of roots) {
      let node = root;
      let depth = 0;
      while (node && depth < 6) {
        spine.push(node);
        const children = Array.from(node.children).filter(function (c) {
          return qaVisible(c) && c.getBoundingClientRect().width >= node.getBoundingClientRect().width * 0.9;
        });
        if (children.length !== 1) break;
        node = children[0];
        depth++;
      }
    }
    for (const el of new Set(spine)) {
      const style = getComputedStyle(el);
      const max = style.maxWidth;
      if (!max || max === 'none') continue;
      const px = parseFloat(max);
      if (Number.isNaN(px) || max.indexOf('%') !== -1) continue;
      if (px < viewport - 1) {
        widthCaps.push({ el: qaDescribe(el), maxWidth: max, viewport: viewport });
      }
    }

    // --- em dashes in visible copy ----------------------------------------
    const emDashes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const parent = textNode.parentElement;
      if (!parent) continue;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      const value = textNode.nodeValue || '';
      const at = value.indexOf('\\u2014');
      if (at === -1) continue;
      if (!qaVisible(parent)) continue;
      if (emDashes.length < 10) {
        emDashes.push({
          el: qaDescribe(parent),
          text: value.slice(Math.max(0, at - 40), at + 40).replace(/\\s+/g, ' ').trim(),
        });
      }
    }

    return {
      viewport: viewport,
      pills: pills.slice(0, 10),
      pillCount: pills.length,
      widthCaps: widthCaps.slice(0, 6),
      fonts: Array.from(badFonts.values()).slice(0, 6),
      emDashes: emDashes,
      gradients: gradients,
      scrims: scrims,
      animations: animations,
      otherMotion: otherMotion,
      transitionAll: transitionAll,
      shouty: shouty,
      shoutyAllowed: shoutyAllowed,
      hardcodedHex: hardcodedHex,
    };
  })()
`);

/**
 * The literal placeholder person name. "Prospect" as somebody's name is what
 * the junk rows in the database look like, and it reads as a broken product in
 * front of a founder. Column headers and form labels legitimately say
 * "Prospect", so those are excluded rather than reported.
 */
export const CHECK_PLACEHOLDER_NAME = inPage(`
  (() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = (node.nodeValue || '').trim();
      if (value !== 'Prospect' && value !== 'Prospect ') continue;
      const parent = node.parentElement;
      if (!parent || !qaVisible(parent)) continue;
      // A header or a label saying "Prospect" is naming the column, not a person.
      if (parent.closest('thead, th, label, legend, [role=columnheader]')) continue;
      const tag = parent.tagName;
      if (tag === 'LABEL' || tag === 'TH' || tag === 'OPTION') continue;
      hits.push({ el: qaDescribe(parent), context: (parent.parentElement ? parent.parentElement.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 80) });
    }
    return { hits: hits.slice(0, 6), count: hits.length };
  })()
`);
