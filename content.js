// Content script for IA Agent extension
// Extracts webpage text and details contextually and safely.

function smartTruncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  
  const searchRange = 300;
  const truncateAt = maxChars;
  let boundaryIdx = -1;
  
  // Look for code block boundary: ```
  const codeBlockIdx = text.lastIndexOf("```", truncateAt);
  if (codeBlockIdx !== -1 && codeBlockIdx > truncateAt - searchRange) {
    boundaryIdx = codeBlockIdx + 3;
  }
  
  // Look for paragraph boundary: \n\n or \n
  if (boundaryIdx === -1) {
    const paraIdx = text.lastIndexOf("\n\n", truncateAt);
    if (paraIdx !== -1 && paraIdx > truncateAt - searchRange) {
      boundaryIdx = paraIdx;
    }
  }
  
  if (boundaryIdx === -1) {
    const newlineIdx = text.lastIndexOf("\n", truncateAt);
    if (newlineIdx !== -1 && newlineIdx > truncateAt - searchRange) {
      boundaryIdx = newlineIdx;
    }
  }
  
  // Look for sentence boundary: . or ? or ! followed by space
  if (boundaryIdx === -1) {
    const sentencePatterns = [". ", "? ", "! "];
    let bestIdx = -1;
    sentencePatterns.forEach(pattern => {
      const idx = text.lastIndexOf(pattern, truncateAt);
      if (idx !== -1 && idx > truncateAt - searchRange && idx > bestIdx) {
        bestIdx = idx + 1; // include the punctuation
      }
    });
    if (bestIdx !== -1) {
      boundaryIdx = bestIdx;
    }
  }
  
  // Fallback to word boundary (space)
  if (boundaryIdx === -1) {
    const spaceIdx = text.lastIndexOf(" ", truncateAt);
    if (spaceIdx !== -1 && spaceIdx > truncateAt - 100) {
      boundaryIdx = spaceIdx;
    }
  }
  
  const finalTruncateIdx = boundaryIdx !== -1 ? boundaryIdx : truncateAt;
  return text.substring(0, finalTruncateIdx).trim() + "\n\n[Content truncated for length]";
}

const skipPatterns = /(menu|nav|footer|header|sidebar|widget|ad-container|cookie|modal|popup|share)/i;

function getCleanedTextContent(maxChars) {
  const maxLimit = maxChars || 15000;
  const bufferLimit = maxLimit + 1000;

  // Priority containers: article, main, then fallback to body
  const prioritySelectors = ['article', 'main', '#content', '.content', 'body'];
  let rootElement = document.body;
  
  for (const selector of prioritySelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 200) {
      rootElement = el;
      break;
    }
  }

  // Avoid elements that don't contain meaningful user content
  const skipTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'NAV', 'FOOTER', 'HEADER', 
    'ASIDE', 'AUDIO', 'VIDEO', 'CANVAS', 'SELECT', 'OPTION', 'BUTTON'
  ]);
  
  const textNodes = [];
  let totalLength = 0;

  const treeWalker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Exit early if we already have enough text
        if (totalLength >= bufferLimit) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        if (skipTags.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        let current = parent;
        let depth = 0;
        while (current && current !== rootElement && depth < 4) {
          if (skipTags.has(current.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          const className = String(current.className || "");
          const idName = String(current.id || "");
          
          if (skipPatterns.test(className) || skipPatterns.test(idName)) {
            return NodeFilter.FILTER_REJECT;
          }
          current = current.parentElement;
          depth++;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  let iterations = 0;
  const maxIterations = 5000;

  // Reordered conditions to short-circuit before nextNode() gets called
  while (totalLength < bufferLimit && iterations < maxIterations && (node = treeWalker.nextNode())) {
    iterations++;
    const text = node.nodeValue.trim();
    if (text) {
      const cleanedText = text.replace(/\s+/g, ' ');
      textNodes.push(cleanedText);
      totalLength += cleanedText.length + 1;
    }
  }

  let combinedText = textNodes.join(' ').trim();
  
  if (combinedText.length > maxLimit || iterations >= maxIterations) {
    combinedText = smartTruncate(combinedText, maxLimit);
  }

  return combinedText;
}

// Listen for messages from the popup or background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    chrome.storage.local.get(['maxCharacters'], (items) => {
      const maxChars = items.maxCharacters || 15000;
      try {
        const pageInfo = {
          title: document.title,
          url: window.location.href,
          content: getCleanedTextContent(maxChars),
          description: document.querySelector('meta[name="description"]')?.content || ""
        };
        sendResponse({ success: true, data: pageInfo });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true; // Keep message channel open for async response
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
    // Stable selectors first, then autogenerated hashes as fallback
    const elements = document.querySelectorAll('div.ds-markdown, [class*="ds-markdown"], [data-testid="chat-message"], [class*="user-message"], [class*="userMessage"], .fbb737a4, ._9663006');
    elements.forEach(node => {
      const isAI = node.classList.contains('ds-markdown') || 
                   node.querySelector('.ds-markdown') || 
                   node.querySelector('[class*="ds-markdown"]') ||
                   node.getAttribute('data-testid') === 'assistant-message';
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
  } else if (url.includes("streamlit.app") || url.includes("localhost:8501")) {
    source = "StreamlitChat";
    const elements = document.querySelectorAll('[data-testid="stChatMessage"]');
    elements.forEach(node => {
      const contentNode = node.querySelector('[data-testid="stChatMessageContent"]');
      const content = contentNode ? contentNode.innerText || contentNode.textContent : (node.innerText || node.textContent);
      
      const avatarNode = node.querySelector('[data-testid="stAvatar"]');
      let role = 'assistant';
      if (avatarNode) {
        const ariaLabel = avatarNode.getAttribute('aria-label') || "";
        if (ariaLabel.toLowerCase().includes('user') || avatarNode.innerHTML.toLowerCase().includes('user')) {
          role = 'user';
        }
      }
      if (content) {
        messages.push({ role, content: content.trim() });
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
  } else if (url.includes("streamlit.app") || url.includes("localhost:8501")) {
    element = document.querySelector('textarea[data-testid="stChatInputTextArea"]') || document.querySelector('textarea');
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
