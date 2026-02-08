(() => {
  const isKo = document.documentElement.lang === 'ko';

  const labels = isKo
    ? {
        share: '공유',
        twitter: 'X 공유',
        facebook: 'Facebook 공유',
        more: '더보기',
        copy: '링크 복사',
        copied: '복사됨!',
        shareText: '건강식 하루 메뉴 — 무료 균형 잡힌 식단 추천! 🍽️',
      }
    : {
        share: 'Share',
        twitter: 'Share on X',
        facebook: 'Share on Facebook',
        more: 'More',
        copy: 'Copy Link',
        copied: 'Copied!',
        shareText:
          'Check out Healthy Daily Menu — free balanced meal plans with calorie tracking! 🍽️',
      };

  const pageUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(labels.shareText);

  // SVG icons
  const icons = {
    share:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    close:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    twitter:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    facebook:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'share-wrapper';
  wrapper.innerHTML = `
    <div class="share-panel" aria-hidden="true">
      <button class="share-btn share-btn--twitter" title="${labels.twitter}" data-action="twitter">
        ${icons.twitter}
      </button>
      <button class="share-btn share-btn--facebook" title="${labels.facebook}" data-action="facebook">
        ${icons.facebook}
      </button>
      <button class="share-btn share-btn--more" title="${labels.more}" data-action="more">
        ${icons.more}
      </button>
      <button class="share-btn share-btn--copy" title="${labels.copy}" data-action="copy">
        ${icons.copy}
      </button>
    </div>
    <button class="share-fab" aria-label="${labels.share}">
      <span class="share-fab__icon share-fab__icon--share">${icons.share}</span>
      <span class="share-fab__icon share-fab__icon--close">${icons.close}</span>
    </button>
    <div class="share-toast" aria-live="polite"></div>
  `;

  document.body.appendChild(wrapper);

  // Elements
  const fab = wrapper.querySelector('.share-fab');
  const panel = wrapper.querySelector('.share-panel');
  const toast = wrapper.querySelector('.share-toast');
  let isOpen = false;

  // Toggle panel
  const togglePanel = () => {
    isOpen = !isOpen;
    wrapper.classList.toggle('share-wrapper--open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
  };

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !wrapper.contains(e.target)) {
      isOpen = false;
      wrapper.classList.remove('share-wrapper--open');
      panel.setAttribute('aria-hidden', 'true');
    }
  });

  // Show toast
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('share-toast--visible');
    setTimeout(() => toast.classList.remove('share-toast--visible'), 2000);
  };

  // Handle share actions
  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('.share-btn');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;

    switch (action) {
      case 'twitter':
        window.open(
          `https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}`,
          '_blank',
          'width=550,height=420'
        );
        break;

      case 'facebook':
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`,
          '_blank',
          'width=550,height=420'
        );
        break;

      case 'more':
        if (navigator.share) {
          try {
            await navigator.share({
              title: document.title,
              text: labels.shareText,
              url: window.location.href,
            });
          } catch {
            // User cancelled or error — ignore
          }
        } else {
          // Fallback: copy link
          try {
            await navigator.clipboard.writeText(window.location.href);
            showToast(labels.copied);
          } catch {
            showToast('Error');
          }
        }
        break;

      case 'copy': {
        const copyBtn = btn;
        try {
          await navigator.clipboard.writeText(window.location.href);
          copyBtn.innerHTML = icons.check;
          copyBtn.classList.add('share-btn--copied');
          showToast(labels.copied);
          setTimeout(() => {
            copyBtn.innerHTML = icons.copy;
            copyBtn.classList.remove('share-btn--copied');
          }, 2000);
        } catch {
          showToast('Error');
        }
        break;
      }
    }

    // Close panel after action (except more which may show system dialog)
    if (action !== 'more') {
      setTimeout(() => {
        isOpen = false;
        wrapper.classList.remove('share-wrapper--open');
        panel.setAttribute('aria-hidden', 'true');
      }, 300);
    }
  });

  // Hide "More" button on desktop if Web Share API is not supported
  if (!navigator.share) {
    const moreBtn = panel.querySelector('[data-action="more"]');
    if (moreBtn) moreBtn.style.display = 'none';
  }
})();
