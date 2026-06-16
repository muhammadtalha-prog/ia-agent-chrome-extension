// Background service worker for IA Agent
const activeControllers = new Map();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "queryAgent") {
    handleAgentQuery(request)
      .then(response => sendResponse({ success: true, data: response, requestId: request.requestId }))
      .catch(error => sendResponse({ success: false, error: error.message, requestId: request.requestId }));
    return true; // Keep channel open
  }

  if (request.action === "summarizeTranscriptForTransfer") {
    handleSummarizeTranscript(request)
      .then(response => sendResponse({ success: true, data: response, requestId: request.requestId }))
      .catch(error => sendResponse({ success: false, error: error.message, requestId: request.requestId }));
    return true; // Keep channel open
  }

  if (request.action === "cancelQuery") {
    const reqId = request.requestId;
    if (reqId && activeControllers.has(reqId)) {
      activeControllers.get(reqId).abort();
      activeControllers.delete(reqId);
    }
    sendResponse({ success: true, requestId: reqId });
    return true;
  }
});

// Orchestrates requests using API/Mock providers
async function handleAgentQuery(request) {
  const { prompt, pageContext, chatHistory, requestId } = request;

  // Cancel any existing request with the same ID before starting a new one
  if (requestId && activeControllers.has(requestId)) {
    activeControllers.get(requestId).abort();
    activeControllers.delete(requestId);
  }

  const controller = new AbortController();
  const signal = controller.signal;
  if (requestId) {
    activeControllers.set(requestId, controller);
  }

  // Retrieve settings
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get([
      'apiKey',
      'apiUrl',
      'modelName',
      'systemPrompt'
    ], (items) => {
      resolve(items);
    });
  });

  let apiKey = settings.apiKey !== undefined ? settings.apiKey : '';
  let apiUrl = settings.apiUrl || 'https://api.x.ai/v1/chat/completions';
  let modelName = settings.modelName || 'grok-2-1212';
  
  // Smart Auto-Routing: If API Key is Groq format (gsk_...) but URL is configured for xAI/DeepSeek, route to Groq
  if (apiKey.startsWith('gsk_') && (apiUrl.includes('api.x.ai') || apiUrl.includes('api.deepseek.com'))) {
    apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    modelName = 'llama-3.3-70b-versatile';
  }

  const systemPrompt = settings.systemPrompt || "You are IA Agent, a highly capable and professional browser intelligence assistant. Analyze webpage content and provide clear, structured, and helpful responses.";

  const activeKey = apiKey;

  // If still no key, fallback to simulated mock responses
  if (!activeKey) {
    return generateMockResponse(prompt, pageContext, signal);
  }

  // Setup 30-second timeout for the API call
  const timeoutId = setTimeout(() => {
    if (requestId && activeControllers.has(requestId)) {
      activeControllers.get(requestId).abort();
    }
  }, 30000);

  try {
    const result = await callDeepSeekAPI(prompt, pageContext, chatHistory, modelName, activeKey, systemPrompt, apiUrl, signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Request timed out (30 seconds limit reached) or was cancelled.");
    }
    throw error;
  } finally {
    // Clear controller from map
    if (requestId) {
      activeControllers.delete(requestId);
    }
  }
}

// Generates task context summary to copy/paste to new tab
async function handleSummarizeTranscript(request) {
  const { transcript, source, requestId } = request;
  
  const prompt = `Below is a chat transcript between a user and an AI assistant on the platform "${source || 'another AI'}".
Your job is to generate a highly professional, comprehensive, and structured migration summary designed to be pasted into a NEW session with another AI assistant. This summary must act as a perfect bridge, transferring all necessary context, active directives, finalized assets, and upcoming plans so work can resume immediately without loss of momentum.

The summary MUST follow this format:

1. **Start with this exact opening sentence**:
"Here is the context and progress from my previous session with ${source || 'another AI'} so we can continue the task without interruption:"

2. **Project / Task Overview**:
   - Clear definition of the core objective and final goal of this project.
   - Core specifications, constraints, technology stack, and architecture decisions.

3. **Current Progress & Accomplishments**:
   - Step-by-step summary of what has been implemented so far.
   - List of design decisions, patterns, or copy that were agreed upon.

4. **Finalized Code & Text Snippets (Critical)**:
   - Provide the exact code templates, configuration files, text scripts, or HTML structures that have been finalized.
   - Do NOT abbreviate or truncate code blocks. Provide them completely so they can be reused directly.

5. **Active Constraints & Instructions**:
   - Specify any rules, guidelines, code styling patterns, or limitations established during the chat session.

6. **Next Immediate Actions**:
   - A sequential TODO list for the next phase of work.
   - The exact next step the assistant should take right now.

[CHAT TRANSCRIPT]
${transcript}
[END CHAT TRANSCRIPT]

Analyze the transcript, synthesize the details thoroughly, and generate the migration summary now:`;

  return handleAgentQuery({
    prompt: prompt,
    pageContext: null,
    chatHistory: [],
    requestId: requestId
  });
}

