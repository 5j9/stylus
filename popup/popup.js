/* global pingTabContent getTabRealURLFirefox detectSloppyRegexps */
'use strict';

let installed;
let tabURL;
const handleEvent = {};

const ENTRY_ID_PREFIX_RAW = 'style-';
const ENTRY_ID_PREFIX = '#' + ENTRY_ID_PREFIX_RAW;

getActiveTab().then(tab =>
  (FIREFOX && tab.url === 'about:blank' && tab.status === 'loading'
    ? getTabRealURLFirefox(tab)
    : getTabRealURL(tab))
  .then(url => {
    tabURL = URLS.supported(url) ? url : '';
    if (tabURL) {
      pingTabContent(tab);
    }
  })
).then(() =>
  Promise.all([
    tabURL && getStylesSafe({matchUrl: tabURL}),
    onDOMready().then(initPopup),
  ])
).then(([styles]) => {
  showStyles(styles);
});

chrome.runtime.onMessage.addListener(onRuntimeMessage);

function onRuntimeMessage(msg) {
  switch (msg.method) {
    case 'styleAdded':
    case 'styleUpdated':
      // notifyAllTabs sets msg.style's code to null so we have to get the actual style
      // because we analyze its code in detectSloppyRegexps
      handleUpdate(BG.cachedStyles.byId.get(msg.style.id));
      break;
    case 'styleDeleted':
      handleDelete(msg.id);
      break;
    case 'prefChanged':
      if ('popup.stylesFirst' in msg.prefs) {
        const stylesFirst = msg.prefs['popup.stylesFirst'];
        const actions = $('body > .actions');
        const before = stylesFirst ? actions : actions.nextSibling;
        document.body.insertBefore(installed, before);
      } else if ('popupWidth' in msg.prefs) {
        setPopupWidth(msg.prefs.popupWidth);
      }
      break;
  }
}


function setPopupWidth(width = prefs.get('popupWidth')) {
  document.body.style.width =
    Math.max(200, Math.min(800, width)) + 'px';
}


function initPopup() {
  installed = $('#installed');

  setPopupWidth();

  // force Chrome to resize the popup
  if (!FIREFOX) {
    document.body.style.height = '10px';
    document.documentElement.style.height = '10px';
  }

  // action buttons
  $('#disableAll').onchange = function () {
    installed.classList.toggle('disabled', this.checked);
  };
  setupLivePrefs();

  Object.assign($('#popup-manage-button'), {
    onclick: handleEvent.openManager,
    onmouseup: handleEvent.openManager,
    oncontextmenu: handleEvent.openManager,
  });

  $('#popup-options-button').onclick = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  const shortcutsButton = $('#popup-shortcuts-button');
  shortcutsButton.dataset.href = URLS.configureCommands;
  shortcutsButton.onclick = handleEvent.openURLandHide;

  if (!prefs.get('popup.stylesFirst')) {
    document.body.insertBefore(
      $('body > .actions'),
      installed);
  }

  if (!tabURL) {
    document.body.classList.add('blocked');
    document.body.insertBefore(template.unavailableInfo, document.body.firstChild);
    return;
  }

  window.dispatchEvent(new CustomEvent('initPopup:done'));
}


function showStyles(styles) {
  if (!styles) {
    return;
  }
  if (!styles.length) {
    installed.textContent = '';
    installed.appendChild(template.noStyles.cloneNode(true));
    return;
  }

  const enabledFirst = prefs.get('popup.enabledFirst');
  styles.sort((a, b) => (
    enabledFirst && a.enabled !== b.enabled
      ? !(a.enabled < b.enabled) ? -1 : 1
      : a.name.localeCompare(b.name)
  ));

  let postponeDetect = false;
  const t0 = performance.now();
  const container = document.createDocumentFragment();
  for (const style of styles) {
    createStyleElement({style, container, postponeDetect});
    postponeDetect = postponeDetect || performance.now() - t0 > 100;
  }
  installed.appendChild(container);

  getStylesSafe({matchUrl: tabURL, strictRegexp: false})
    .then(unscreenedStyles => {
      for (const unscreened of unscreenedStyles) {
        if (!styles.includes(unscreened)) {
          postponeDetect = postponeDetect || performance.now() - t0 > 100;
          createStyleElement({
            style: Object.assign({appliedSections: [], postponeDetect}, unscreened),
          });
        }
      }
    });
}


