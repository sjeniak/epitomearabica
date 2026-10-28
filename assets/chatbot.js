/**
 * Epitome — on-page chat widget (self-mounting).
 * Vanilla JavaScript, no dependencies, no build step.
 * Builds its own DOM and appends it to document.body.
 * Pairs with assets/chatbot.css (loaded before this script).
 *
 * Only same-origin requests are made: token.php (CSRF) and lead.php (subscribe).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'epitome-chat';

  var QUICK_REPLIES = [
    'Our origin',
    'The coffee',
    'How to buy',
    'Wholesale',
    'Brew guide',
    'Talk to a human'
  ];

  // Ordered by priority: first match wins.
  var INTENTS = [
    { id: 'greeting',  re: /\b(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings|howdy|namaste|ayubowan)\b/i },
    { id: 'thanks',    re: /\b(thanks|thank\s+you|thank|cheers|appreciate(d)?|much\s+obliged|ta)\b/i },
    { id: 'wholesale', re: /\b(wholesale|trade|hospitality|caf[eé]|hotel(s)?|restaurant(s)?|business|stockist|reseller|distributor|b2b|venue)\b/i },
    { id: 'brew',      re: /\b(brew(ing)?|recipe|how\s+to\s+(make|prepare|brew)|pour[-\s]?over|pourover|espresso|french\s+press|moka|cold\s+brew|grind|water|bloom|steep|extract(ion)?|ratio|dose)\b/i },
    { id: 'origin',    re: /\b(origin|story|where|grown|grow(s)?|growing|highland(s)?|sri\s+lanka|ceylon|kandyan|altitude|history|heritage|revival|tea|island|terroir|farm(ing)?|estate|region|place)\b/i },
    { id: 'buy',       re: /\b(buy|buying|order|price(s)?|cost|stock|shipping|ship(s)?|deliver(y)?|reserve|reservation|purchase|purchasing|notify|notification|subscribe|subscription|wait[-\s]?list|waiting\s+list|available|how\s+much|payment|pay|worldwide)\b/i },
    { id: 'coffee',    re: /\b(coffee|taste|tasting|roast(ed)?|notes?|arabica|flavo(u)?r|profile|medium|chocolate|vanilla|stone\s+fruit|acidity|body|bean(s)?|cup|single[-\s]?origin|premium|epitome)\b/i },
    { id: 'human',     re: /\b(human|contact|email|support|talk|speak|person|reach|someone|representative|agent|help|assist|write\s+to)\b/i }
  ];

  var RESPONSES = {
    greeting: 'Welcome to the house. Ask about our origin, the cup, or how to reserve a bag.',
    origin: 'Epitome grows in Sri Lanka\u2019s central highlands, 1,200 to 1,800 metres, shade-grown in biodiverse Kandyan gardens \u2014 coffee beside pepper, clove, and nutmeg. An island known for tea; a rarer cup from its hills.',
    coffee: 'Epitome is a 500 g bag of whole bean, medium roast, single-origin Ceylon Arabica. Expect dark chocolate, vanilla, and stone fruit, with moderate acidity and a silky body. It holds for pour-over and espresso alike.',
    buy: 'There is no warehouse stock. Reserve a bag and the house confirms by email within a day, then roasts and ships worldwide. Price is coming soon.',
    brew: 'For pour-over: 18 g freshly ground, water at 93 \u00b0C, a 50 ml bloom for 35 seconds, then a slow spiral to about 300 ml. Epitome also suits espresso, French press, moka, and cold brew.',
    wholesale: 'Wholesale and hospitality are welcome. See the wholesale section on this page, and the house will be in touch.',
    human: 'Write to the house at support@epitomearabica.com. A person will answer.',
    thanks: 'Our pleasure. The house is here when you want the next cup.',
    fallback: 'I am not certain on that. Ask about our origin, the coffee, or how to reserve \u2014 or speak to a person.'
  };

  var ACTIONS = {
    buy: [
      { label: 'Reserve a bag', anchor: '#reserve' },
      { label: 'Join the Reserve List', anchor: '#subscribe' }
    ],
    wholesale: [
      { label: 'Wholesale & hospitality', anchor: '#wholesale' }
    ],
    human: [
      { label: 'Email the house', href: 'mailto:support@epitomearabica.com' }
    ]
  };

  var launcher, panel, log, composer, composerInput, closeBtn, quickRow,
      leadForm, leadInput, leadBtn, leadNote;

  var messages = [];
  var reducedMotion = false;
  try {
    reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {}

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function build() {
    launcher = make('button', 'epi-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open the house chat');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'epi-panel');

    var glyph = make('span', 'epi-glyph', 'E');
    var dot = make('span', 'epi-dot');
    dot.setAttribute('aria-hidden', 'true');
    launcher.appendChild(glyph);
    launcher.appendChild(dot);

    panel = make('section', 'epi-panel');
    panel.id = 'epi-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-labelledby', 'epi-title');

    // Header
    var head = make('header', 'epi-head');
    var headCopy = make('div', 'epi-head-copy');
    var kicker = make('p', 'epi-kicker', 'Epitome');
    var title = make('h2', 'epi-title', 'The house answers');
    title.id = 'epi-title';
    headCopy.appendChild(kicker);
    headCopy.appendChild(title);

    closeBtn = make('button', 'epi-close', '\u00d7');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close the chat');

    head.appendChild(headCopy);
    head.appendChild(closeBtn);

    // Message log (polite live region)
    log = make('div', 'epi-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions');

    // Inline lead capture
    leadForm = make('form', 'epi-lead');
    leadForm.setAttribute('novalidate', '');
    leadForm.hidden = true;
    leadForm.setAttribute('aria-label', 'Join the reserve list');

    var leadLabel = make('label', 'epi-lead-label', 'Leave your email and the house will write first.');
    leadLabel.setAttribute('for', 'epi-email');

    var leadRow = make('div', 'epi-lead-row');

    leadInput = make('input');
    leadInput.type = 'email';
    leadInput.id = 'epi-email';
    leadInput.name = 'email';
    leadInput.setAttribute('autocomplete', 'email');
    leadInput.setAttribute('inputmode', 'email');
    leadInput.setAttribute('placeholder', 'you@example.com');
    leadInput.setAttribute('aria-label', 'Email address');

    leadBtn = make('button', 'epi-lead-btn', 'Notify me');
    leadBtn.type = 'submit';

    leadRow.appendChild(leadInput);
    leadRow.appendChild(leadBtn);

    leadNote = make('p', 'epi-lead-note');
    leadNote.setAttribute('role', 'status');

    leadForm.appendChild(leadLabel);
    leadForm.appendChild(leadRow);
    leadForm.appendChild(leadNote);

    // Quick replies
    quickRow = make('div', 'epi-quick');
    QUICK_REPLIES.forEach(function (label) {
      var b = make('button', null, label);
      b.type = 'button';
      quickRow.appendChild(b);
    });

    // Composer
    composer = make('form', 'epi-composer');
    composer.setAttribute('aria-label', 'Write to the house');

    composerInput = make('input');
    composerInput.type = 'text';
    composerInput.setAttribute('autocomplete', 'off');
    composerInput.setAttribute('placeholder', 'Write to the house\u2026');
    composerInput.setAttribute('aria-label', 'Message');

    var sendBtn = make('button', null, '\u2192');
    sendBtn.type = 'submit';
    sendBtn.setAttribute('aria-label', 'Send message');

    composer.appendChild(composerInput);
    composer.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(leadForm);
    panel.appendChild(quickRow);
    panel.appendChild(composer);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    bind();
  }

  function bind() {
    launcher.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', closePanel);

    quickRow.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      handleInput(btn.textContent);
    });

    composer.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = composerInput.value;
      composerInput.value = '';
      handleInput(text);
    });

    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitLeadForm();
    });

    log.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.epi-action') : null;
      if (!btn) return;
      var anchor = btn.getAttribute('data-anchor');
      var href = btn.getAttribute('data-href');
      if (anchor) {
        scrollToAnchor(anchor);
        closePanel();
      } else if (href) {
        try { window.location.href = href; } catch (err) {}
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) {
        closePanel();
      }
    });
  }

  function togglePanel() {
    if (panel.classList.contains('is-open')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.classList.add('is-open');
    setTimeout(function () {
      try { composerInput.focus(); } catch (err) {}
    }, reducedMotion ? 0 : 140);
  }

  function closePanel() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('is-open');
    try { launcher.focus(); } catch (err) {}
  }

  function scrollToAnchor(hash) {
    try {
      if (!hash) return;
      var el = document.querySelector(hash);
      if (!el) el = document.getElementById(hash.replace(/^#/, ''));
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    } catch (err) {}
  }

  function classify(text) {
    var t = (text || '').toLowerCase();
    for (var i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i].re.test(t)) return INTENTS[i].id;
    }
    return null;
  }

  function handleInput(text) {
    var t = (text || '').trim();
    if (!t) return;
    addMessage('user', t);
    respond(t);
  }

  function respond(text) {
    var intent = classify(text);
    if (!intent) {
      addMessage('bot', RESPONSES.fallback);
      return;
    }
    var actions = ACTIONS[intent] || [];
    addMessage('bot', RESPONSES[intent], { actions: actions });
    if (intent === 'buy') {
      showLead();
    }
  }

  function addMessage(role, text, opts) {
    opts = opts || {};
    var m = { role: role, text: text };
    if (opts.greeting) m.greeting = true;
    if (opts.actions && opts.actions.length) m.actions = opts.actions;
    messages.push(m);
    log.appendChild(renderMessage(m));
    scrollLog();
    persist();
  }

  function renderMessage(m) {
    var wrap = make('div', 'epi-msg epi-msg--' + m.role);
    if (m.role === 'bot' && m.greeting) wrap.className += ' epi-msg--greeting';

    var bubble = make('div', 'epi-bubble', m.text);
    wrap.appendChild(bubble);

    if (m.actions && m.actions.length) {
      var actions = make('div', 'epi-actions');
      m.actions.forEach(function (a) {
        var btn = make('button', 'epi-action', a.label);
        btn.type = 'button';
        if (a.anchor) btn.setAttribute('data-anchor', a.anchor);
        if (a.href) btn.setAttribute('data-href', a.href);
        actions.appendChild(btn);
      });
      wrap.appendChild(actions);
    }
    return wrap;
  }

  function scrollLog() {
    try { log.scrollTop = log.scrollHeight; } catch (err) {}
  }

  function showLead() {
    leadForm.hidden = false;
    setLeadNote('', false);
    scrollLog();
    setTimeout(function () {
      try { leadInput.focus(); } catch (err) {}
    }, reducedMotion ? 0 : 140);
  }

  function setLeadNote(text, isError) {
    leadNote.textContent = text || '';
    leadNote.classList.toggle('is-visible', !!text);
    leadNote.classList.toggle('is-error', !!isError);
  }

  function setLeadBusy(busy) {
    leadBtn.disabled = busy;
    leadInput.disabled = busy;
    leadBtn.textContent = busy ? 'Sending\u2026' : 'Notify me';
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function submitLeadForm() {
    var email = (leadInput.value || '').trim();
    if (!isValidEmail(email)) {
      setLeadNote('A valid email, please.', true);
      try { leadInput.focus(); } catch (err) {}
      return;
    }
    setLeadBusy(true);
    setLeadNote('', false);
    submitLead(email).then(function (ok) {
      setLeadBusy(false);
      if (ok) {
        leadForm.hidden = true;
        leadInput.value = '';
        addMessage('bot', 'Thank you. The house will write first, before the lot opens.');
      } else {
        setLeadNote('We could not record that. Please try again, or write to support@epitomearabica.com.', true);
      }
    });
  }

  function getToken() {
    return fetch('/token.php', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) { return (data && typeof data.token === 'string') ? data.token : ''; })
      .catch(function () { return ''; });
  }

  function submitLead(email) {
    return getToken()
      .then(function (token) {
        if (!token) return { ok: false };
        var body = new URLSearchParams();
        body.set('type', 'subscribe');
        body.set('email', email);
        body.set('_csrf', token);
        body.set('_gotcha', '');
        return fetch('/lead.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body.toString()
        });
      })
      .then(function (res) {
        if (!res || typeof res.json !== 'function') return { ok: false };
        return res.json().catch(function () { return { ok: false }; });
      })
      .then(function (data) {
        if (data && data.ok === true) {
          fireLeadEvent();
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  function fireLeadEvent() {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { form: 'chatbot_subscribe' });
      }
    } catch (err) {}
  }

  function persist() {
    try {
      var data = { version: 1, messages: messages };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {}
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.messages)) return false;
      var valid = [];
      data.messages.forEach(function (m) {
        if (m && (m.role === 'bot' || m.role === 'user') && typeof m.text === 'string') {
          var item = { role: m.role, text: m.text };
          if (m.greeting) item.greeting = true;
          if (Array.isArray(m.actions)) {
            item.actions = m.actions.filter(function (a) {
              return a && typeof a.label === 'string' && (a.anchor || a.href);
            });
          }
          valid.push(item);
        }
      });
      messages = valid;
      messages.forEach(function (m) { log.appendChild(renderMessage(m)); });
      scrollLog();
      return messages.length > 0;
    } catch (err) {
      return false;
    }
  }

  function init() {
    if (window.__epitomeChatInit) return;
    window.__epitomeChatInit = true;
    if (!document.body) return;
    try {
      build();
      if (!load()) {
        addMessage('bot', RESPONSES.greeting, { greeting: true });
      }
    } catch (err) {
      // The widget is an enhancement; it must never throw on the page.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
