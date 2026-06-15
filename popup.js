document.addEventListener('DOMContentLoaded', () => {
  const chatContainer = document.getElementById('chat-container');
  const welcomeScreen = document.getElementById('welcome-screen');
  const userInput = document.getElementById('user-input');
  const btnSend = document.getElementById('btn-send');
  const btnSettings = document.getElementById('btn-settings');
  const footerSettings = document.getElementById('footer-settings');
  const pageTitleElement = document.getElementById('page-title');
  const btnSummarizePage = document.getElementById('btn-summarize-page');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // New migration elements
  const btnCaptureChat = document.getElementById('btn-capture-chat');
  const migrationBanner = document.getElementById('migration-banner');
  const migrationText = document.getElementById('migration-text');
  const btnMigrate = document.getElementById('btn-migrate');

  let activeTabContext = null;
  let chatHistory = [];
  let activeTab = null;

  // Request ID System to track concurrent/rapid message states
  const activeRequests = new Set();
  const cancelledRequests = new Set();

  function getAIPageName(url) {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("chatgpt.com")) return "ChatGPT";
    if (lowerUrl.includes("gemini.google.com")) return "Gemini";
    if (lowerUrl.includes("claude.ai")) return "Claude";
    if (lowerUrl.includes("deepseek.com")) return "DeepSeek";
    if (lowerUrl.includes("streamlit.app") || lowerUrl.includes("localhost:8501")) return "StreamlitChat";
    return null;
  }

  function checkMigrationBanner(currentUrl) {
    chrome.storage.session.get(['migratingSession'], (result) => {
      if (result.migratingSession) {
        const session = result.migratingSession;
        
        // Auto-expire migration session context after 1 hour (3,600,000 ms)
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - session.timestamp > oneHour) {
          chrome.storage.session.remove(['migratingSession']);
          migrationBanner.style.display = 'none';
          return;
        }

        const currentAI = getAIPageName(currentUrl);
        migrationBanner.style.display = 'flex';
        migrationText.innerHTML = `Context from <strong>${session.source}</strong> is ready.`;

        if (currentAI && currentAI !== session.source) {
          btnMigrate.textContent = `Resume on ${currentAI}`;
        } else {
          btnMigrate.textContent = `Copy Context`;
        }
      } else {
        migrationBanner.style.display = 'none';
      }
    });
  }

  // 1. Initialize Active Tab and Context
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      activeTab = tabs[0];
      const url = activeTab.url || "";
      const currentAI = getAIPageName(url);

      // Check for restricted chrome/system URLs
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
        setSystemPageMode();
        return;
      }

      // Display active tab title
      pageTitleElement.textContent = activeTab.title;
      pageTitleElement.title = activeTab.title;

      // Handle buttons visibility based on page type
      if (currentAI) {
        btnCaptureChat.style.display = 'block';
        btnSummarizePage.style.display = 'none';
      } else {
        btnCaptureChat.style.display = 'none';
        btnSummarizePage.style.display = 'block';
      }

      // Request content from content.js
      chrome.tabs.sendMessage(activeTab.id, { action: "getPageContent" }, (response) => {
        // Handle runtime error or missing script (e.g. page not loaded yet)
        if (chrome.runtime.lastError || !response || !response.success) {
          // Fallback: Inject content script dynamically if not loaded automatically
          injectContentScript(activeTab.id);
        } else {
          activeTabContext = response.data;
          statusDot.className = "status-dot";
          statusText.textContent = "Context Active";
        }
      });

      // Show/hide migration banner
      checkMigrationBanner(url);
    } else {
      pageTitleElement.textContent = "No active tab detected";
      btnSummarizePage.style.display = 'none';
      btnCaptureChat.style.display = 'none';
    }
  });

  // 2. Load Chat History for Active Tab or General (using local storage to persist logs)
  chrome.storage.local.get(['globalChatHistory'], (result) => {
    if (result.globalChatHistory && result.globalChatHistory.length > 0) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      chatHistory = result.globalChatHistory.filter(msg => {
        return !msg.timestamp || msg.timestamp > sevenDaysAgo;
      });
      if (chatHistory.length > 100) {
        chatHistory = chatHistory.slice(-100);
      }
      
      // Update local storage immediately to synchronize filters
      chrome.storage.local.set({ globalChatHistory: chatHistory });
      
      if (chatHistory.length > 0) {
        welcomeScreen.style.display = 'none';
        renderHistory();
      }
    }
  });

  // Dynamically inject content.js if missing and retrieve page content
  function injectContentScript(tabId, retries = 3) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Could not inject content script: ", chrome.runtime.lastError.message);
        setSystemPageMode();
      } else {
        // Wait 150ms before communicating to avoid race condition with listener registration
        setTimeout(() => {
          attemptContentPull(tabId, retries);
        }, 150);
      }
    });
  }

  function attemptContentPull(tabId, retriesLeft) {
    chrome.tabs.sendMessage(tabId, { action: "getPageContent" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        if (retriesLeft > 1) {
          console.log(`Content pull failed. Retrying... (${retriesLeft - 1} left)`);
          setTimeout(() => {
            attemptContentPull(tabId, retriesLeft - 1);
          }, 150);
        } else {
          setSystemPageMode();
        }
      } else {
        activeTabContext = response.data;
        statusDot.className = "status-dot";
        statusText.textContent = "Context Active";
      }
    });
  }

  function setSystemPageMode() {
    pageTitleElement.textContent = "Browser Page (No context)";
    btnSummarizePage.style.display = 'none';
    btnCaptureChat.style.display = 'none';
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Limited Context";
  }

  // 3. Setup Events
  btnSettings.addEventListener('click', openSettings);
  footerSettings.addEventListener('click', openSettings);

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // Suggestion Cards click handler
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.getAttribute('data-action');
      let text = "";
      if (action === 'summarize') {
        text = "Summarize this webpage";
      } else if (action === 'actions') {
        text = "What are the main action items from this page?";
      } else if (action === 'explain') {
        text = "Explain the main topics covered on this page";
      }
      if (text) {
        sendMessage(text);
      }
    });
  });

  btnSummarizePage.addEventListener('click', () => {
    sendMessage("Summarize this webpage");
  });

  // Capture current conversation
  btnCaptureChat.addEventListener('click', () => {
    if (!activeTab) return;
    
    btnCaptureChat.disabled = true;
    btnCaptureChat.textContent = "Scraping...";

    chrome.tabs.sendMessage(activeTab.id, { action: "scrapeChat" }, (response) => {
      if (response && response.success) {
        const chatData = response.data;
        if (!chatData.isStructured && (!chatData.rawText || chatData.rawText.trim().length === 0)) {
          appendMessage('agent', `❌ **Failed to capture:** No conversation content could be extracted from this page. Make sure you have messages visible in your chat.`);
          btnCaptureChat.disabled = false;
          btnCaptureChat.textContent = "Summarize Chat";
          return;
        }

        let transcriptText = "";
        if (chatData.isStructured) {
          transcriptText = chatData.messages.map(m => `${m.role === 'user' ? 'User' : 'AI Assistant'}: ${m.content}`).join('\n\n');
        } else {
          transcriptText = chatData.rawText;
        }

        welcomeScreen.style.display = 'none';
        
        // Setup unique Request ID for this async action
        const requestId = "cap_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const loadingBubble = appendLoadingIndicator(requestId);
        const statusTextEl = loadingBubble.querySelector('.loading-status-text');
        const cancelBtn = loadingBubble.querySelector('.btn-cancel-operation');
        
        statusTextEl.textContent = "Structuring chat elements...";
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        activeRequests.add(requestId);

        let statusTimeoutId = setTimeout(() => {
          if (statusTextEl && statusTextEl.isConnected) {
            statusTextEl.textContent = "Generating summary with API (Est. 5s)...";
          }
        }, 800);

        cancelBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "cancelQuery", requestId: requestId });
          activeRequests.delete(requestId);
          cancelledRequests.add(requestId);
          
          if (statusTimeoutId) {
            clearTimeout(statusTimeoutId);
            statusTimeoutId = null;
          }

          loadingBubble.remove();
          btnCaptureChat.disabled = false;
          btnCaptureChat.textContent = "Summarize Chat";
          appendMessage('agent', `❌ **Summarization cancelled by user.**`, true);
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });

        chrome.runtime.sendMessage({
          action: "summarizeTranscriptForTransfer",
          transcript: transcriptText,
          source: chatData.source,
          requestId: requestId
        }, (summaryResponse) => {
          if (statusTimeoutId) {
            clearTimeout(statusTimeoutId);
            statusTimeoutId = null;
          }

          if (cancelledRequests.has(requestId)) {
            cancelledRequests.delete(requestId);
            return;
          }
          activeRequests.delete(requestId);

          if (!loadingBubble.isConnected) return;
          loadingBubble.remove();
          
          btnCaptureChat.disabled = false;
          btnCaptureChat.textContent = "Summarize Chat";

          if (summaryResponse && summaryResponse.success) {
            const summary = summaryResponse.data;

            const session = {
              source: chatData.source,
              summary: summary,
              timestamp: Date.now()
            };

            chrome.storage.session.set({ migratingSession: session }, () => {
              appendMessage('agent', `✅ **Conversation Summarized & Saved!**\n\nI successfully scraped and summarized the conversation history from **${chatData.source}**.\n\n**Summary:**\n\n${summary}\n\n*Now, open another AI tab (like DeepSeek, Gemini, Claude, or ChatGPT) and click the "Inject Context" button in the top banner.*`);
              checkMigrationBanner(activeTab.url);
            });
          } else {
            const errText = summaryResponse ? summaryResponse.error : "Unknown summarization error";
            appendMessage('agent', `❌ **Summarization Error:** ${errText}\n\nPlease check your AI provider keys in Settings.`, true);
          }
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      } else {
        btnCaptureChat.disabled = false;
        btnCaptureChat.textContent = "Summarize Chat";
        const err = (response && response.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || "Unknown error";
        appendMessage('agent', `❌ **Scraping Error:** ${err}\n\nCould not scrape the chat elements from this webpage. Make sure the page is fully loaded.`);
      }
    });
  });

  // Copy helper with navigator clipboard and fallback
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .catch(err => {
          console.warn("Navigator clipboard write failed. Trying fallback.", err);
          return fallbackCopyToClipboard(text);
        });
    } else {
      return fallbackCopyToClipboard(text);
    }
  }

  function fallbackCopyToClipboard(text) {
    return new Promise((resolve, reject) => {
      let textArea = null;
      try {
        textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        if (successful) {
          resolve();
        } else {
          reject(new Error("Browser blocked copy operation or command returned false."));
        }
      } catch (err) {
        reject(new Error("Fallback copy failed: " + err.message));
      } finally {
        if (textArea && textArea.parentNode) {
          textArea.parentNode.removeChild(textArea);
        }
      }
    });
  }

  // Migrate context to current page
  btnMigrate.addEventListener('click', () => {
    chrome.storage.session.get(['migratingSession'], (result) => {
      if (!result.migratingSession) {
        migrationBanner.style.display = 'none';
        return;
      }

      const session = result.migratingSession;
      const summary = session.summary;
      
      btnMigrate.disabled = true;
      btnMigrate.textContent = "Injecting...";

      // Copy to Clipboard (backup)
      copyToClipboard(summary)
        .then(() => {
          console.log("Summary copied to clipboard");
        })
        .catch(err => {
          console.error("Clipboard copy failed: ", err);
          appendMessage('agent', `⚠️ **Clipboard Copy Failed:** I could not copy the context to your clipboard automatically.\n\n*Error: ${err.message}*\n\n**Please manually select and copy the text below:**\n\n\`\`\`text\n${summary}\n\`\`\``, true);
        });

      // Detect AI page and inject
      const currentAI = getAIPageName(activeTab.url);
      if (currentAI && currentAI !== session.source) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: "injectPrompt",
          text: summary
        }, (injectResponse) => {
          btnMigrate.disabled = false;
          btnMigrate.textContent = "Inject Context";

          chrome.storage.session.remove(['migratingSession'], () => {
            migrationBanner.style.display = 'none';
          });

          if (injectResponse && injectResponse.success && injectResponse.injected) {
            appendMessage('agent', `🚀 **Context Migrated to ${currentAI}!**\n\nI injected the context summary of your previous **${session.source}** session into the chat prompt box.\n\n*(It is also copied to your clipboard as a backup)*`);
          } else {
            appendMessage('agent', `📋 **Context Copied to Clipboard!**\n\nI generated the summary from **${session.source}** but could not auto-inject it. **Please press Ctrl+V** in the chatbox to paste it manually.`);
          }
        });
      } else {
        btnMigrate.disabled = false;
        btnMigrate.textContent = "Inject Context";

        chrome.storage.session.remove(['migratingSession'], () => {
          migrationBanner.style.display = 'none';
        });
        appendMessage('agent', `📋 **Context Copied to Clipboard!**\n\nI copied the context summary of your **${session.source}** session to your clipboard.\n\nYou can now paste it (**Ctrl+V**) manually into the chat box.`);
      }
    });
  });

  // Send Message Logic
  btnSend.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text) {
      sendMessage(text);
    }
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = userInput.value.trim();
      if (text) {
        sendMessage(text);
      }
    }
  });

  // Auto-grow textbox
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight - 6, 80) + 'px';
  });

  // Main sending function
  function sendMessage(text) {
    // Hide welcome screen if present
    welcomeScreen.style.display = 'none';

    // Generate unique Request ID for this specific message query
    const requestId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // Add user message to UI and history
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text, timestamp: Date.now() });
    
    // Save history immediately (reverted to local storage and removed debouncer for consistency)
    saveHistory();

    // Reset input box
    userInput.value = "";
    userInput.style.height = '24px';

    // Append loading bubble associated with Request ID
    const loadingBubble = appendLoadingIndicator(requestId);
    const statusTextEl = loadingBubble.querySelector('.loading-status-text');
    const cancelBtn = loadingBubble.querySelector('.btn-cancel-operation');

    statusTextEl.textContent = "Analyzing context...";
    chatContainer.scrollTop = chatContainer.scrollHeight;

    activeRequests.add(requestId);

    let statusTimeoutId = setTimeout(() => {
      if (statusTextEl && statusTextEl.isConnected) {
        statusTextEl.textContent = "Calling API (Est. 5-10s)...";
      }
    }, 800);

    cancelBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "cancelQuery", requestId: requestId });
      activeRequests.delete(requestId);
      cancelledRequests.add(requestId);
      
      if (statusTimeoutId) {
        clearTimeout(statusTimeoutId);
        statusTimeoutId = null;
      }

      loadingBubble.remove();
      appendMessage('agent', `❌ **Request cancelled by user.**`, true);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });

    // Call background service worker to fetch response
    chrome.runtime.sendMessage({
      action: "queryAgent",
      prompt: text,
      pageContext: activeTabContext,
      chatHistory: chatHistory.slice(0, -1), // Send history excluding current message
      requestId: requestId
    }, (response) => {
      // Clear status timer
      if (statusTimeoutId) {
        clearTimeout(statusTimeoutId);
        statusTimeoutId = null;
      }

      // Ignore if this request was cancelled in the meantime
      if (cancelledRequests.has(requestId)) {
        cancelledRequests.delete(requestId);
        return;
      }
      activeRequests.delete(requestId);

      if (!loadingBubble.isConnected) return;
      loadingBubble.remove();

      if (response && response.success) {
        const agentText = response.data;
        appendMessage('agent', agentText);
        chatHistory.push({ role: 'assistant', content: agentText, timestamp: Date.now() });
        saveHistory();
      } else {
        const errorText = response ? response.error : "Unknown connection error";
        appendMessage('agent', `❌ **Error:** ${errorText}\n\nPlease check your configuration settings.`, true);
      }
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

  // Save history to storage immediately to prevent loss on close
  function saveHistory() {
    chrome.storage.local.set({ globalChatHistory: chatHistory });
  }

  // Message UI Helpers
  function appendMessage(role, text, isError = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    if (role === 'user') {
      msgDiv.textContent = text;
    } else {
      msgDiv.innerHTML = formatMarkdown(text);
      if (isError) {
        msgDiv.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        msgDiv.style.background = 'rgba(239, 68, 68, 0.05)';
        msgDiv.style.color = '#f87171';
      }
    }
    
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function appendLoadingIndicator(requestId) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message agent';
    loadingDiv.dataset.requestId = requestId;
    loadingDiv.innerHTML = `
      <div class="typing-indicator-container">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <span class="loading-status-text">Processing...</span>
        <button class="btn-cancel-operation" title="Cancel request">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    chatContainer.appendChild(loadingDiv);
    return loadingDiv;
  }

  function renderHistory() {
    // Clear DOM of previous messages to prevent duplicate rendering
    const messageElements = chatContainer.querySelectorAll('.message');
    messageElements.forEach(el => el.remove());

    if (chatHistory && chatHistory.length > 0) {
      welcomeScreen.style.display = 'none';
      chatHistory.forEach(msg => {
        appendMessage(msg.role === 'assistant' ? 'agent' : 'user', msg.content);
      });
    } else {
      welcomeScreen.style.display = 'flex';
    }
  }

  // Simple clean HTML Markdown parser in O(N) state machine (no regex O(n^2) complexity)
  function formatMarkdown(text) {
    if (!text) return "";
    let escaped = escapeHtml(text);
    
    const lines = escaped.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeLang = '';
    let codeContent = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Code block check
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          html += `<pre><code class="language-${codeLang}">${codeContent.join('\n')}</code></pre>`;
          inCodeBlock = false;
          codeContent = [];
        } else {
          inCodeBlock = true;
          codeLang = trimmed.substring(3).trim();
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }
      
      // Bullet lists
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('&amp;middot; ') || trimmed.startsWith('&bull; ');
      if (isBullet) {
        let content = trimmed;
        if (trimmed.startsWith('- ')) content = trimmed.substring(2);
        else if (trimmed.startsWith('* ')) content = trimmed.substring(2);
        else if (trimmed.startsWith('&amp;middot; ')) content = trimmed.substring(13);
        else if (trimmed.startsWith('&bull; ')) content = trimmed.substring(7);
        
        content = formatInlineMarkdown(content);
        
        if (!inList) {
          inList = true;
          html += '<ul>';
        }
        html += `<li>${content}</li>`;
        continue;
      } else {
        if (inList) {
          inList = false;
          html += '</ul>';
        }
      }
      
      if (trimmed === '') {
        continue;
      }
      
      const formattedLine = formatInlineMarkdown(line);
      html += `<p>${formattedLine}</p>`;
    }
    
    if (inCodeBlock) {
      html += `<pre><code class="language-${codeLang}">${codeContent.join('\n')}</code></pre>`;
    }
    if (inList) {
      html += '</ul>';
    }
    
    return html;
  }

  function formatInlineMarkdown(text) {
    let result = '';
    let i = 0;
    const len = text.length;
    
    while (i < len) {
      // Bold: **
      if (i + 1 < len && text[i] === '*' && text[i+1] === '*') {
        const endIdx = text.indexOf('**', i + 2);
        if (endIdx !== -1) {
          const inner = text.substring(i + 2, endIdx);
          result += `<strong>${formatInlineMarkdown(inner)}</strong>`;
          i = endIdx + 2;
          continue;
        }
      }
      
      // Italic: *
      if (text[i] === '*') {
        const endIdx = text.indexOf('*', i + 1);
        if (endIdx !== -1 && text[endIdx + 1] !== '*') {
          const inner = text.substring(i + 1, endIdx);
          result += `<em>${formatInlineMarkdown(inner)}</em>`;
          i = endIdx + 1;
          continue;
        }
      }
      
      // Inline code: `
      if (text[i] === '`') {
        const endIdx = text.indexOf('`', i + 1);
        if (endIdx !== -1) {
          const inner = text.substring(i + 1, endIdx);
          result += `<code>${inner}</code>`;
          i = endIdx + 1;
          continue;
        }
      }
      
      result += text[i];
      i++;
    }
    
    return result;
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
