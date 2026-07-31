window.addEventListener('DOMContentLoaded', () => {
  const spinner  = document.getElementById('spinner');
  const logo     = document.getElementById('logo');
  const content  = document.getElementById('content');
  const tsTextEl = document.getElementById('timestamp-text');

  // Particles
  if (window.particlesJS) {
    particlesJS('particles-js', {
      particles: {
        number: { value: 50, density: { enable: true, value_area: 800 } },
        color: { value: "#38a34a" },
        shape: { type: "circle" },
        opacity: { value: 0.2 },
        size: { value: 3, random: true },
        line_linked: { enable: true, distance: 150, color: "#38a34a", opacity: 0.1, width: 1 },
        move: { enable: true, speed: 2 }
      },
      interactivity: { events: { onhover: { enable: true, mode: "repulse" }, resize: true } },
      retina_detect: true
    });
  }

  // Timestamp
  function updateTimestamp() {
    const now = new Date();
    const brussels = now.toLocaleString('en-GB', {
      timeZone: 'Europe/Brussels',
      year: 'numeric', month: 'long', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    if (tsTextEl) {
      tsTextEl.textContent = `${brussels}`;
    }
  }
  updateTimestamp();
  setInterval(updateTimestamp, 1000);

  // Interactive command explorer
  const tabs = [...document.querySelectorAll('.command-tab')];
  const commandCards = [...document.querySelectorAll('.command-card')];
  const commandSearch = document.getElementById('command-search');
  const commandEmpty = document.getElementById('command-empty');
  let activeFilter = 'all';

  function filterCommands() {
    const query = commandSearch?.value.trim().toLowerCase() || '';
    let visible = 0;
    commandCards.forEach(card => {
      const matchesCategory = activeFilter === 'all' || card.dataset.category === activeFilter;
      const matchesQuery = !query || `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(query);
      card.hidden = !(matchesCategory && matchesQuery);
      if (!card.hidden) visible += 1;
    });
    if (commandEmpty) commandEmpty.hidden = visible !== 0;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    activeFilter = tab.dataset.filter;
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    filterCommands();
  }));
  commandSearch?.addEventListener('input', filterCommands);

  document.querySelectorAll('.command-copy').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.command);
        button.textContent = 'Copied!';
      } catch {
        button.textContent = button.dataset.command;
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 1400);
    });
  });

  // Intro animation
  setTimeout(() => {
    if (spinner) spinner.style.display = 'none';
    if (logo) logo.classList.add('animate-logo');
    if (content) content.classList.add('animate-content');
  }, 900);

  // Smooth scroll for in-page links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const target = document.querySelector(targetId);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
});
