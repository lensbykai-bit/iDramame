'use strict';

// Draft-save extension for iDrama.ai Admin.
// Allows Cover/Trailer first, then Full Movie/Episodes later.
(() => {
  const form = document.getElementById('storyForm');
  if (!form) return;

  const q = (sel) => document.querySelector(sel);
  const hasExistingMovie = () => Boolean(
    q('#fullFile')?.files?.[0] ||
    q('#fullFileId')?.value?.trim() ||
    q('#fullLegacyUrl')?.value?.trim()
  );

  const episodeHasMedia = (ep) => Boolean(ep?.file || ep?.fileId || ep?.url);
  const seriesHasAnyMedia = () => Array.isArray(episodeDraft) && episodeDraft.some(episodeHasMedia);
  const seriesHasIncompleteRows = () => Array.isArray(episodeDraft) && episodeDraft.some(ep => !episodeHasMedia(ep));

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

  const style = document.createElement('style');
  style.textContent = `
    .story-ready-badge.incomplete {
      color:#f2c96d !important;
      border-color:rgba(226,169,55,.46) !important;
      background:rgba(122,75,8,.20) !important;
    }
    .draft-admin-tag {
      color:#f1c968 !important;
      border-color:rgba(222,164,48,.34) !important;
      background:rgba(87,54,7,.22) !important;
      font-weight:700;
    }
  `;
  document.head.appendChild(style);

  const storiesRoot = document.getElementById('adminStories');
  if (storiesRoot) {
    const observer = new MutationObserver(applyDraftLabels);
    observer.observe(storiesRoot, { childList: true, subtree: true });
  }
  applyDraftLabels();

  async function saveFlexibleDraft(event) {
    const type = currentContentType();

    // Normal complete Movie can continue through the original admin.js handler.
    // Series with every row complete can also use the original handler.
    const needsDraftHandler = type === 'movie'
      ? !hasExistingMovie()
      : (!seriesHasAnyMedia() || seriesHasIncompleteRows());

    if (!needsDraftHandler) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const btn = event.submitter || q('#saveBtn');
    if (btn) btn.disabled = true;
    showStatus(q('#formStatus'), '⏳ កំពុង Upload រូប/Trailer និងរក្សាទុក DRAFT…');

    try {
      const title = String(q('#title')?.value || '').trim();
      const usdPrice = Number(q('#price')?.value);
      if (!title) throw new Error('សូមបញ្ចូលចំណងជើងរឿង។');
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) throw new Error('សូមបញ្ចូលតម្លៃ USD ដែលធំជាង $0.00។');

      let coverFileId = String(q('#coverFileId')?.value || '').trim();
      let trailerFileId = String(q('#trailerFileId')?.value || '').trim();
      let fullFileId = String(q('#fullFileId')?.value || '').trim();

      coverFileId = await uploadMedia('cover', 'coverFile', coverFileId);
      q('#coverFileId').value = coverFileId;
      trailerFileId = await uploadMedia('trailer', 'trailerFile', trailerFileId);
      q('#trailerFileId').value = trailerFileId;

      const episodes = [];
      if (type === 'series' && Array.isArray(episodeDraft)) {
        for (let i = 0; i < episodeDraft.length; i++) {
          const ep = episodeDraft[i];
          const epTitle = String(ep.title || '').trim() || `ភាគ ${i + 1}`;
          let fileId = String(ep.fileId || '').trim();
          const status = q(`[data-episode-status="${CSS.escape(ep.key)}"]`);

          if (ep.file) {
            if (status) {
              status.textContent = `⏳ កំពុង Upload ${ep.file.name}…`;
              status.classList.remove('ready');
            }
            fileId = await uploadFile('episode', ep.file);
            ep.fileId = fileId;
            ep.file = null;
            if (status) {
              status.textContent = '✅ Upload រួច';
              status.classList.add('ready');
            }
          }

          episodes.push({
            id: String(ep.id || `ep-${String(i + 1).padStart(2, '0')}`),
            title: epTitle,
            file_id: fileId,
            url: String(ep.url || '').trim()
          });
        }
      }

      const body = {
        id: String(q('#storyId')?.value || '').trim(),
        placement: 'web',
        content_type: type,
        title,
        preview: String(q('#preview')?.value || '').trim(),
        price_khr: Math.round(usdPrice * 100) / 100,
        cover_file_id: coverFileId,
        preview_video_file_id: trailerFileId,
        full_video_file_id: type === 'movie' ? fullFileId : '',
        episodes,
        cover_url: String(q('#coverLegacyUrl')?.value || '').trim(),
        preview_video_url: String(q('#trailerLegacyUrl')?.value || '').trim(),
        full_video_url: type === 'movie' ? String(q('#fullLegacyUrl')?.value || '').trim() : '',
        telegram_url: ''
      };

      const saved = await api('/api/admin/stories', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      const data = await api('/api/admin/stories');
      stories = data.stories || [];
      renderStories();
      applyDraftLabels();

      if (saved.persistedToGitHub === false) {
        showStatus(q('#formStatus'), '⚠️ DRAFT រក្សាទុកលើ Server ប៉ុណ្ណោះ។ សូមពិនិត្យ GITHUB_TOKEN។', 'error');
      } else {
        showStatus(
          q('#formStatus'),
          `✅ DRAFT បានរក្សាទុក។ អ្នកអាចចុច ✏️ កែ ហើយ Upload ${type === 'series' ? 'Episodes' : 'Full Movie'} តាមក្រោយបាន។`,
          'success'
        );
      }

      if (saved.persistedToGitHub !== false) setTimeout(resetForm, 1300);
    } catch (err) {
      showStatus(q('#formStatus'), err.message || 'មិនអាចរក្សាទុក DRAFT បាន។', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  form.addEventListener('submit', saveFlexibleDraft, true);
})();
