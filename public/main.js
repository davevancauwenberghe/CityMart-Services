window.addEventListener('DOMContentLoaded', () => {
  const spinner = document.getElementById('spinner');
  const logo = document.getElementById('logo');
  const content = document.getElementById('content');
  const tsEl = document.getElementById('timestamp');

  const landingView = document.getElementById('landing-view');
  const privacyView = document.getElementById('privacy-view');
  const showPrivacy = document.getElementById('show-privacy');
  const backToMain = document.getElementById('back-to-main');

  showPrivacy.addEventListener('click', () => {
    landingView.classList.remove('active');
    privacyView.classList.add('active');
  });

  backToMain.addEventListener('click', () => {
    privacyView.classList.remove('active');
    landingView.classList.add('active');
  });

  // Particles config
  if (window.particlesJS) {
    particlesJS('particles-js', {
      "particles": { "number": { "value": 50, "density": { "enable": true, "value_area": 800 } },
        "color": { "value": "#38a34a" },
        "shape": { "type": "circle" },
        "opacity": { "value": 0.2, "random": false },
        "size": { "value": 3, "random": true },
        "line_linked": { "enable": true, "distance": 150, "color": "#38a34a", "opacity": 0.1, "width": 1 },
        "move": { "enable": true, "speed": 2 }
      },
      "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" }, "resize": true } },
      "retina_detect": true
    });
  }

  // Timestamp updater
  function updateTimestamp() {
    const now = new Date();
    const brussels = now.toLocaleString('en-GB', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    tsEl.textContent = `Bot time — ${brussels}`;
  }
  updateTimestamp();
  setInterval(updateTimestamp, 1000);

  // Intro animation
  setTimeout(() => {
    spinner.style.display = 'none';
    logo.classList.add('animate-logo');
    content.classList.add('animate-content');
  }, 2000);
});
