# IA Agent - Browser Chat Migration Extension

**IA Agent** is an intelligent browser extension that solves the task migration problem when switching between different generative AI chat interfaces (Gemini, Claude, ChatGPT, etc.). 

If you hit quota limits or credits expiration on one platform (e.g. Gemini), IA Agent captures your active session, generates a comprehensive project summary using the **DeepSeek API**, and automatically injects it into the prompt area of your new target platform (e.g. Claude). You can resume your work immediately without wasting time re-explaining the context, past progress, or code generated so far.

---

## ✨ Features

* **One-Click Capture**: Automatically parses and extracts user/assistant message history from active tabs on ChatGPT, Gemini, and Claude.
* **Smart Context Compilation**: Calls DeepSeek to analyze the conversation and compile a detailed migration context block (Tasks, Progress, Finalized snippets, and Next steps).
* **Automatic Injection**: Locates prompt textareas and rich text editors on target AI domains, focusing and injecting the transition summary automatically.
* **DeepSeek Engine**: Fully integrated with both `deepseek-chat` (standard completions) and `deepseek-reasoner` (deep thinking R1) models.
* **Premium Interface**: Built with an obsidian dark theme, fluid glassmorphic panels, glowing alerts, and subtle micro-animations.
* **Local Test Suite**: Includes a CLI Node script to verify API credentials directly from your terminal.

---

## 🚀 Getting Started

### 1. Installation

Since this is an open-source unpacked extension, you can deploy it directly in your browser:

1. Download or clone this repository to your computer.
2. Open Google Chrome (or any Chromium-based browser).
3. Navigate to **`chrome://extensions`** in your URL bar.
4. Toggle the **Developer mode** switch in the top-right corner to **ON**.
5. Click the **Load unpacked** button in the top-left corner.
6. Select the folder containing this project and click **Select Folder**.
7. Pin **IA Agent** to your extension toolbar.

---

## ⚙️ Configuration

1. Click the **IA Agent** icon in your toolbar, then click the **Settings** gear icon in the top-right corner of the popup.
2. Enter your **DeepSeek API Key** (you can get one from the [DeepSeek Console](https://platform.deepseek.com/)).
3. Select your model:
   * `deepseek-chat` (Fast chat and code generation)
   * `deepseek-reasoner` (Deep thinking reasoning/logic)
4. Customize your **System Prompt** if desired, then click **Save Settings**.
5. *If no API Key is set, the extension will fall back to **Simulated Mode**, allowing you to test the user interface.*

---

## 🛠️ Developer Local API Testing

Before installing the extension, you can test your DeepSeek key in your local node environment:

1. Open a terminal in this directory.
2. Set your environment variables:
   * **Windows (PowerShell)**: `$env:DEEPSEEK_API_KEY="your-deepseek-api-key"`
   * **Mac / Linux**: `export DEEPSEEK_API_KEY="your-deepseek-api-key"`
3. Execute the script:
   ```bash
   node test_api.js
   ```
4. Verify that you receive a successful completion from the DeepSeek endpoint.

---

## 🔒 Security

* **Local Storage**: Your API Key is stored safely on your own machine using Chrome's local storage sandbox.
* **Zero Intermediaries**: All completions requests are made directly from your browser to DeepSeek's endpoints; no third-party servers are involved.
* **No Hardcoded Keys**: Make sure not to commit your actual keys in `test_api.js` or `background.js` when pushing to GitHub. Use the options Settings UI or local environment variables.
