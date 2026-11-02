// pages / references / index

function formatReferencePageHtml(screen) {
  const rules = screen === 'formatrules';
  return /* HTML */ `<main
    class="hub-page reference-page ${rules ? 'format-rules-page' : 'ban-lists-page'}"
  >
    <section
      id="${rules ? 'fmtRulesBody' : 'banListsBody'}"
      class="reference-list acc-down"
      aria-label="${rules ? 'Format rules' : 'Ban lists'}"
    >
      ${rules ? fmtRulesBodyHtml() : banListsBodyHtml()}
    </section>
  </main>`;
}
