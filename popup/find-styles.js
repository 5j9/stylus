/* global handleEvent, tabURL */
'use strict';

window.addEventListener('initPopup:done', function _() {
  window.removeEventListener('initPopup:done', _);

  const urlForSearch =
    tabURL.startsWith('file:') ? 'file:' :
    tabURL.startsWith(URLS.ownOrigin) ? 'chrome-extension' : tabURL;
  const urlParts = new URL(tabURL).hostname.toLowerCase()
    .replace(/^www\.|\.[^.]+$/g, '')
    .split('.').reverse();
  const findStylesLink = $('#find-styles-link');
  const sourceSelector = $('#find-styles-source-selector');
  const userstylesLink = $('#find-styles a[href*="userstyles"]');
  const freestylerLink = $('#find-styles a[href*="freestyler"]');

  userstylesLink.href += encodeURIComponent(urlForSearch);
  freestylerLink.href += encodeURIComponent(urlForSearch);

  findStylesLink.onclick = handleEvent.openURLandHide;
  userstylesLink.onclick = freestylerLink.onclick = openAndRemember;
  sourceSelector.onclick = () => {
    const hidden = $('#find-styles-source').classList.toggle('hidden');
    window[`${hidden ? 'remove' : 'add'}EventListener`]('keydown', closeListOnEsc, true);
  };

  if (urlParts.length <= 1) {
    freestylerSetDirectUrl(urlParts[0] || urlForSearch);
  } else {
    freestylerLink.onclick = event => {
      event.preventDefault();
      BG.chromeLocal.getValue('freestyler').then(data => {
        const listIsFresh = data && Date.now() - data.siteListDate < 30 * 24 * 3600e3;
        return listIsFresh ? data : freestylerGetSiteList();
      }).then(({siteList}) => {
        const sites = new Set(siteList);
        sites.add('freestyler');
        freestylerSetDirectUrl(urlParts.find(part => sites.has(part)));
        freestylerOpen();
      });
    };
  }

  prefs.subscribe(['popup.findStylesSource'], renderSource);
  renderSource();
  return;

  function renderSource(key, value = prefs.get('popup.findStylesSource')) {
    const a = $(`#find-styles a[data-pref-value="${value}"]`) || userstylesLink;
    findStylesLink.href = a.href;
    findStylesLink.onclick = a.onclick;
    sourceSelector.src = $('img', a).src;
  }

  function closeListOnEsc(event) {
    if (event.which === 27) {
      event.preventDefault();
      event.stopPropagation();
      sourceSelector.onclick();
    }
  }

  function openAndRemember(event) {
    if (event) {
      event.preventDefault();
    }
    const source = this.dataset.prefValue;
    if (source) {
      prefs.set('popup.findStylesSource', source, {onlyIfChanged: true});
    }
    openURL({url: this.href}).then(window.close);
  }

  function freestylerOpen() {
    openAndRemember.call(freestylerLink);
  }

  function freestylerSetDirectUrl(token) {
    if (token) {
      freestylerLink.href = freestylerLink.dataset.directUrl.replace('%s', token);
      renderSource();
    }
  }

  function freestylerGetSiteList() {
    freestylerLink.dataset.progress = '';
    debounce(freestylerOpen, 2000);
    return download('https://freestyler.ws/list-of-sites').then(text => {
      debounce.unregister(freestylerOpen);
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const data = {
        siteListDate: Date.now(),
        siteList: $$('a', doc)
          .map(a => a.getAttribute('href').match(/\/sites\/(\w+)\/relevance\/|$/)[1])
          .filter(site => site),
      };
      BG.chromeLocal.setValue('freestyler', data);
      return data;
    });
  }
});
