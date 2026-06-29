const FREE_DAILY_LIMIT = 5;

function extractAmazonLink() {
  return new Promise((resolve) => {
    try {
      let capturedLink = null;
      
      // 1. Intercepta a API de Clipboard Moderna
      if (navigator.clipboard) {
        navigator.clipboard.writeText = function(text) {
          capturedLink = text;
          return Promise.resolve();
        };
      }
      
      // 2. Intercepta o método Copy antigo
      const originalExec = document.execCommand;
      document.execCommand = function(cmd, ...args) {
        if (cmd.toLowerCase() === 'copy') {
           const activeEl = document.activeElement;
           if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
              capturedLink = activeEl.value;
           } else {
              capturedLink = window.getSelection().toString();
           }
        }
        return originalExec.apply(this, [cmd, ...args]);
      };

      const getButton = () => document.querySelector('#amzn-ss-get-link-button, #amzn-ss-text-link-button, #amzn-ss-text-link a, #amzn-ss-text-link button');
      
      let attempts = 0;
      const maxAttempts = 20; // 10 segundos max

      const checkInterval = setInterval(() => {
        attempts++;
        const btn = getButton();
        // Só clica se o botão existir e não estiver bloqueado (disabled)
        if (btn && !btn.disabled && !btn.hasAttribute('disabled') && !btn.classList.contains('andes-button--disabled')) {
          clearInterval(checkInterval);
          btn.click(); // Abre o popover
          
          let popoverAttempts = 0;
          const popoverInterval = setInterval(() => {
            popoverAttempts++;
            
            // Tenta clicar no botão de Copiar que o usuário mencionou
            const copyBtn = document.querySelector('#amzn-ss-copy-affiliate-link-btn-announce, #amzn-ss-copy-affiliate-link-btn, .amzn-ss-copy-affiliate-link-btn button');
            if (copyBtn) {
               copyBtn.click();
            }
            
            // Tenta o textarea clássico
            const textarea = document.querySelector('#amzn-ss-text-shortlink-textarea, textarea[name="textLink"], #amzn-ss-text-link-textarea, .a-popover-inner textarea');
            if (textarea && textarea.value && textarea.value.includes('http')) {
               capturedLink = textarea.value;
            }

            // Fallback: regex
            if (!capturedLink) {
              const popover = document.querySelector('.a-popover-wrapper, .a-popover-inner');
              if (popover) {
                const match = popover.innerHTML.match(/https?:\/\/amzn\.to\/[a-zA-Z0-9]+/);
                if (match) capturedLink = match[0];
              }
            }

            if (capturedLink && capturedLink.includes('http')) {
              clearInterval(popoverInterval);
              resolve(capturedLink);
            } else if (popoverAttempts > 10) {
              clearInterval(popoverInterval);
              resolve(null);
            }
          }, 500);

        } else if (attempts > maxAttempts) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 500);
    } catch (e) {
      resolve(null);
    }
  });
}

// Extração de link Mercado Livre Afiliados
async function getGoogleId() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
      if (chrome.runtime.lastError || !token) {
        chrome.storage.sync.get(['afiUserId'], async (data) => {
          resolve(data.afiUserId || 'usr_fallback');
        });
        return;
      }
      
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(async data => {
        if (data && data.sub) {
          resolve(data.sub);
        } else {
          const localData = await chrome.storage.sync.get(['afiUserId']);
          resolve(localData.afiUserId || 'usr_fallback');
        }
      })
      .catch(async err => {
        console.error("Erro na background:", err);
        const localData = await chrome.storage.sync.get(['afiUserId']);
        resolve(localData.afiUserId || 'usr_fallback');
      });
    });
  });
}

