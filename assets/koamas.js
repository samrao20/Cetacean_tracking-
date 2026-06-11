/* ============================================================
   Koamas — shared UI behaviour
   Loaded by every page (defer). Presentation only — no data
   fetching, no Supabase, no WhatsApp logic lives here.
   Exposes window.Koamas.revealIn(container) for JS-rendered lists.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Mobile nav toggle ─────────────────────────────────── */
  function initNavToggle() {
    var toggle = document.getElementById('nav-toggle');
    var menu   = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ── Scroll-aware sticky header ─────────────────────────── */
  function initScrolledHeader() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var update = function () {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ── Scroll reveal (staggered) ──────────────────────────── */
  var observer = null;
  function getObserver() {
    if (observer || !('IntersectionObserver' in window)) return observer;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    return observer;
  }

  // Observe every .reveal under `root`, applying a gentle stagger by index.
  function revealIn(root) {
    root = root || document;
    var items = root.querySelectorAll ? root.querySelectorAll('.reveal') : [];
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var obs = getObserver();
    items.forEach(function (el, i) {
      if (!el.style.transitionDelay) {
        el.style.transitionDelay = Math.min(i, 12) * 55 + 'ms';
      }
      obs.observe(el);
    });
  }

  function init() {
    initNavToggle();
    initScrolledHeader();
    revealIn(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Koamas = { revealIn: revealIn };
}());
