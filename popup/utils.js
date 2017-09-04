/* global handleEvent, tabURL */
'use strict';

/*
  According to CSS4 @document specification the entire URL must match.
  Stylish-for-Chrome implemented it incorrectly since the very beginning.
  We'll detect styles that abuse the bug by finding the sections that
  would have been applied by Stylish but not by us as we follow the spec.
  Additionally we'll check for invalid regexps.
*/
function detectSloppyRegexps({entry, style}) {
  // make sure all regexps are compiled
  const rxCache = BG.cachedStyles.regexps;
  let hasRegExp = false;
  for (const section of style.sections) {
    for (const regexp of section.regexps) {
      hasRegExp = true;
      for (let pass = 1; pass <= 2; pass++) {
        const cacheKey = pass === 1 ? regexp : BG.SLOPPY_REGEXP_PREFIX + regexp;
        if (!rxCache.has(cacheKey)) {
          // according to CSS4 @document specification the entire URL must match
          const anchored = pass === 1 ? '^(?:' + regexp + ')$' : '^' + regexp + '$';
          // create in the bg context to avoid leaking of "dead objects"
          const rx = BG.tryRegExp(anchored);
          rxCache.set(cacheKey, rx || false);
        }
      }
    }
  }
  if (!hasRegExp) {
    return;
  }
  const {
    appliedSections =
      BG.getApplicableSections({style, matchUrl: tabURL}),
    wannabeSections =
      BG.getApplicableSections({style, matchUrl: tabURL, strictRegexp: false}),
  } = style;

  entry.hasInvalidRegexps = wannabeSections.some(section =>
    section.regexps.some(rx => !rxCache.has(rx)));
  entry.sectionsSkipped = wannabeSections.length - appliedSections.length;

  if (!appliedSections.length) {
    entry.classList.add('not-applied');
    $('.style-name', entry).title = t('styleNotAppliedRegexpProblemTooltip');
  }
  if (entry.sectionsSkipped || entry.hasInvalidRegexps) {
    entry.classList.toggle('regexp-partial', entry.sectionsSkipped);
    entry.classList.toggle('regexp-invalid', entry.hasInvalidRegexps);
    const indicator = template.regexpProblemIndicator.cloneNode(true);
    indicator.appendChild(document.createTextNode(entry.sectionsSkipped || '!'));
    indicator.onclick = handleEvent.indicator;
    $('.main-controls', entry).appendChild(indicator);
  }
}


function getTabRealURLFirefox(tab) {
  // wait for FF tab-on-demand to get a real URL (initially about:blank), 5 sec max
  return new Promise(resolve => {
    function onNavigation({tabId, url, frameId}) {
      if (tabId === tab.id && frameId === 0) {
        detach();
        resolve(url);
      }
    }

    function detach(timedOut) {
      if (timedOut) {
        resolve(tab.url);
      } else {
        debounce.unregister(detach);
      }
      chrome.webNavigation.onBeforeNavigate.removeListener(onNavigation);
      chrome.webNavigation.onCommitted.removeListener(onNavigation);
      chrome.tabs.onRemoved.removeListener(detach);
      chrome.tabs.onReplaced.removeListener(detach);
    }

    chrome.webNavigation.onBeforeNavigate.addListener(onNavigation);
    chrome.webNavigation.onCommitted.addListener(onNavigation);
    chrome.tabs.onRemoved.addListener(detach);
    chrome.tabs.onReplaced.addListener(detach);
    debounce(detach, 5000, {timedOut: true});
  });
}


function pingTabContent(tab, retryCountdown = 10) {
  chrome.tabs.sendMessage(tab.id, {method: 'ping'}, {frameId: 0}, pong => {
    if (pong) {
      return;
    }
    ignoreChromeError();
    // FF and some Chrome forks (e.g. CentBrowser) implement tab-on-demand
    // so we'll wait a bit to handle popup being invoked right after switching
    if (
      retryCountdown > 0 && (
        tab.status !== 'complete' ||
        FIREFOX && tab.url === 'about:blank'
      )
    ) {
      setTimeout(pingTabContent, 100, tab, --retryCountdown);
    } else {
      document.body.classList.add('unreachable');
      document.body.insertBefore(template.unreachableInfo, document.body.firstChild);
    }
  });
}
