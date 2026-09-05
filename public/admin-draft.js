'use strict';

// Stable Draft-save extension for iDrama.ai Admin.
// No MutationObserver: avoids DOM feedback loops / Page Unresponsive.
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
      if (badge.textContent !== 'DRAFT') badge.textContent = 'DRAFT';
      if (badge.getAttribute('title') !== 'រក្សាទុករួច — រង់ចាំ Upload វីដេអូ') {
        badge.setAttribute('title', 'រក្សាទុករួច — រង់ចាំ Upload វីដេអូ');
      }
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

    /* Large 9:16 poster layout for Admin catalog */
    .admin-page .admin-story-card {
      grid-template-columns: 220px minmax(0,1fr) auto !important;
      gap: 22px !important;
      align-items: start !important;
      padding: 18px !important;
    }
    .admin-page .admin-thumb {
      width: 220px !important;
      min-width: 220px !important;
      aspect-ratio: 9 / 16 !important;
      min-height: 0 !important;
      border-radius: 16px !important;
      overflow: hidden !important;
      background: #0d0b08 !important;
      border: 1px solid rgba(222,169,61,.28) !important;
      box-shadow: 0 14px 34px rgba(0,0,0,.38) !important;
      display: grid !important;
      place-items: center !important;
    }
    .admin-page .admin-thumb img {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      object-fit: cover !important;
      object-position: center !important;
    }
    .admin-page .admin-story-copy {
      padding-top: 4px;
      min-width: 0;
    }
    .admin-page .story-title-line h3 {
      font-size: clamp(21px, 2vw, 28px) !important;
      line-height: 1.35 !important;
    }
    .admin-page .admin-story-copy p {
      font-size: 14px !important;
      line-height: 1.85 !important;
    }

    @media (max-width: 1100px) {
      .admin-page .admin-story-card {
        grid-template-columns: 180px minmax(0,1fr) !important;
      }
      .admin-page .admin-thumb {
        width: 180px !important;
        min-width: 180px !important;
        aspect-ratio: 9 / 16 !important;
      }
      .admin-page .admin-card-actions {
        grid-column: 1 / -1 !important;
        flex-direction: row !important;
      }
    }

    @media (max-width: 680px) {
      .admin-page .admin-story-card {
        grid-template-columns: 1fr !important;
      }
      .admin-page .admin-thumb {
        width: min(100%, 280px) !important;
        min-width: 0 !important;
        aspect-ratio: 9 / 16 !important;
        margin: 0 auto !important;
      }
      .admin-page .admin-card-actions {
        grid-column: auto !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
      }
    }
  `;
  document.head.appendChild(style);

  // Patch renderStories once instead of observing DOM mutations continuously.
  // This keeps DRAFT labels in sync without creating mutation loops.
  if (typeof renderStories === 'function' && !renderStories.__draftStablePatched) {
    const baseRenderStories = renderStories;
    const patchedRenderStories = function (...args) {
      const result = baseRenderStories.apply(this, args);
      applyDraftLabels();
      return result;
    };
    patchedRenderStories.__draftStablePatched = true;
    renderStories = patchedRenderStories;
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
