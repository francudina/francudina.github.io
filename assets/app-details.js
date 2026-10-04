// Keep product guides and existing anchors functional under the shared page shell.
(() => {
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    const update = () => backToTop.classList.toggle('visible', window.scrollY > window.innerHeight);
    window.addEventListener('scroll', update, { passive:true });
    update();
    backToTop.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));
  }
  function openChangelog() {
    if (location.hash === '#changelog') {
      const details = document.getElementById('changelogDetails');
      if (details) details.open = true;
    }
  }
  openChangelog();
  window.addEventListener('hashchange', openChangelog);
  document.querySelectorAll('a[href="#changelog"]').forEach(link => {
    link.addEventListener('click', () => {
      const details = document.getElementById('changelogDetails');
      if (details) details.open = true;
    });
  });
  document.querySelectorAll('.section-anchor').forEach(anchor => {
    anchor.addEventListener('click', () => {
      navigator.clipboard?.writeText(location.origin + location.pathname + anchor.getAttribute('href')).then(() => {
        const previous = anchor.textContent;
        anchor.textContent = 'Copied!';
        setTimeout(() => { anchor.textContent = previous; }, 1500);
      }).catch(() => {});
    });
  });
})();
// Existing guide buttons call this function from their original inline handlers.
function copyCode(button) {
  navigator.clipboard?.writeText(button.nextElementSibling.textContent).then(() => {
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('copied'); }, 2000);
  }).catch(() => {});
}
