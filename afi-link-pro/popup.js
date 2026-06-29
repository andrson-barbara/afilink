const FREE_DAILY_LIMIT = 5;

document.addEventListener('DOMContentLoaded', () => {
  const queueList = document.getElementById('queue-list');
  const emptyState = document.getElementById('empty-state');
  const queueCount = document.getElementById('queue-count');
  const generateBtn = document.getElementById('generate-btn');
  const resultsContainer = document.getElementById('results-container');
  const resultsList = document.getElementById('results-list');
  const clearResultsBtn = document.getElementById('clear-results-btn');
  const quotaCount = document.getElementById('quota-count');
  const paywallBanner = document.getElementById('paywall-banner');
  const subscribeBtn = document.getElementById('subscribe-btn');

  let currentQueue = [];
  let generatedLinks = [];

  // Initialize
  loadState();

  const API_URL = 'https://afilink.andrson.com.br';

  async function getGoogleId() {
    return new Promise((resolve) => {
      // 1. Solicita o token OAuth2. Se interactive: true, abre a tela do Google se necessário.
      chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError || !token) {
          console.warn("Login cancelado ou falhou:", chrome.runtime.lastError);
          // Fallback se o usuário se recusar a logar (cria um ID temporário local)
          chrome.storage.sync.get(['afiUserId'], async (data) => {
            if (data.afiUserId) {
              resolve(data.afiUserId);
            } else {
              const newId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              await chrome.storage.sync.set({ afiUserId: newId });
              resolve(newId);
            }
          });
          return;
        }

        // 2. Com o token aprovado, buscamos o ID real direto dos servidores do Google
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => res.json())
        .then(async data => {
          if (data && data.sub) {
            // data.sub é o ID numérico único oficial da conta Google
            resolve(data.sub);
          } else {
            // Fallback
            const localData = await chrome.storage.sync.get(['afiUserId']);
            resolve(localData.afiUserId || 'usr_fallback');
          }
        })
        .catch(async err => {
          console.error("Erro ao buscar dados do Google:", err);
          const localData = await chrome.storage.sync.get(['afiUserId']);
          resolve(localData.afiUserId || 'usr_fallback');
        });
      });
    });
  }

  // Load state from storage
  function loadState() {
    chrome.storage.local.get(['afiQueue', 'afiResults'], (data) => {
      currentQueue = data.afiQueue || [];
      
      // Check for results
      if (data.afiResults && data.afiResults.length > 0) {
        generatedLinks = data.afiResults;
        renderResults();
      } else {
        generatedLinks = [];
        resultsContainer.classList.add('hidden');
      }

      renderQueue();

      // Busca identidade via UUID Sync e bate na API
      (async () => {
        const userId = await getGoogleId();
        
        try {
          const res = await fetch(`${API_URL}/api/user/${userId}`);
          const userData = await res.json();
          
          if (userData.isPro) {
             const quotaContainer = document.querySelector('.quota-info');
             if (quotaContainer) {
               quotaContainer.innerHTML = 'Você é <strong style="color:var(--primary)">PRO</strong>! Aproveite sem limites.';
               quotaContainer.style.textAlign = 'center';
               quotaContainer.style.fontSize = '14px';
             }
             const queueLimit = document.getElementById('queue-limit');
             if (queueLimit) queueLimit.style.display = 'none';

             paywallBanner.classList.add('hidden');
             generateBtn.disabled = currentQueue.length === 0;
          } else {
             const queueLimit = document.getElementById('queue-limit');
             if (queueLimit) queueLimit.style.display = 'inline';
             quotaCount.textContent = userData.dailyUsage;
             if (userData.dailyUsage >= FREE_DAILY_LIMIT) {
                paywallBanner.classList.remove('hidden');
                generateBtn.disabled = true;
             } else {
                paywallBanner.classList.add('hidden');
                generateBtn.disabled = currentQueue.length === 0;
             }
          }
      } catch (e) {
         console.error("API offline ou bloqueada", e);
         quotaCount.textContent = '?';
      }
      })();
    });
  }

  function renderQueue() {
    queueCount.textContent = currentQueue.length;
    queueList.innerHTML = '';

    if (currentQueue.length === 0) {
      emptyState.classList.remove('hidden');
      generateBtn.disabled = true;
      if (generateBtn.parentElement.classList.contains('action-section')) {
        generateBtn.parentElement.classList.add('hidden');
      }
    } else {
      emptyState.classList.add('hidden');
      generateBtn.disabled = false;
      if (generateBtn.parentElement.classList.contains('action-section')) {
        generateBtn.parentElement.classList.remove('hidden');
      }

      currentQueue.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'queue-item';

        li.innerHTML = `
          <img src="${item.image || 'icon.png'}" class="item-img" alt="img">
          <div class="item-details">
            <span class="item-title">${item.title}</span>
            <span class="item-price">${item.price}</span>
            ${item.shortLink ? `<span class="item-status">Link gerado ✓</span>` : ''}
          </div>
          <div class="item-actions">
            <button class="remove-btn" data-index="${index}" title="Remover">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        `;
        queueList.appendChild(li);
      });

      // Attach remove events
      document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.currentTarget.getAttribute('data-index'));
          removeFromQueue(index);
        });
      });
    }
  }

  function removeFromQueue(index) {
    currentQueue.splice(index, 1);
    chrome.storage.local.set({ afiQueue: currentQueue }, () => {
      renderQueue();
    });
  }

  // Generate Button Click
  generateBtn.addEventListener('click', () => {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Gerando Links...';
    
    chrome.runtime.sendMessage({ action: 'START_GENERATION' });
  });

  // Listen to background messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GENERATION_PROGRESS') {
      // Background updated the queue partially
      loadState();
    } else if (request.action === 'GENERATION_COMPLETE') {
      generateBtn.textContent = 'Gerar Links da Fila';
      loadState();
    } else if (request.action === 'GENERATION_ERROR') {
      generateBtn.textContent = 'Gerar Links da Fila';
      generateBtn.disabled = false;
      alert('Erro ao gerar links: ' + request.error);
    }
  });

  function renderResults() {
    resultsContainer.classList.remove('hidden');
    resultsList.innerHTML = '';
    
    generatedLinks.forEach((res, index) => {
      const li = document.createElement('li');
      li.className = 'result-card';
      
      const title = res.title || 'Produto';
      const price = res.price || '';
      const isError = res.shortLink && !res.shortLink.includes('http');
      
      const promoText = `🔥 ${title} por ${price}. Garanta descontos de 30%, 50% ou 80% OFF aqui: ${res.shortLink}`;

      li.innerHTML = `
        <div class="result-card-header">
          <img src="${res.image || 'icon.png'}" class="item-img" alt="img">
          <div class="item-details">
            <span class="item-title">${title}</span>
            <span class="item-price">${price}</span>
          </div>
        </div>
        <div class="result-link-box ${isError ? 'error' : ''}">
          ${res.shortLink}
        </div>
        <div class="result-card-actions">
          <button class="copy-res-btn btn-outline btn-copy" data-text="${promoText}">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            Copiar Divulgação
          </button>
          <button class="remove-res-btn btn-outline btn-remove" data-index="${index}" title="Remover">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      `;
      resultsList.appendChild(li);
    });

    document.querySelectorAll('.copy-res-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const text = targetBtn.getAttribute('data-text');
        navigator.clipboard.writeText(text);
        
        const originalText = targetBtn.textContent;
        targetBtn.textContent = 'Copiado!';
        setTimeout(() => { targetBtn.textContent = originalText; }, 1500);
      });
    });

    document.querySelectorAll('.remove-res-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        generatedLinks.splice(index, 1);
        chrome.storage.local.set({ afiResults: generatedLinks }, () => {
          if (generatedLinks.length === 0) {
            resultsContainer.classList.add('hidden');
          } else {
            renderResults();
          }
        });
      });
    });
  }

  if (clearResultsBtn) {
    clearResultsBtn.addEventListener('click', () => {
      chrome.storage.local.remove(['afiResults'], () => {
        generatedLinks = [];
        resultsContainer.classList.add('hidden');
      });
    });
  }

  async function getFallbackId(userInfo) {
    if (userInfo && userInfo.id) return userInfo.id;
    const data = await chrome.storage.sync.get(['fallbackUserId']);
    return data.fallbackUserId || 'err_no_id';
  }

  subscribeBtn.addEventListener('click', async () => {
    const userId = await getGoogleId();
    chrome.tabs.create({ url: `https://buy.stripe.com/6oU3cw0lG2yp4yRclAbMQ00?client_reference_id=${userId}` });
  });

  const lifetimeBtn = document.getElementById('lifetime-btn');
  if (lifetimeBtn) {
    lifetimeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const userId = await getGoogleId();
      chrome.tabs.create({ url: `https://buy.stripe.com/8x27sM3xSflbe9rdpEbMQ01?client_reference_id=${userId}` });
    });
  }
});
