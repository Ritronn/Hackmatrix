/**
 * components/advisor.js
 * Floating AI Advisor — sends questions to the Gemini backend endpoint.
 * Injects live AQI context automatically from window._currentAqi.
 * Falls back to canned responses if backend is unreachable.
 */
import { askAdvisor } from '../api/advisor.js';

export function initAIAdvisor() {
  const toggleBtn   = document.getElementById('ai-advisor-toggle');
  const chatWindow  = document.getElementById('ai-chat-window');
  const closeBtn    = document.getElementById('ai-chat-close');
  const chatForm    = document.getElementById('ai-chat-form');
  const inputField  = document.getElementById('ai-input-field');
  const messagesLog = document.getElementById('ai-messages-log');
  const promptChips = document.querySelectorAll('.prompt-chip');
  const langButtons = document.querySelectorAll('.lang-btn');

  let currentLang = 'en';

  // ── Toggle ────────────────────────────────────────────────────────────────
  toggleBtn?.addEventListener('click', () => {
    chatWindow?.classList.toggle('ai-chat-window--open');
    if (chatWindow?.classList.contains('ai-chat-window--open')) {
      setTimeout(() => inputField?.focus(), 150);
    }
  });
  closeBtn?.addEventListener('click', () => chatWindow?.classList.remove('ai-chat-window--open'));

  // ── Language switcher ─────────────────────────────────────────────────────
  const placeholders = {
    hi: 'वायु गुणवत्ता, नीतिगत निर्णय या स्वास्थ्य जोखिम के बारे में पूछें...',
    mr: 'हवेची गुणवत्ता किंवा उपाययोजनांबद्दल विचारा...',
    en: 'Ask about air quality, policy interventions, or health risks...',
  };
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      langButtons.forEach((b) => b.classList.remove('lang-btn--active'));
      btn.classList.add('lang-btn--active');
      currentLang = btn.getAttribute('data-lang') || 'en';
      if (inputField) inputField.placeholder = placeholders[currentLang] ?? placeholders.en;
    });
  });

  // ── Message bubble ────────────────────────────────────────────────────────
  function appendMessage(html, isUser = false, isLoading = false) {
    if (!messagesLog) return;
    const el = document.createElement('div');
    el.className = `ai-msg ${isUser ? 'ai-msg--user' : 'ai-msg--bot'}`;
    if (isLoading) el.id = 'ai-loading-bubble';
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = isUser
      ? `<div class="ai-bubble"><p>${html}</p><span class="ai-time">${now}</span></div>`
      : `<div class="ai-avatar"><i data-lucide="bot"></i></div>
         <div class="ai-bubble"><p>${html}</p><span class="ai-time">${now}</span></div>`;
    messagesLog.appendChild(el);
    messagesLog.scrollTop = messagesLog.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
    return el;
  }

  function removeLoadingBubble() {
    document.getElementById('ai-loading-bubble')?.remove();
  }

  // ── Offline fallback ──────────────────────────────────────────────────────
  function fallbackResponse(q) {
    const l = q.toLowerCase();
    if (l.includes('school') || l.includes('close'))
      return 'The digital twin forecasts AQI reaching <strong>185+ in Akurdi and Bhosari industrial corridors</strong> tomorrow morning. Under MPCB guidelines, outdoor sports and morning assemblies should be suspended in PCMC schools.';
    if (l.includes('akurdi') || l.includes('bhosari') || l.includes('anand') || l.includes('spike'))
      return 'Akurdi and Bhosari spiked to <strong>188–192 AQI (+28% divergence)</strong> due to cold night-time boundary layer compression trapping foundry emissions and NH48 freight diesel exhaust.';
    if (l.includes('traffic') || l.includes('restrict'))
      return 'A <strong>30% freight restriction along the Pune-Mumbai Expressway and NH48 bypass</strong> removes ~16 AQI points and saves <strong>₹12.4 Crore</strong> in healthcare costs at ~₹9.5 Cr intervention cost.';
    return `Maharashtra urban twin AQI is currently <strong>${window._currentAqi ?? 142} (Moderate to Poor)</strong>. Vehicular and industrial transit drives 44% of particulate load. Anti-smog mist guns in Bhosari and Akurdi offer the best immediate ROI.`;
  }

  // ── Send query to Gemini backend ──────────────────────────────────────────
  async function handleQuery(query) {
    if (!query.trim()) return;
    appendMessage(query, true);
    appendMessage('⋯ thinking...', false, true);

    try {
      const result = await askAdvisor({
        question:                query,
        city:                    window._currentCity ?? 'Pune',
        language:                currentLang,
        context_aqi:             window._currentAqi ?? null,
        context_forecast_peak:   window._currentAqi ? window._currentAqi * 1.08 : null,
        // Use live attribution if ML team has written it, else a generic description
        context_dominant_source: window._currentAttribution ?? 'Vehicular transit, Industrial manufacturing (MIDC), Road dust',
      });
      removeLoadingBubble();
      appendMessage(result.answer, false);
    } catch (err) {
      console.warn('[advisor] Gemini API unreachable, using fallback.', err);
      removeLoadingBubble();
      appendMessage(fallbackResponse(query), false);
    }
  }

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = inputField?.value ?? '';
    if (inputField) inputField.value = '';
    handleQuery(val);
  });

  promptChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-prompt') || chip.textContent;
      chatWindow?.classList.add('ai-chat-window--open');
      handleQuery(text);
    });
  });
}
