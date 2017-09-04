/* global installed, handleEvent, tabURL */
'use strict';

window.addEventListener('initPopup:done', function _() {
  window.removeEventListener('initPopup:done', _);

  const writeStyle = $('#write-style');
  const matchTargets = document.createElement('span');
  const matchWrapper = document.createElement('span');
  matchWrapper.id = 'match';
  matchWrapper.appendChild(matchTargets);

  // For this URL
  const urlLink = template.writeStyle.cloneNode(true);
  Object.assign(urlLink, {
    href: 'edit.html?url-prefix=' + encodeURIComponent(tabURL),
    title: `url-prefix("${tabURL}")`,
    textContent: prefs.get('popup.breadcrumbs.usePath')
      ? new URL(tabURL).pathname.slice(1)
      // this&nbsp;URL
      : t('writeStyleForURL').replace(/ /g, '\u00a0'),
    onclick: handleEvent.openLink,
  });
  if (prefs.get('popup.breadcrumbs')) {
    urlLink.onmouseenter =
      urlLink.onfocus = () => urlLink.parentNode.classList.add('url()');
    urlLink.onmouseleave =
      urlLink.onblur = () => urlLink.parentNode.classList.remove('url()');
  }
  matchTargets.appendChild(urlLink);

  // For domain
  const domains = BG.getDomains(tabURL);
  for (const domain of domains) {
    const numParts = domain.length - domain.replace(/\./g, '').length + 1;
    // Don't include TLD
    if (domains.length > 1 && numParts === 1) {
      continue;
    }
    const domainLink = template.writeStyle.cloneNode(true);
    Object.assign(domainLink, {
      href: 'edit.html?domain=' + encodeURIComponent(domain),
      textContent: numParts > 2 ? domain.split('.')[0] : domain,
      title: `domain("${domain}")`,
      onclick: handleEvent.openLink,
    });
    domainLink.setAttribute('subdomain', numParts > 1 ? 'true' : '');
    matchTargets.appendChild(domainLink);
  }

  if (prefs.get('popup.breadcrumbs')) {
    matchTargets.classList.add('breadcrumbs');
    matchTargets.appendChild(matchTargets.removeChild(matchTargets.firstElementChild));
  }
  writeStyle.appendChild(matchWrapper);
});
