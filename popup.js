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

  function getAIPageName(url) {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("chatgpt.com")) return "ChatGPT";
    if (lowerUrl.includes("gemini.google.com")) return "Gemini";
    if (lowerUrl.includes("claude.ai")) return "Claude";
    if (lowerUrl.includes("deepseek.com")) return "DeepSeek";
    return null;
  }

  function checkMigrationBanner(currentUrl) {
    chrome.storage.local.get(['migratingSession'], (result) => {
      if (result.migratingSession) {
        const session = result.migratingSession;
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

  // 2. Load Chat History for Active Tab or General
  chrome.storage.local.get(['globalChatHistory'], (result) => {
    if (result.globalChatHistory && result.globalChatHistory.length > 0) {
      chatHistory = result.globalChatHistory;
      welcomeScreen.style.display = 'none';
      renderHistory();
    }
  });

  // Dynamically inject content.js if missing
  function injectContentScript(tabId) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Could not inject content script: ", chrome.runtime.lastError.message);
        setSystemPageMode();
      } else {
        // Retry content pull
        chrome.tabs.sendMessage(tabId, { action: "getPageContent" }, (retryResponse) => {
          if (retryResponse && retryResponse.success) {
            activeTabContext = retryResponse.data;
            statusDot.className = "status-dot";
            statusText.textContent = "Context Active";
          } else {
            setSystemPageMode();
          }
        });
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
    btnCaptureChat.textContent = "Summarizing...";

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
        const loadingBubble = appendLoadingIndicator();
        chatContainer.scrollTop = chatContainer.scrollHeight;

        chrome.runtime.sendMessage({
          action: "summarizeTranscriptForTransfer",
          transcript: transcriptText,
          source: chatData.source
        }, (summaryResponse) => {
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

            chrome.storage.local.set({ migratingSession: session }, () => {
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

  // Migrate context to current page
  btnMigrate.addEventListener('click', () => {
    chrome.storage.local.get(['migratingSession'], (result) => {
      if (!result.migratingSession) {
        migrationBanner.style.display = 'none';
        return;
      }

      const session = result.migratingSession;
      const summary = session.summary;
      
      btnMigrate.disabled = true;
      btnMigrate.textContent = "Injecting...";

      // Copy to Clipboard (backup)
      navigator.clipboard.writeText(summary).then(() => {
        console.log("Summary copied to clipboard");
      }).catch(err => {
        console.warn("Clipboard copy failed: ", err);
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

          chrome.storage.local.remove(['migratingSession'], () => {
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

        chrome.storage.local.remove(['migratingSession'], () => {
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

    // Add user message to UI and history
    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    
    // Save history
    saveHistory();

    // Reset input box
    userInput.value = "";
    userInput.style.height = '24px';

    // Append loading bubble
    const loadingBubble = appendLoadingIndicator();
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Call background service worker to fetch response
    chrome.runtime.sendMessage({
      action: "queryAgent",
      prompt: text,
      pageContext: activeTabContext,
      chatHistory: chatHistory.slice(0, -1) // Send history excluding current message
    }, (response) => {
      // Remove loading indicator
      loadingBubble.remove();

      if (response && response.success) {
        const agentText = response.data;
        appendMessage('agent', agentText);
        chatHistory.push({ role: 'assistant', content: agentText });
        saveHistory();
      } else {
        const errorText = response ? response.error : "Unknown connection error";
        appendMessage('agent', `❌ **Error:** ${errorText}\n\nPlease check your configuration settings.`, true);
      }
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

  // Save history to storage
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

  function appendLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message agent';
    loadingDiv.innerHTML = `
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    chatContainer.appendChild(loadingDiv);
    return loadingDiv;
  }

  function renderHistory() {
    chatHistory.forEach(msg => {
      appendMessage(msg.role === 'assistant' ? 'agent' : 'user', msg.content);
    });
  }

  // Simple clean HTML Markdown parser for extension context
  function formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    
    // Code blocks: ```language ... ```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    
    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${code}</code>`;
    });
    
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Bullet points (split by newline and detect start of line with list markers)
    const lines = html.split('\n');
    let inList = false;
    let listItems = [];
    
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('&amp;middot; ') || trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('&bull; ');
      
      if (isBullet) {
        let content = trimmed;
        if (trimmed.startsWith('- ')) content = trimmed.substring(2);
        else if (trimmed.startsWith('* ')) content = trimmed.substring(2);
        else if (trimmed.startsWith('&amp;middot; ')) content = trimmed.substring(13);
        else if (trimmed.startsWith('&bull; ')) content = trimmed.substring(7);
        
        if (!inList) {
          inList = true;
          return `<ul><li>${content}</li>`;
        }
        return `<li>${content}</li>`;
      } else {
        if (inList) {
          inList = false;
          return `</ul>${line}`;
        }
        return line;
      }
    });

    if (inList) {
      processedLines.push('</ul>');
    }

    html = processedLines.join('\n');
    
    // Paragraph paragraphs (split double newline and wrap in p if not already in ul/pre)
    html = html.split('\n\n').map(paragraph => {
      const trimmed = paragraph.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith('<ul') || trimmed.startsWith('<li') || trimmed.startsWith('<pre') || trimmed.startsWith('</ul')) {
        return paragraph;
      }
      return `<p>${paragraph}</p>`;
    }).join('');

    return html;
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
