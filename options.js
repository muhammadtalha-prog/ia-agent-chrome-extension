document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const apiUrlInput = document.getElementById('api-url');
  const modelInput = document.getElementById('model-name');
  const maxCharactersInput = document.getElementById('max-characters');
  const systemPromptInput = document.getElementById('system-prompt');
  const providerPreset = document.getElementById('provider-preset');
  const settingsForm = document.getElementById('settings-form');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnPruneHistory = document.getElementById('btn-prune-history');
  const toast = document.getElementById('toast');
  
  const keyFormatHint = document.getElementById('key-format-hint');
  const charLimitWarning = document.getElementById('char-limit-warning');

  const defaultPrompt = "You are IA Agent, a helpful, intelligent browser assistant. You analyze the text content of the user's active webpage and answer questions or write summaries based on it. Keep responses clear, concise, and structured.";

  const presets = {
    'deepseek': {
      url: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat'
    },
    'xai-grok': {
      url: 'https://api.x.ai/v1/chat/completions',
      model: 'grok-2-1212'
    },
    'groq': {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile'
    }
  };

  // Load saved settings
  chrome.storage.local.get([
    'apiKey',
    'apiUrl',
    'modelName',
    'maxCharacters',
    'systemPrompt',
    'selectedPreset'
  ], (items) => {
    apiKeyInput.value = items.apiKey || '';
    apiUrlInput.value = items.apiUrl || 'https://api.deepseek.com/chat/completions';
    modelInput.value = items.modelName || 'deepseek-chat';
    maxCharactersInput.value = items.maxCharacters || 15000;
    systemPromptInput.value = items.systemPrompt || defaultPrompt;
    
    // Auto-detect preset or select custom
    const savedPreset = items.selectedPreset || detectPreset(apiUrlInput.value, modelInput.value);
    providerPreset.value = savedPreset;
    
    // Initial validation check
    validateApiKey();
  });

  // Helper to detect preset from URL and Model
  function detectPreset(url, model) {
    for (const key in presets) {
      if (presets[key].url === url && presets[key].model === model) {
        return key;
      }
    }
    return 'custom';
  }

  // Helper to validate key format based on preset and display hint
  function validateApiKey() {
    const preset = providerPreset.value;
    const key = apiKeyInput.value.trim();
    
    if (!key) {
      keyFormatHint.style.display = 'none';
      return true;
    }
    
    if (preset === 'deepseek' && !key.startsWith('sk-')) {
      keyFormatHint.textContent = "⚠️ Hint: DeepSeek API keys typically start with 'sk-'.";
      keyFormatHint.style.display = 'block';
      return false;
    } else if (preset === 'groq' && !key.startsWith('gsk_')) {
      keyFormatHint.textContent = "⚠️ Hint: Groq API keys typically start with 'gsk_'.";
      keyFormatHint.style.display = 'block';
      return false;
    } else if (preset === 'xai-grok' && !key.startsWith('xai-') && !key.startsWith('sk-')) {
      keyFormatHint.textContent = "⚠️ Hint: xAI Grok API keys typically start with 'xai-' or 'sk-'.";
      keyFormatHint.style.display = 'block';
      return false;
    } else {
      keyFormatHint.style.display = 'none';
      return true;
    }
  }

  // Handle Preset Changes
  providerPreset.addEventListener('change', () => {
    const selected = providerPreset.value;
    if (presets[selected]) {
      apiUrlInput.value = presets[selected].url;
      modelInput.value = presets[selected].model;
    }
    validateApiKey();
  });

  // If user modifies inputs manually, sync preset selector to "custom"
  apiUrlInput.addEventListener('input', () => {
    providerPreset.value = detectPreset(apiUrlInput.value.trim(), modelInput.value.trim());
    validateApiKey();
  });

  modelInput.addEventListener('input', () => {
    providerPreset.value = detectPreset(apiUrlInput.value.trim(), modelInput.value.trim());
    validateApiKey();
  });

  // Run validation on key input changes
  apiKeyInput.addEventListener('input', validateApiKey);

  // Save settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const maxChars = parseInt(maxCharactersInput.value, 10);
    
    // Validate character limit range input
    if (isNaN(maxChars) || maxChars < 1000 || maxChars > 100000) {
      charLimitWarning.style.display = 'block';
      maxCharactersInput.focus();
      return;
    } else {
      charLimitWarning.style.display = 'none';
    }

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      apiUrl: apiUrlInput.value.trim(),
      modelName: modelInput.value.trim(),
      maxCharacters: maxChars,
      systemPrompt: systemPromptInput.value.trim(),
      selectedPreset: providerPreset.value
    };

    chrome.storage.local.set(settings, () => {
      showToast("Settings saved successfully!");
    });
  });

  // Handle Clear Chat History (Reverted to chrome.storage.local)
  btnClearHistory.addEventListener('click', () => {
    const confirmClear = confirm("Are you sure you want to clear all chat history? This cannot be undone.");
    if (confirmClear) {
      chrome.storage.local.remove(['globalChatHistory'], () => {
        showToast("Chat history cleared!");
      });
    }
  });

  // Handle Prune Chat History (older than 7 days)
  btnPruneHistory.addEventListener('click', () => {
    const confirmPrune = confirm("Are you sure you want to delete messages older than 7 days? This cannot be undone.");
    if (confirmPrune) {
      chrome.storage.local.get(['globalChatHistory'], (result) => {
        if (result.globalChatHistory && result.globalChatHistory.length > 0) {
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const pruned = result.globalChatHistory.filter(msg => {
            // Keep messages that are recent, or have no timestamp as fallback
            return !msg.timestamp || msg.timestamp > sevenDaysAgo;
          });
          
          chrome.storage.local.set({ globalChatHistory: pruned }, () => {
            showToast("Old messages pruned successfully!");
          });
        } else {
          showToast("No chat history found to prune.");
        }
      });
    }
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
});
