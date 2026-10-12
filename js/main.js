document.addEventListener('DOMContentLoaded', () => {
  const pageIsTool = /\/tools\//.test(window.location.pathname) || window.location.pathname.endsWith('/tools');
  const base = pageIsTool ? '../' : '';
  const nav = document.querySelector('[data-main-nav]');
  const menuButton = document.querySelector('[data-menu-toggle]');
  if (nav) {
    nav.replaceChildren();
    [['Home', `${base}index.html`, 'home'], ['All tools', `${base}tools.html`, 'tools']].forEach(([label, href, key]) => { const link = document.createElement('a'); link.href = href; link.textContent = label; link.dataset.navKey = key; nav.append(link); });
    const menu = document.createElement('details'); menu.className = 'nav-category-menu'; const summary = document.createElement('summary'); summary.textContent = 'Categories'; summary.setAttribute('aria-haspopup', 'true'); menu.append(summary);
    [['PDF tools', 'pdf-tools.html', 'pdf'], ['Image tools', 'image-tools.html', 'image'], ['Document tools', 'document-tools.html', 'document']].forEach(([label, href, key]) => { const link = document.createElement('a'); link.href = `${base}${href}`; link.textContent = label; link.dataset.navKey = key; menu.append(link); }); nav.append(menu);
    const current = window.location.pathname.split('/').pop() || 'index.html'; nav.querySelectorAll('a').forEach(link => { if (link.getAttribute('href').endsWith(current)) link.setAttribute('aria-current', 'page'); }); const category = /pdf-/.test(current) || /merge-pdf|split-pdf|compress-pdf/.test(current) ? 'pdf' : /image|jpg|png|compress-image|crop/.test(current) ? 'image' : /word|excel|csv|powerpoint|txt-to-pdf/.test(current) ? 'document' : ''; if (category) nav.querySelector(`[data-nav-key="${category}"]`)?.setAttribute('aria-current', 'page');
  }
  const closeNavigation = () => {
    if (!nav || !menuButton) return;
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  };
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeNavigation();
    });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target) && !menuButton.contains(event.target)) { closeNavigation(); nav.querySelectorAll('details[open]').forEach(details => { details.open = false; }); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeNavigation();
        nav.querySelectorAll('details[open]').forEach(details => { details.open = false; });
      }
    });
  }
  const iconFor = href => { const name = href.split('/').pop().replace('.html', ''); if (/merge/.test(name)) return 'merge'; if (/split/.test(name)) return 'split'; if (/compress/.test(name)) return 'compress'; if (/crop/.test(name)) return 'crop'; if (/counter/.test(name)) return 'counter'; if (/size/.test(name)) return 'size'; if (/json|base64/.test(name)) return 'code'; if (/url-/.test(name)) return 'link'; if (/excel|csv/.test(name)) return 'spreadsheet'; if (/word|powerpoint|txt/.test(name)) return 'document'; if (/image|jpg|png/.test(name)) return 'image'; return 'pdf'; };
  const categoryFor = href => { const name = href.split('/').pop().replace('.html', ''); if (/pdf|merge|split|compress-pdf/.test(name)) return 'pdf'; if (/image|jpg|png|crop|compress-image/.test(name)) return 'image'; if (/word|excel|csv|powerpoint|txt-to-pdf/.test(name)) return 'document'; return 'utility'; };
  document.querySelectorAll('.tool-icon').forEach(icon => { const card = icon.closest('a'); const href = card ? card.getAttribute('href') : ''; const iconId = iconFor(href); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `${base}images/tool-icons.svg#${iconId}`); svg.append(use); icon.replaceChildren(svg); icon.setAttribute('aria-hidden', 'true'); icon.dataset.toolIcon = iconId; if (card) card.dataset.toolCategory = categoryFor(href); });
  document.querySelectorAll('.tool-card[href*="pdf-to-text.html"], .tool-card[href*="word-counter.html"], .tool-card[href*="txt-to-pdf.html"]').forEach(card => { const use = card.querySelector('.tool-icon use'); if (use) use.setAttribute('href', `${base}images/tool-icons.svg#text`); });
  const search = document.querySelector('[data-tool-search]'); const cards = [...document.querySelectorAll('[data-tool-card]')]; let empty = document.querySelector('[data-empty-state]');
  if (search && cards.length) {
    let activeCategory = 'all';
    const filterBar = document.createElement('div'); filterBar.className = 'tool-filters'; filterBar.setAttribute('aria-label', 'Filter tools by category');
    [['all', 'All tools'], ['pdf', 'PDF'], ['image', 'Images'], ['document', 'Documents'], ['utility', 'Utilities']].forEach(([value, label], index) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'tool-filter'; button.dataset.filter = value; button.textContent = label; button.setAttribute('aria-pressed', String(index === 0)); button.addEventListener('click', () => { activeCategory = value; filterBar.querySelectorAll('.tool-filter').forEach(item => item.setAttribute('aria-pressed', String(item === button))); updateTools(); }); filterBar.append(button); });
    search.closest('.container')?.append(filterBar);
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.dataset.emptyState = '';
      empty.hidden = true;
      empty.textContent = 'No tools match your search. Try another format or category.';
      cards[cards.length - 1].parentElement?.append(empty);
    }
    const updateTools = () => { const query = search.value.trim().toLowerCase(); let visible = 0; cards.forEach(card => { const matchesText = card.textContent.toLowerCase().includes(query); const matchesCategory = activeCategory === 'all' || card.dataset.toolCategory === activeCategory; const show = matchesText && matchesCategory; card.hidden = !show; if (show) visible += 1; }); if (empty) empty.hidden = visible !== 0; };
    search.addEventListener('input', updateTools);
  }
});

