(() => {
  'use strict';

  function applyDraftLabels() {
    const root = document.getElementById('adminStories');
    if (!root) return;

    root.querySelectorAll('.story-ready-badge.incomplete').forEach((badge) => {
      badge.textContent = 'DRAFT';
      badge.setAttribute('title', 'រក្សាទុករួច — រង់ចាំ Upload វីដេអូ');
    });

    root.querySelectorAll('.admin-story-card.incomplete').forEach((card) => {
      const tags = card.querySelector('.admin-tags');
      if (tags && !tags.querySelector('.draft-admin-tag')) {
        const tag = document.createElement('span');
        tag.className = 'draft-admin-tag';
        tag.textContent = '📝 DRAFT • រង់ចាំ Upload វីដេអូ';
        tags.prepend(tag);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', applyDraftLabels, { once: true });

  const storiesRoot = document.getElementById('adminStories');
  if (storiesRoot) {
    const observer = new MutationObserver(applyDraftLabels);
    observer.observe(storiesRoot, { childList: true, subtree: true });
  }

  const style = document.createElement('style');
  style.textContent = `
    .story-ready-badge.incomplete {
      color: #f2c96d !important;
      border-color: rgba(226, 169, 55, .46) !important;
      background: rgba(122, 75, 8, .20) !important;
    }
    .draft-admin-tag {
      color: #f1c968 !important;
      border-color: rgba(222, 164, 48, .34) !important;
      background: rgba(87, 54, 7, .22) !important;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
})();
