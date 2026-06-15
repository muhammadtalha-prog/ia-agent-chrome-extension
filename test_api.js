/**
 * IA Agent - Local DeepSeek / OpenAI Compatible API Test Runner
 * Run this in your terminal to test DeepSeek or other endpoints:
 *   node test_api.js
 */

// Ensure global fetch is supported (Node 18+)
if (typeof fetch === 'undefined') {
  console.error("❌ Node.js 18+ is required to run this script because it relies on global fetch.");
  process.exit(1);
}

// ANSI Color codes for pretty terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Call API completions endpoint
async function testAPI(apiKey, apiUrl, model, prompt) {
  const url = apiUrl || "https://api.deepseek.com/chat/completions";
  const modelName = model || "deepseek-chat";
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  
  const payload = {
    model: modelName,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4
  };

  console.log(`\n${colors.cyan}Calling API (${modelName}) at ${url}...${colors.reset}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for testing

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errJson = await response.json();
        errorDetails = JSON.stringify(errJson);
      } catch (e) {
        errorDetails = await response.text().catch(() => response.statusText);
      }
      throw new Error(`HTTP Error ${response.status}: ${errorDetails}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response content found.";
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Request timed out (15 seconds limit reached).");
    }
    throw error;
  }
}

// Main Runner
async function main() {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
  const API_URL = process.env.API_URL || "https://api.deepseek.com/chat/completions";
  const MODEL_NAME = process.env.MODEL_NAME || "deepseek-chat";
  const testPrompt = "Translate 'Intelligent Assistant Agent' into French, German, and Spanish, in a clean list.";

  console.log(`${colors.bright}${colors.blue}==================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}       IA Agent Local API Completions Test Runner  ${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}==================================================${colors.reset}`);

  // Validate key format
  if (!DEEPSEEK_API_KEY) {
    console.error(`\n${colors.yellow}⚠️  API Key is empty. Please set the DEEPSEEK_API_KEY environment variable.${colors.reset}`);
    console.log(`   Example (Windows PowerShell): $env:DEEPSEEK_API_KEY="sk-..."`);
    console.log(`   Example (Linux/Mac): export DEEPSEEK_API_KEY="sk-..."`);
    console.log(`\n   You can also specify API_URL and MODEL_NAME env variables to test other endpoints (e.g. Groq, Grok).`);
    console.log(`\n${colors.bright}${colors.blue}==================================================${colors.reset}`);
    return;
  }

  if (!DEEPSEEK_API_KEY.startsWith("sk-")) {
    console.warn(`\n${colors.yellow}⚠️  Warning: API Key does not start with standard "sk-" prefix.${colors.reset}`);
    console.warn(`   Double-check that the key is correct for your provider.`);
  }

  try {
    const response = await testAPI(DEEPSEEK_API_KEY, API_URL, MODEL_NAME, testPrompt);
    console.log(`\n${colors.green}✅ Success! Response:${colors.reset}`);
    console.log(`${colors.bright}--------------------------------------------------${colors.reset}`);
    console.log(response);
    console.log(`${colors.bright}--------------------------------------------------${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}❌ Test Failed!${colors.reset}`);
    console.error(`   ${colors.bright}Error details:${colors.reset} ${error.message}`);
    
    if (error.message.includes("401")) {
      console.error(`   ${colors.yellow}Hint: Your API key appears to be invalid or unauthorized for this endpoint.${colors.reset}`);
    } else if (error.message.includes("402") || error.message.includes("balance")) {
      console.error(`   ${colors.yellow}Hint: Insufficient balance. Please fund your provider account.${colors.reset}`);
    }
  }
  
  console.log(`\n${colors.bright}${colors.blue}==================================================${colors.reset}`);
}

main();
