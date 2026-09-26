/**
 * components/advisor.js
 * Floating AI Advisor chat widget.
 * Multilingual (EN/HI/MR), grounded responses, quick prompt chips.
 */
export function initAIAdvisor() {
  const toggleBtn    = document.getElementById('ai-advisor-toggle');
  const chatWindow   = document.getElementById('ai-chat-window');
  const closeBtn     = document.getElementById('ai-chat-close');
  const chatForm     = document.getElementById('ai-chat-form');
  const inputField   = document.getElementById('ai-input-field');
  const messagesLog  = document.getElementById('ai-messages-log');
  const promptChips  = document.querySelectorAll('.prompt-chip');
  const langButtons  = document.querySelectorAll('.lang-btn');

  let currentLang = 'en';

  // ── Toggle chat window ──
  toggleBtn?.addEventListener('click', () => {
    chatWindow?.classList.toggle('ai-chat-window--open');
    if (chatWindow?.classList.contains('ai-chat-window--open')) {
      setTimeout(() => inputField?.focus(), 150);
    }
  });

  closeBtn?.addEventListener('click', () => {
    chatWindow?.classList.remove('ai-chat-window--open');
  });

  // ── Language switcher ──
  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      langButtons.forEach((b) => b.classList.remove('lang-btn--active'));
      btn.classList.add('lang-btn--active');
      currentLang = btn.getAttribute('data-lang') || 'en';

      const placeholders = {
        hi: 'वायु गुणवत्ता, नीतिगत निर्णय या स्वास्थ्य जोखिम के बारे में पूछें...',
        mr: 'हवेची गुणवत्ता किंवा उपाययोजनांबद्दल विचारा...',
        en: 'Ask about air quality, policy interventions, or health risks...',
      };
      if (inputField) inputField.placeholder = placeholders[currentLang] ?? placeholders.en;
    });
  });

  // ── Append a message bubble ──
  function appendMessage(text, isUser = false) {
    if (!messagesLog) return;
    const msgEl = document.createElement('div');
    msgEl.className = `ai-msg ${isUser ? 'ai-msg--user' : 'ai-msg--bot'}`;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgEl.innerHTML = isUser
      ? `<div class="ai-bubble"><p>${text}</p><span class="ai-time">${now}</span></div>`
      : `<div class="ai-avatar"><i data-lucide="bot"></i></div>
         <div class="ai-bubble"><p>${text}</p><span class="ai-time">${now}</span></div>`;

    messagesLog.appendChild(msgEl);
    messagesLog.scrollTop = messagesLog.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  // ── Grounded response generator ──
  function generateResponse(query) {
    const q = query.toLowerCase();

    if (currentLang === 'hi') {
      if (q.includes('school') || q.includes('स्कूल'))
        return 'डिजिटल ट्विन का पूर्वानुमान है कि कल सुबह 08:30 बजे आनंद विहार और जहांगीरपुरी में AQI 220 पार कर सकता है। जीआरएपी-3 दिशानिर्देशों के तहत प्राथमिक विद्यालयों को ऑनलाइन कक्षाओं में स्थानांतरित करने की सिफारिश की जाती है।';
      if (q.includes('anand') || q.includes('आनंद'))
        return 'आनंद विहार में 32% विचलन दर्ज हुआ है। उत्तर-पश्चिम से 8 किमी/घंटा की हवा पराली के धुएं को ला रही है, जिसे शाम की थर्मल इनवर्जन परत ने जमीन पर फंसा दिया है।';
      return 'मॉडल 30% ट्रैफिक प्रतिबंध और 45 मिस्ट गन से AQI में -42 अंक की गिरावट का अनुमान लगाता है।';
    }

    if (currentLang === 'mr')
      return 'अटमॉस डिजिटल ट्विनच्या विश्लेषणानुसार: सध्या दिल्ली एनसीआरचा सरासरी AQI 187 (खराब) आहे. 30% वाहतूक निर्बंध लागू केल्यास 48 तासांत हवेच्या गुणवत्तेत 24% सुधारणा शक्य आहे.';

    // English grounded responses
    if (q.includes('school') || q.includes('close'))
      return 'The digital twin forecasts AQI exceeding <strong>210 in East and North-West wards</strong> between 07:30–10:30 AM tomorrow due to nocturnal thermal trapping. Under GRAP-III protocols, suspending in-person primary school sessions avoids an estimated <strong>48 acute childhood ER admissions</strong>.';
    if (q.includes('anand') || q.includes('spike') || q.includes('why'))
      return 'Anand Vihar spiked to <strong>218 AQI (+32% divergence)</strong> due to sustained 8 km/h North-Westerly winds transporting an agricultural burning plume into the trans-Yamuna basin. A low atmospheric boundary layer (280 m) trapped particulate matter at surface level.';
    if (q.includes('traffic') || q.includes('30%') || q.includes('restrict'))
      return 'Enforcing a <strong>30% Odd-Even and heavy transit restriction</strong> removes approximately <strong>18 AQI points</strong>. Combined with metro subsidies, it saves <strong>₹14.2 Crore</strong> in civic healthcare costs at an intervention cost of ~₹12 Cr.';

    return 'Based on live twin telemetry, city-wide AQI is <strong>187 (Poor)</strong> with vehicular emissions driving <strong>42%</strong> of the particulate load. Targeted dust suppression in priority wards yields the highest immediate ROI (+1.54 AQI drop per ₹ Cr).';
  }

  // ── Handle a user query ──
  function handleQuery(query) {
    if (!query.trim()) return;
    appendMessage(query, true);
    setTimeout(() => appendMessage(generateResponse(query), false), 450);
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
