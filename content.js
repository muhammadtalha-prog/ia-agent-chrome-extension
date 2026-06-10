// Content script for IA Agent extension
// Extracts webpage text and details contextually and safely.

function getCleanedTextContent() {
  // Clone body to avoid messing up the live webpage DOM
  const bodyClone = document.body.cloneNode(true);
  
  // Elements to remove from clone to keep only meaningful text
  const selectorsToRemove = [
    'script', 'style', 'noscript', 'iframe', 'svg', 
    'nav', 'footer', 'header', '.footer', '.header', '.nav', '.menu',
    '#footer', '#header', '#nav', '#menu', 'aside', '.sidebar', '#sidebar'
  ];
  
  selectorsToRemove.forEach(selector => {
    const elements = bodyClone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // Get inner text and clean up whitespace
  let text = bodyClone.innerText || bodyClone.textContent || "";
  text = text.replace(/\s+/g, ' ').trim();
  
  // Truncate to a safe token limit (approx. 15,000 chars)
  const maxChars = 15000;
  if (text.length > maxChars) {
    text = text.substring(0, maxChars) + "\n\n[Content truncated for length]";
  }
  
  return text;
}

// Listen for messages from the popup or background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    try {
      const pageInfo = {
        title: document.title,
        url: window.location.href,
        content: getCleanedTextContent(),
        description: document.querySelector('meta[name="description"]')?.content || ""
      };
      sendResponse({ success: true, data: pageInfo });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "scrapeChat") {
    try {
      const chatData = scrapeChatConversation();
      sendResponse({ success: true, data: chatData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === "injectPrompt") {
    try {
      const success = injectTextIntoPromptBox(request.text);
      sendResponse({ success: true, injected: success });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep message channel open for async response
});

// Parses and scrapes active conversations on common AI chat pages
function scrapeChatConversation() {
  const url = window.location.href.toLowerCase();
  let source = "AI Chat";
  const messages = [];

  if (url.includes("chatgpt.com")) {
    source = "ChatGPT";
    const messageNodes = document.querySelectorAll('div[data-message-author-role]');
    messageNodes.forEach(node => {
      const role = node.getAttribute('data-message-author-role');
      const content = node.innerText || node.textContent;
      if (content && (role === 'user' || role === 'assistant')) {
        messages.push({ role, content: content.trim() });
      }
    });
  } else if (url.includes("gemini.google.com")) {
    source = "Gemini";
    // Gemini user query vs assistant response selectors
    const elements = document.querySelectorAll('.query-text, message-content, .model-response');
    elements.forEach(node => {
      const isUser = node.classList.contains('query-text');
      const role = isUser ? 'user' : 'assistant';
      const content = node.innerText || node.textContent;
      if (content) {
        messages.push({ role, content: content.trim() });
      }
    });
  } else if (url.includes("claude.ai")) {
    source = "Claude";
    // Claude chat bubble containers
    const elements = document.querySelectorAll('div[data-testid="user-message"], div.font-claude-message, .chat-message');
    elements.forEach(node => {
      const isUser = node.getAttribute('data-testid') === 'user-message' || node.classList.contains('user-message');
      const role = isUser ? 'user' : 'assistant';
      const content = node.innerText || node.textContent;
      if (content) {
        messages.push({ role, content: content.trim() });
      }
    });
  } else if (url.includes("deepseek.com")) {
    source = "DeepSeek";
    // DeepSeek chat containers: 
    // AI responses are in div.ds-markdown or class containing ds-markdown
    // User responses are in div.fbb737a4, ._9663006, or standard divs that represent user queries
    const elements = document.querySelectorAll('div.ds-markdown, .fbb737a4, ._9663006, [class*="userMessage"], [class*="user-message"]');
    elements.forEach(node => {
      const isAI = node.classList.contains('ds-markdown') || node.querySelector('.ds-markdown');
      const role = isAI ? 'assistant' : 'user';
      const content = node.innerText || node.textContent;
      if (content) {
        const trimmed = content.trim();
        if (trimmed.length > 0) {
          // Avoid duplicate entries
          if (role === 'user' && messages.some(m => m.role === 'user' && m.content === trimmed)) {
            return;
          }
          messages.push({ role, content: trimmed });
        }
      }
    });
  }

  // Fallback: If we couldn't parse structured bubbles, scrape raw text of major content areas
  if (messages.length === 0) {
    const mainContainers = document.querySelectorAll('main, article, .chat-container, #chat-container, [role="presentation"]');
    let rawText = "";
    mainContainers.forEach(container => {
      rawText += container.innerText + "\n";
    });
    
    if (rawText.trim().length > 100) {
      return {
        source,
        isStructured: false,
        rawText: rawText.substring(0, 15000)
      };
    }
  }

  return {
    source,
    isStructured: messages.length > 0,
    messages: messages
  };
}

// Injects the context summary into target text area dynamically
function injectTextIntoPromptBox(text) {
  const url = window.location.href.toLowerCase();
  let element = null;

  if (url.includes("chatgpt.com")) {
    element = document.querySelector('#prompt-textarea');
  } else if (url.includes("claude.ai")) {
    element = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
  } else if (url.includes("gemini.google.com")) {
    element = document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
  } else if (url.includes("deepseek.com")) {
    element = document.querySelector('#chat-input') || document.querySelector('textarea');
  }

  // Fallback selector
  if (!element) {
    element = document.querySelector('textarea') || 
              document.querySelector('div[contenteditable="true"]') ||
              document.querySelector('input[type="text"]');
  }

  if (element) {
    element.focus();
    
    if (element.tagName === 'DIV' && element.getAttribute('contenteditable') === 'true') {
      element.innerHTML = "";
      const p = document.createElement('p');
      p.innerText = text;
      element.appendChild(p);
      
      // Dispatch input events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Selection focus setup
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (e) {
        console.warn("Caret focus warning: ", e);
      }
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    try {
      element.style.height = 'auto';
      element.style.height = element.scrollHeight + 'px';
    } catch (e) {}
    
    return true;
  }
  
  return false;
}
