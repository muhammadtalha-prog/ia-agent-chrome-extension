document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-name');
  const systemPromptInput = document.getElementById('system-prompt');
  const settingsForm = document.getElementById('settings-form');
  const toast = document.getElementById('toast');

  const defaultPrompt = "You are IA Agent, a helpful, intelligent browser assistant. You analyze the text content of the user's active webpage and answer questions or write summaries based on it. Keep responses clear, concise, and structured.";

  // Load saved settings
  chrome.storage.local.get([
    'apiKey',
    'modelName',
    'systemPrompt'
  ], (items) => {
    apiKeyInput.value = items.apiKey || '';
    modelSelect.value = items.modelName || 'deepseek-chat';
    systemPromptInput.value = items.systemPrompt || defaultPrompt;
  });

  // Save settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      modelName: modelSelect.value,
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
