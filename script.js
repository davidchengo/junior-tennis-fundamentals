// ── Nav scroll effect ──
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 10
    ? '0 2px 20px rgba(0,0,0,0.5)'
    : 'none';
});

// ── Mobile nav toggle ──
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');
navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  navToggle.textContent = navLinks.classList.contains('open') ? '✕' : '☰';
});
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.textContent = '☰';
  });
});

// ── Technique tabs ──
const tabBtns     = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');
  });
});

// ── Checklist level tabs ──
const levelTabBtns     = document.querySelectorAll('.level-tab-btn');
const levelTabContents = document.querySelectorAll('.level-tab-content');
const allLevelIds = ['jc', 'l7', 'l6', 'l5', 'l4', 'l3', 'l2', 'l1'];
let activeLevelId = 'jc';

function updateProgress(levelId) {
  const panel = document.getElementById('checklist-' + levelId);
  if (!panel) return;
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
  const checked = [...checkboxes].filter(cb => cb.checked).length;
  const total = checkboxes.length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = checked + ' / ' + total;
}

function initChecklist(levelId) {
  const panel = document.getElementById('checklist-' + levelId);
  if (!panel) return;
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const saved = localStorage.getItem('jt_' + cb.dataset.key);
    if (saved === 'true') cb.checked = true;
    cb.addEventListener('change', () => {
      localStorage.setItem('jt_' + cb.dataset.key, cb.checked);
      updateProgress(levelId);
    });
  });
}

levelTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeLevelId = btn.dataset.level;
    levelTabBtns.forEach(b => b.classList.remove('active'));
    levelTabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('checklist-' + activeLevelId).classList.add('active');
    updateProgress(activeLevelId);
  });
});

allLevelIds.forEach(initChecklist);
updateProgress(activeLevelId);

// ── Reset button (current level only) ──
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset checklist progress for this level?')) return;
  const panel = document.getElementById('checklist-' + activeLevelId);
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    localStorage.removeItem('jt_' + cb.dataset.key);
  });
  updateProgress(activeLevelId);
});

// ── Smooth-scroll active nav link highlight ──
const sections   = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav-links a');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navAnchors.forEach(a => {
        a.style.color = a.getAttribute('href') === '#' + entry.target.id
          ? 'var(--green-light)'
          : '';
      });
    }
  });
}, { threshold: 0.3, rootMargin: '-60px 0px -60px 0px' });

sections.forEach(s => observer.observe(s));

// ── YouTube click-to-play ──
document.querySelectorAll('.yt-player').forEach(player => {
  const activate = () => {
    const id = player.dataset.videoId;
    const origin = encodeURIComponent(location.origin || 'https://davidchengo.github.io/junior-tennis-fundamentals');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&origin=${origin}`;
    iframe.title = player.getAttribute('aria-label') || 'YouTube video player';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('allowfullscreen', '');
    player.innerHTML = '';
    player.appendChild(iframe);
    player.style.cursor = 'default';
  };
  player.addEventListener('click', activate);
  player.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
});

// ── Animate cards on scroll ──
const cards = document.querySelectorAll('.level-card, .fw-card, .mental-card');
const cardObserver = new IntersectionObserver(entries => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.style.animation = `fadeIn 0.5s ease ${i * 0.06}s both`;
      cardObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

cards.forEach(c => {
  c.style.opacity = '0';
  cardObserver.observe(c);
});
