// Background service worker for IA Agent (DeepSeek Only Edition)

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "queryAgent") {
    handleAgentQuery(request)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open
  }

  if (request.action === "summarizeTranscriptForTransfer") {
    handleSummarizeTranscript(request)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open
  }
});

// Orchestrates requests using DeepSeek API
async function handleAgentQuery(request) {
  const { prompt, pageContext, chatHistory } = request;

  // Retrieve settings
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get([
      'apiKey',
      'modelName',
      'systemPrompt'
    ], (items) => {
      resolve(items);
    });
  });

  const apiKey = settings.apiKey || 'sk-f3884e1040304b97a7f36147df604e77';
  const modelName = settings.modelName || 'deepseek-chat';
  const systemPrompt = settings.systemPrompt || "You are IA Agent, a helpful, intelligent browser assistant.";

  let activeKey = apiKey;

  // If still no key, fallback to simulated mock responses
  if (!activeKey) {
    return generateMockResponse(prompt, pageContext);
  }

  return callDeepSeekAPI(prompt, pageContext, chatHistory, modelName, activeKey, systemPrompt);
}

// Generates task context summary to copy/paste to new tab
async function handleSummarizeTranscript(request) {
  const { transcript, source } = request;
  
  const prompt = `Below is a chat transcript between a user and an AI assistant on the platform "${source || 'another AI'}".
Your job is to write a highly detailed summary that the user can paste into a NEW conversation with a different AI to resume the task immediately.

The summary MUST:
1. State the overall project/task goal clearly.
2. Outline the progress made so far (e.g. what design decisions were reached, what text was written, or what code structures were designed).
3. Provide the exact code or text snippets that were finalized, or a reference to them if they are too long.
4. Detail the immediate next step to be taken.

Begin the summary with exactly this sentence: "Here is the context and progress from my previous session with ${source || 'another AI'} so we can continue the task without interruption:"

[CHAT TRANSCRIPT]
${transcript}
[END CHAT TRANSCRIPT]

Write the summary now:`;

  return handleAgentQuery({
    prompt: prompt,
    pageContext: null,
    chatHistory: []
  });
}

// Call DeepSeek Chat Endpoint (OpenAI Compatible)
async function callDeepSeekAPI(prompt, pageContext, chatHistory, modelName, apiKey, systemPrompt) {
  const url = "https://api.deepseek.com/chat/completions";
  
  const messages = [
    { role: "system", content: systemPrompt }
  ];

  // Insert context from webpage
  if (pageContext && pageContext.content) {
    messages.push({
      role: "system",
      content: `Here is the current webpage content you are discussing with the user:\nTitle: ${pageContext.title}\nURL: ${pageContext.url}\nContent:\n${pageContext.content}`
    });
  }

  // Format chat history (alternating user/assistant)
  if (chatHistory && chatHistory.length > 0) {
    chatHistory.forEach(msg => {
      messages.push({ 
        role: msg.role === 'assistant' ? 'assistant' : 'user', 
        content: msg.content 
      });
    });
  }

  // Add user prompt
  messages.push({ role: "user", content: prompt });

  const payload = {
    model: modelName || "deepseek-chat",
    messages: messages,
    temperature: 0.4
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || errorData.message || response.statusText;
    throw new Error(`DeepSeek API Error: ${message}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Generate Mock Response for Simulated Mode
function generateMockResponse(prompt, pageContext) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lowerPrompt = prompt.toLowerCase();
      const pageTitle = pageContext ? pageContext.title : "Unknown Page";
      
      if (lowerPrompt.includes("migration assistant") || lowerPrompt.includes("previous session")) {
        resolve(`Here is the context and progress from my previous session with Gemini so we can continue the task without interruption:

* **Goal:** Create a Chromium extension called 'IA Agent' for browser task migration.
* **Progress:** Established the Manifest V3 structure, designed a premium dark glassmorphic popup, and implemented API integrations.
* **Current State:** The files are written and the basic logic works. We simplified it to use DeepSeek API exclusively.
* **Next Step:** Perform manual extension installation and complete end-to-end user testing.`);
      } else if (lowerPrompt.includes("summarize") || lowerPrompt === "summarize this webpage") {
        resolve(`### 📝 Page Summary for: *${pageTitle}*\n\nHere is a simulated summary of the webpage:\n\n1. **Core Subject:** This page appears to be titled **"${pageTitle}"**.\n2. **Clean Scraping:** I extracted the clean text from this tab successfully.\n3. **Key Highlights:**\n   - This is a preview of the **IA Agent** in action.\n   - Currently operating in **Simulated Mock Model** mode.\n   - Once you add a real API key in the settings, this extension will generate live summaries using DeepSeek API!\n\n*Feel free to ask questions about details on this page or change settings.*`);
      } else {
        resolve(`🤖 **IA Agent (DeepSeek Simulated Mode)**\n\nI received your question: *"${prompt}"*\n\nSince no active API Key is entered in settings, I am responding in **Simulated Mode**. To get live DeepSeek responses, please configure your API key in Settings.`);
      }
    }, 1000);
  });
}
