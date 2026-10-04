const figure = document.querySelector('[data-app-carousel]');

if (figure) {
  const stage = figure.querySelector('.software-hero-stage');
  const original = figure.querySelector('.hero-watch-set');
  const toggle = figure.querySelector('.hero-carousel-toggle');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const initial = [...original.querySelectorAll('img')];
  // Use the gallery as the source so every Garmin app joins the same orbit.
  const gallery = [...document.querySelectorAll('.app-gallery-card .app-watch-main')];
  const sources = [...initial, ...gallery].filter((image, index, all) =>
    all.findIndex(other => other.getAttribute('src') === image.getAttribute('src')) === index
  );
  const orbit = document.createElement('div');
  orbit.className = 'hero-watch-orbit';
  orbit.setAttribute('aria-hidden', 'true');
  const images = sources.map(source => {
    const image = source.cloneNode();
    image.removeAttribute('class');
    image.removeAttribute('loading');
    image.removeAttribute('fetchpriority');
    image.alt = '';
    return image;
  });
  let phase = 0;
  let frame;
  let previousTime;
  let ready = false;
  let paused = motion.matches;
  let visible = true;
  let suspended = false;
  let radiusX = 0;
  let radiusY = 0;
  const fullTurn = Math.PI * 2;
  const spacing = fullTurn / images.length;
  const radiansPerSecond = spacing / 3.2;

  function paint() {
    images.forEach((image, index) => {
      // The front watch moves left and down while the next approaches from the right.
      const rawAngle = (1 - index) * spacing + phase;
      const angle = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
      const depth = Math.max(0, Math.cos(angle));
      const scale = 0.42 + 0.58 * depth ** 4;
      const x = -Math.sin(angle) * radiusX;
      const y = (1 - Math.cos(angle)) * radiusY;
      const opacity = Math.max(0, Math.min(1, (1.03 - Math.abs(angle)) / 0.35));
      image.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      image.style.opacity = opacity.toFixed(3);
      image.style.zIndex = String(Math.round(depth * 100));
    });
  }

  function resize() {
    radiusX = stage.clientWidth * 0.53;
    radiusY = stage.clientHeight * 0.19;
    paint();
  }

  function canRotate() {
    return ready && !paused && visible && !document.hidden && !suspended;
  }

  function animate(time) {
    if (!canRotate()) { frame = undefined; previousTime = undefined; return; }
    // Bound elapsed time to prevent jumps after a stalled or backgrounded frame.
    if (previousTime !== undefined) {
      phase = (phase + Math.min((time - previousTime) / 1000, 0.05) * radiansPerSecond) % fullTurn;
    }
    previousTime = time;
    paint();
    frame = requestAnimationFrame(animate);
  }

  function updatePlayback() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previousTime = undefined;
    if (canRotate()) frame = requestAnimationFrame(animate);
  }

  function renderToggle() {
    toggle.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} app previews`);
    toggle.querySelector('path').setAttribute('d', paused ? 'm9 5 10 7-10 7Z' : 'M9 6v12M15 6v12');
  }
  toggle.addEventListener('click', () => { paused = !paused; renderToggle(); updatePlayback(); });
  motion.addEventListener('change', () => { paused = motion.matches; renderToggle(); updatePlayback(); });
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('pagehide', () => { suspended = true; updatePlayback(); });
  window.addEventListener('pageshow', () => { suspended = false; updatePlayback(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updatePlayback(); });
    observer.observe(stage);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  // Keep the original composition visible until the orbit images have decoded.
  Promise.allSettled(images.map(image => image.decode())).then(results => {
    if (results.some(result => result.status === 'rejected')) return;
    orbit.append(...images);
    stage.append(orbit);
    stage.classList.add('hero-carousel-ready');
    original.setAttribute('aria-hidden', 'true');
    ready = true;
    resize();
    toggle.hidden = false;
    renderToggle();
    updatePlayback();
  });
}
