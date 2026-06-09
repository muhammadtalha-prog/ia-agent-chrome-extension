/**
 * IA Agent - Local DeepSeek API Test Runner
 * Run this in your terminal to test DeepSeek API:
 *   node test_api.js
 */

const https = require('https');

// Helper to make POST requests using node https module
function postRequest(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Call DeepSeek API
async function testDeepSeek(apiKey, prompt) {
  const model = "deepseek-chat";
  const url = "https://api.deepseek.com/chat/completions";
  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };
  const payload = {
    model: model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4
  };

  console.log(`\nCalling DeepSeek API (${model})...`);
  const data = await postRequest(url, headers, payload);
  return data.choices?.[0]?.message?.content || "No response";
}

// Main Runner
async function main() {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "YOUR_DEEPSEEK_KEY";
  const testPrompt = "Translate 'Intelligent Assistant Agent' into French, German, and Spanish, in a clean list.";

  console.log("==================================================");
  console.log("       IA Agent Local DeepSeek API Test Runner     ");
  console.log("==================================================");

  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== "YOUR_DEEPSEEK_KEY" && DEEPSEEK_API_KEY !== "") {
    try {
      const response = await testDeepSeek(DEEPSEEK_API_KEY, testPrompt);
      console.log("\n--- DeepSeek Response ---");
      console.log(response);
    } catch (error) {
      console.error("\n❌ DeepSeek Error:", error.message);
    }
  } else {
    console.log("\n⚠️ DeepSeek Key not set. Set DEEPSEEK_API_KEY or edit the script to test.");
  }
  
  console.log("\n==================================================");
}

main();
