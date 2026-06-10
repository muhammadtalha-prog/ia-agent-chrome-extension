document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const apiUrlInput = document.getElementById('api-url');
  const modelInput = document.getElementById('model-name');
  const systemPromptInput = document.getElementById('system-prompt');
  const settingsForm = document.getElementById('settings-form');
  const toast = document.getElementById('toast');

  const defaultPrompt = "You are IA Agent, a helpful, intelligent browser assistant. You analyze the text content of the user's active webpage and answer questions or write summaries based on it. Keep responses clear, concise, and structured.";

  // Load saved settings
  chrome.storage.local.get([
    'apiKey',
    'apiUrl',
    'modelName',
    'systemPrompt'
  ], (items) => {
    apiKeyInput.value = items.apiKey || '';
    apiUrlInput.value = items.apiUrl || 'https://api.deepseek.com/chat/completions';
    modelInput.value = items.modelName || 'deepseek-chat';
    systemPromptInput.value = items.systemPrompt || defaultPrompt;
  });

  // Save settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      apiUrl: apiUrlInput.value.trim(),
      modelName: modelInput.value.trim(),
      systemPrompt: systemPromptInput.value.trim()
    };

    chrome.storage.local.set(settings, () => {
      // Show success toast
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    });
  });
});