function extractMLLink() {
  return new Promise((resolve) => {
    try {
      let capturedLink = null;
      
      // 1. Interceptação de Clipboard (Disfarce)
      if (navigator.clipboard) {
        navigator.clipboard.writeText = function(text) {
          capturedLink = text;
          return Promise.resolve();
        };
      }
      const originalExec = document.execCommand;
      document.execCommand = function(cmd, ...args) {
        if (cmd.toLowerCase() === 'copy') {
           const activeEl = document.activeElement;
           if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
              capturedLink = activeEl.value;
           } else {
              capturedLink = window.getSelection().toString();
           }
        }
        return originalExec.apply(this, [cmd, ...args]);
      };

      // 2. Busca o botão principal do Mercado Livre
      const getButton = () => document.querySelector('[data-testid="generate_link_button"], .generate_link_button');
      
      let attempts = 0;
      const maxAttempts = 40; // Aumentado para 20 segundos (conexões lentas)
      
      const checkInterval = setInterval(() => {
        attempts++;
        const btn = getButton();
        // Só clica se o botão existir e não estiver bloqueado (disabled)
        if (btn && !btn.disabled && !btn.hasAttribute('disabled') && !btn.classList.contains('andes-button--disabled')) {
          clearInterval(checkInterval);
          btn.click(); // Abre o popover do Mercado Livre
          
          let popoverAttempts = 0;
          const popoverInterval = setInterval(() => {
            popoverAttempts++;
            
            // Clica no botão de copiar específico do link (não do ID)
            const copyBtn = document.querySelector('[data-testid="copy-button__label_link"]');
            if (copyBtn) {
               copyBtn.click();
            }
            
            // Tenta o textarea direto
            const textarea = document.querySelector('textarea[data-testid="text-field__label_link"]');
            if (textarea && textarea.value && textarea.value.includes('http')) {
               capturedLink = textarea.value;
            }

            // Fallback: Procura por mercadolivre na innerHTML
            if (!capturedLink) {
               const popover = document.querySelector('.andes-popper, .link-generator');
               if (popover) {
                  const match = popover.innerHTML.match(/https?:\/\/[a-zA-Z0-9.\-]+\.mercadolivre\.com\.br\/[a-zA-Z0-9/.\-_]+/);
                  if (match) capturedLink = match[0];
               }
            }

            if (capturedLink && capturedLink.includes('http')) {
              clearInterval(popoverInterval);
              resolve(capturedLink);
            } else if (popoverAttempts > 24) { // Aumentado para 12 segundos esperando o shortlink
              clearInterval(popoverInterval);
              resolve(null);
            }
          }, 500);

        } else if (attempts > maxAttempts) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 500);
    } catch (e) {
      resolve(null);
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API_URL = 'https://afilink.andrson.com.br';

async function startGenerationLoop() {
  const googleId = await getGoogleId();
  const deviceId = googleId;

  const data = await chrome.storage.local.get(['afiQueue', 'afiResults']);
  let remainingQueue = data.afiQueue || [];
  let existingResults = data.afiResults || [];
  
  // Consulta API
  let quota = 0;
  let isPro = false;
  try {
    const res = await fetch(`${API_URL}/api/user/${deviceId}`);
    const userData = await res.json();
    quota = userData.dailyUsage || 0;
    isPro = userData.isPro || false;
  } catch (err) {
    console.error("Erro da API", err);
    if (!googleId) {
      // Fallback if somehow sync fails
      chrome.runtime.sendMessage({ action: 'GENERATION_ERROR', error: 'Erro de identidade. Recarregue a extensão.' }).catch(() => {});
    }
    return;
  }
  
  // Clone the queue to iterate over
  const itemsToProcess = [...remainingQueue];
  let generatedCount = 0;

  for (let i = 0; i < itemsToProcess.length; i++) {
    const item = itemsToProcess[i];
    
    if (!isPro && quota >= FREE_DAILY_LIMIT) {
      // Break immediately to keep the remainingQueue intact
      break;
    }

    try {
      // 1. Abre a aba
      const tab = await chrome.tabs.create({ url: item.url, active: false, pinned: true });
      
      // 2. Aguarda o carregamento total da página
      await new Promise((resolve) => {
        let isResolved = false;
        const fallback = setTimeout(() => {
          if (!isResolved) { isResolved = true; resolve(); }
        }, 10000); // Máximo 10s

        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(fallback);
            if (!isResolved) { isResolved = true; resolve(); }
          }
        });
      });
      
      // Espera extra para que o script do SiteStripe injete a barra
      await new Promise(res => setTimeout(res, 2500));
      
      const isAmazon = item.url.includes('amazon');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: isAmazon ? extractAmazonLink : extractMLLink
      });
      
      // 3. Fecha aba
      await chrome.tabs.remove(tab.id);
      
      const shortLink = results[0]?.result;
      if (shortLink) {
        // Envia para API
        try {
          const incRes = await fetch(`${API_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleId: deviceId }) // Mantemos o nome da prop na API para não ter que refazer o backend
          });
          const incData = await incRes.json();
          if (incData.success) {
            quota = incData.usage;
            isPro = incData.isPro;
          }
        } catch(e) {}
        
        remainingQueue.shift();
        existingResults.push({ ...item, shortLink });
        generatedCount++;
      } else {
        remainingQueue.shift();
        existingResults.push({ ...item, shortLink: 'Falha ao capturar link' });
      }

      // Stream: Salva a lista parcial e notifica o popup a cada passo
      await chrome.storage.local.set({ 
        afiQueue: remainingQueue, 
        afiResults: existingResults 
      });
      chrome.runtime.sendMessage({ action: 'GENERATION_PROGRESS' }).catch(() => {});

    } catch (e) {
      console.error('Erro ao processar item:', item, e);
      remainingQueue.shift();
      existingResults.push({ ...item, shortLink: 'Erro ao extrair' });
      
      await chrome.storage.local.set({ 
        afiQueue: remainingQueue, 
        afiResults: existingResults 
      });
      chrome.runtime.sendMessage({ action: 'GENERATION_PROGRESS' }).catch(() => {});
    }
  }

  // Save back to storage
  await chrome.storage.local.set({ 
    afiQueue: remainingQueue, 
    afiResults: existingResults 
  });
  
  // Native Notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Geração Concluída!',
    message: generatedCount > 0 ? `${generatedCount} links gerados com sucesso.` : 'Fila processada.'
  });

  chrome.runtime.sendMessage({ action: 'GENERATION_COMPLETE' }).catch(() => {});
}

// Escuta mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_GENERATION') {
    startGenerationLoop();
    sendResponse({ status: 'started' });
  }
});