// Call API completions Endpoint (OpenAI Compatible)
async function callDeepSeekAPI(prompt, pageContext, chatHistory, modelName, apiKey, systemPrompt, apiUrl, signal) {
  let url = apiUrl || "https://api.x.ai/v1/chat/completions";
  
  // Sanitize API URL: strip trailing slashes and collapse duplicate path slashes (//) while keeping protocol selector (://)
  let proto = "";
  let path = url;
  const protoMatch = url.match(/^https?:\/\//i);
  if (protoMatch) {
    proto = protoMatch[0];
    path = url.substring(proto.length);
  }
  path = path.replace(/\/+/g, '/');
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  url = proto + path;
  
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
    body: JSON.stringify(payload),
    signal: signal
  });

  if (!response.ok) {
    let message = "";
    try {
      const errorData = await response.json();
      message = errorData.error?.message || errorData.message || response.statusText;
    } catch (e) {
      const rawText = await response.text().catch(() => "");
      message = rawText.substring(0, 200).trim() || response.statusText;
    }
    
    // Enhanced error messages for common issues
    if (response.status === 401) {
      message = "🔑 Invalid API Key. Your key appears to be incorrect or expired. Please check your API key in Settings and try again.";
    } else if (response.status === 402 || message.toLowerCase().includes("insufficient balance")) {
      message = "💳 Insufficient Balance. Your API key has run out of funds. Please add funds to your account or switch providers in Settings.";
    } else if (response.status === 429) {
      message = "⏳ Rate Limit Exceeded. You've made too many requests. Please wait a moment and try again.";
    } else if (response.status === 500) {
      message = "🔧 API Server Error. The provider's service is experiencing issues. Please try again later or switch providers.";
    }
    
    throw new Error(`API Error (${response.status}): ${message}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Generate Mock Response for Simulated Mode
function generateMockResponse(prompt, pageContext, signal) {
  return new Promise((resolve, reject) => {
    let isSettled = false;

    // Check if already aborted before starting
    if (signal && signal.aborted) {
      isSettled = true;
      return reject(new Error("Request timed out (30 seconds limit reached) or was cancelled."));
    }

    const timeoutId = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      
      const lowerPrompt = prompt.toLowerCase();
      const pageTitle = pageContext ? pageContext.title : "Unknown Page";
      
      if (lowerPrompt.includes("migration assistant") || lowerPrompt.includes("previous session")) {
        resolve(`Here is the context and progress from my previous session with Gemini so we can continue the task without interruption:

* **Goal:** Create a Chromium extension called 'IA Agent' for browser task migration.
* **Progress:** Established the Manifest V3 structure, designed a premium dark glassmorphic popup, and implemented API integrations.
* **Current State:** The files are written and the basic logic works. We simplified it to use Grok API exclusively.
* **Next Step:** Perform manual extension installation and complete end-to-end user testing.`);
      } else if (lowerPrompt.includes("summarize") || lowerPrompt === "summarize this webpage") {
        resolve(`### 📝 Page Summary for: *${pageTitle}*\n\nHere is a simulated summary of the webpage:\n\n1. **Core Subject:** This page appears to be titled **"${pageTitle}"**.\n2. **Clean Scraping:** I extracted the clean text from this tab successfully.\n3. **Key Highlights:**\n   - This is a preview of the **IA Agent** in action.\n   - Currently operating in **Simulated Mock Model** mode.\n   - Once you add a real API key in the settings, this extension will generate live summaries using Grok API!\n\n*Feel free to ask questions about details on this page or change settings.*`);
      } else {
        resolve(`🤖 **IA Agent (Grok Simulated Mode)**\n\nI received your question: *"${prompt}"*\n\nSince no active API Key is entered in settings, I am responding in **Simulated Mode**. To get live Grok responses, please configure your API key in Settings.`);
      }
    }, 1000);

    if (signal) {
      signal.addEventListener('abort', () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);
        reject(new Error("Request timed out (30 seconds limit reached) or was cancelled."));
      });
    }
  });
}
