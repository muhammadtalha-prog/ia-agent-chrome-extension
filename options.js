document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const apiUrlInput = document.getElementById('api-url');
  const modelInput = document.getElementById('model-name');
  const maxCharactersInput = document.getElementById('max-characters');
  const systemPromptInput = document.getElementById('system-prompt');
  const providerPreset = document.getElementById('provider-preset');
  const settingsForm = document.getElementById('settings-form');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const toast = document.getElementById('toast');

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

  // Handle Preset Changes
  providerPreset.addEventListener('change', () => {
    const selected = providerPreset.value;
    if (presets[selected]) {
      apiUrlInput.value = presets[selected].url;
      modelInput.value = presets[selected].model;
    }
  });

  // Save settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const maxChars = parseInt(maxCharactersInput.value, 10);
    const settings = {
      apiKey: apiKeyInput.value.trim(),
      apiUrl: apiUrlInput.value.trim(),
      modelName: modelInput.value.trim(),
      maxCharacters: isNaN(maxChars) ? 15000 : maxChars,
      systemPrompt: systemPromptInput.value.trim(),
      selectedPreset: providerPreset.value
    };

    chrome.storage.local.set(settings, () => {
      showToast("Settings saved successfully!");
    });
  });

  // Handle Clear Chat History
  btnClearHistory.addEventListener('click', () => {
    const confirmClear = confirm("Are you sure you want to clear all chat history? This cannot be undone.");
    if (confirmClear) {
      chrome.storage.session.remove(['globalChatHistory'], () => {
        showToast("Chat history cleared!");
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