function createStyleElement({
  style,
  container = installed,
  postponeDetect,
}) {
  const entry = template.style.cloneNode(true);
  entry.setAttribute('style-id', style.id);
  Object.assign(entry, {
    id: ENTRY_ID_PREFIX_RAW + style.id,
    styleId: style.id,
    className: entry.className + ' ' + (style.enabled ? 'enabled' : 'disabled'),
    onmousedown: handleEvent.maybeEdit,
  });

  const checkbox = $('.checker', entry);
  Object.assign(checkbox, {
    id: ENTRY_ID_PREFIX_RAW + style.id,
    checked: style.enabled,
    onclick: handleEvent.toggle,
  });

  const editLink = $('.style-edit-link', entry);
  Object.assign(editLink, {
    href: editLink.getAttribute('href') + style.id,
    onclick: handleEvent.openLink,
  });

  const styleName = $('.style-name', entry);
  Object.assign(styleName, {
    htmlFor: ENTRY_ID_PREFIX_RAW + style.id,
    onclick: handleEvent.name,
  });
  styleName.checkbox = checkbox;
  styleName.appendChild(document.createTextNode(style.name));

  $('.enable', entry).onclick = handleEvent.toggle;
  $('.disable', entry).onclick = handleEvent.toggle;
  $('.delete', entry).onclick = handleEvent.delete;

  invokeOrPostpone(!postponeDetect, detectSloppyRegexps, {entry, style});

  const oldElement = $(ENTRY_ID_PREFIX + style.id);
  if (oldElement) {
    oldElement.parentNode.replaceChild(entry, oldElement);
  } else {
    container.appendChild(entry);
  }
}


Object.assign(handleEvent, {

  getClickedStyleId(event) {
    return (handleEvent.getClickedStyleElement(event) || {}).styleId;
  },

  getClickedStyleElement(event) {
    return event.target.closest('.entry');
  },

  name(event) {
    this.checkbox.click();
    event.preventDefault();
  },

  toggle(event) {
    saveStyleSafe({
      id: handleEvent.getClickedStyleId(event),
      enabled: this.type === 'checkbox' ? this.checked : this.matches('.enable'),
    });
  },

  delete(event) {
    const id = handleEvent.getClickedStyleId(event);
    const box = $('#confirm');
    box.dataset.display = true;
    box.style.cssText = '';
    $('b', box).textContent = (BG.cachedStyles.byId.get(id) || {}).name;
    $('[data-cmd="ok"]', box).onclick = () => confirm(true);
    $('[data-cmd="cancel"]', box).onclick = () => confirm(false);
    window.onkeydown = event => {
      const keyCode = event.keyCode || event.which;
      if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      && (keyCode === 13 || keyCode === 27)) {
        event.preventDefault();
        confirm(keyCode === 13);
      }
    };
    function confirm(ok) {
      window.onkeydown = null;
      animateElement(box, {
        className: 'lights-on',
        onComplete: () => (box.dataset.display = false),
      });
      if (ok) {
        deleteStyleSafe({id}).then(() => {
          // don't wait for the async notifyAllTabs as we check the children right away
          handleDelete(id);
          // update view with 'No styles installed for this site' message
          if (!installed.children.length) {
            showStyles([]);
          }
        });
      }
    }
  },

  indicator(event) {
    const entry = handleEvent.getClickedStyleElement(event);
    const info = template.regexpProblemExplanation.cloneNode(true);
    $$('#' + info.id).forEach(el => el.remove());
    $$('a', info).forEach(el => (el.onclick = handleEvent.openURLandHide));
    $$('button', info).forEach(el => (el.onclick = handleEvent.closeExplanation));
    entry.appendChild(info);
  },

  closeExplanation() {
    $('#regexp-explanation').remove();
  },

  openLink(event) {
    if (!prefs.get('openEditInWindow', false)) {
      handleEvent.openURLandHide.call(this, event);
      return;
    }
    event.preventDefault();
    chrome.windows.create(
      Object.assign({
        url: this.href
      }, prefs.get('windowPosition', {}))
    );
    close();
  },

  maybeEdit(event) {
    if (!(
      event.button === 0 && (event.ctrlKey || event.metaKey) ||
      event.button === 1 ||
      event.button === 2)) {
      return;
    }
    // open an editor on middleclick
    if (event.target.matches('.entry, .style-name, .style-edit-link')) {
      this.onmouseup = () => $('.style-edit-link', this).click();
      this.oncontextmenu = event => event.preventDefault();
      event.preventDefault();
      return;
    }
    // prevent the popup being opened in a background tab
    // when an irrelevant link was accidentally clicked
    if (event.target.closest('a')) {
      event.preventDefault();
      return;
    }
  },

  openURLandHide(event) {
    event.preventDefault();
    openURL({url: this.href || this.dataset.href})
      .then(window.close);
  },

  openManager(event) {
    event.preventDefault();
    if (!this.eventHandled) {
      this.eventHandled = true;
      this.dataset.href += event.shiftKey || event.button === 2 ?
        '?url=' + encodeURIComponent(tabURL) : '';
      handleEvent.openURLandHide.call(this, event);
    }
  },
});


function handleUpdate(style) {
  if ($(ENTRY_ID_PREFIX + style.id)) {
    createStyleElement({style});
    return;
  }
  // Add an entry when a new style for the current url is installed
  if (tabURL && BG.getApplicableSections({style, matchUrl: tabURL, stopOnFirst: true}).length) {
    document.body.classList.remove('blocked');
    $$('.blocked-info, #no-styles').forEach(el => el.remove());
    createStyleElement({style});
  }
}


function handleDelete(id) {
  $$(ENTRY_ID_PREFIX + id).forEach(el => el.remove());
}
