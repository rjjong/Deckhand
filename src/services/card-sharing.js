// services / card-sharing

/* ---- Sharing a card ----
   The system share sheet does the heavy lifting. Image share fetches the
   card art (Scryfall's CDN allows cross-origin reads) and hands it over as
   a file; devices without file-share fall back to sharing the image URL,
   and without any Web Share the link path copies to the clipboard. */
async function shareCardImage(card) {
  try {
    const url = cardImageLarge(card) || cardImage(card);
    if (!url) {
      toast(trS('No image to share.'));
      return;
    }
    const resp = await fetch(url);
    const blob = await resp.blob();
    const fname = (card.name || 'card').replace(/[^\w\- ]+/g, '').trim() || 'card';
    const file = new File([blob], fname + '.jpg', { type: blob.type || 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: card.name });
    } else if (navigator.share) {
      await navigator.share({ title: card.name, url });
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') toast(trS('Sharing failed.'));
  }
}

function shareCardLink(card) {
  const text = `${card.name} — Deckhand`;
  const url = `${location.origin}${location.pathname}?card=${encodeURIComponent(card.name)}`;
  if (navigator.share) {
    navigator.share({ title: card.name, text, url }).catch(() => {});
  } else {
    try {
      navigator.clipboard.writeText(`${text} ${url}`);
      toast(trS('Link copied.'));
    } catch (e) {}
  }
}
