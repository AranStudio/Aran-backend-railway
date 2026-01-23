// test/generate.test.js
/**
 * Test script for /api/generate endpoint
 * 
 * Run with: node test/generate.test.js
 * 
 * For actual API tests (requires OPENAI_API_KEY):
 *   OPENAI_API_KEY=sk-xxx node test/generate.test.js --live
 */

const TEST_API_URL = process.env.TEST_API_URL || "http://localhost:8080";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================
// UNIT TESTS (no server required)
// ============================================

function testJsonParsing() {
  log("\n📋 Testing JSON Parsing Logic...", "cyan");
  
  // Simulate the safeJsonParse function from generateJson
  function safeJsonParse(text) {
    if (!text || typeof text !== "string") return null;
    
    try {
      return JSON.parse(text.trim());
    } catch {
      // Try to extract JSON from markdown or extra text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Fall through
        }
      }
      return null;
    }
  }

  const testCases = [
    {
      name: "Clean JSON",
      input: '{"title":"Test","beats":[{"order":1,"title":"Beat 1","text":"Content"}]}',
      expectValid: true,
    },
    {
      name: "JSON with whitespace",
      input: '  {"title":"Test","beats":[]}  ',
      expectValid: true,
    },
    {
      name: "JSON with markdown code fence",
      input: '```json\n{"title":"Test","beats":[]}\n```',
      expectValid: true,
    },
    {
      name: "JSON with extra text before",
      input: 'Here is the JSON:\n{"title":"Test","beats":[]}',
      expectValid: true,
    },
    {
      name: "JSON with extra text after",
      input: '{"title":"Test","beats":[]}\nI hope this helps!',
      expectValid: true,
    },
    {
      name: "Invalid JSON",
      input: '{title: "no quotes"}',
      expectValid: false,
    },
    {
      name: "Empty string",
      input: "",
      expectValid: false,
    },
    {
      name: "Nested JSON extraction",
      input: 'Some text {"nested": {"title":"Deep","beats":[]}} more text',
      expectValid: true, // Should extract the outer JSON object
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = safeJsonParse(tc.input);
    const isValid = result !== null;
    
    if (isValid === tc.expectValid) {
      log(`  ✅ ${tc.name}: ${tc.expectValid ? "parsed" : "rejected"} as expected`, "green");
      passed++;
    } else {
      log(`  ❌ ${tc.name}: expected ${tc.expectValid ? "valid" : "invalid"}, got ${isValid ? "valid" : "invalid"}`, "red");
      failed++;
    }
  }

  log(`\n  JSON Parsing: ${passed}/${passed + failed} tests passed`, passed === passed + failed ? "green" : "red");
  return failed === 0;
}

function testBeatNormalization() {
  log("\n📋 Testing Beat Normalization Logic...", "cyan");
  
  function normalizeBeats(rawBeats) {
    if (!Array.isArray(rawBeats)) return [];
    
    return rawBeats
      .map((beat, idx) => {
        if (typeof beat === "string") {
          return {
            order: idx + 1,
            title: `Beat ${idx + 1}`,
            text: beat.trim(),
          };
        }
        if (typeof beat === "object" && beat !== null) {
          return {
            order: typeof beat.order === "number" ? beat.order : idx + 1,
            title: typeof beat.title === "string" ? beat.title.trim() : `Beat ${idx + 1}`,
            text: typeof beat.text === "string" ? beat.text.trim() : String(beat.text || beat.description || ""),
          };
        }
        return null;
      })
      .filter((b) => b !== null && b.text);
  }

  const testCases = [
    {
      name: "String beats (backwards compat)",
      input: ["First beat", "Second beat", "Third beat"],
      expectLength: 3,
      expectFirstOrder: 1,
    },
    {
      name: "Object beats with all fields",
      input: [
        { order: 1, title: "Opening", text: "The story begins" },
        { order: 2, title: "Rising", text: "Tension builds" },
      ],
      expectLength: 2,
      expectFirstTitle: "Opening",
    },
    {
      name: "Mixed string and object beats",
      input: [
        { order: 1, title: "Opening", text: "Start" },
        "Middle beat",
        { order: 3, title: "End", text: "Finish" },
      ],
      expectLength: 3,
    },
    {
      name: "Object with description instead of text",
      input: [{ order: 1, title: "Test", description: "Using description field" }],
      expectLength: 1,
      expectText: "Using description field",
    },
    {
      name: "Empty beats filtered out",
      input: ["Valid beat", "", null, { text: "" }, "Another valid"],
      expectLength: 2,
    },
    {
      name: "Non-array input",
      input: "not an array",
      expectLength: 0,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = normalizeBeats(tc.input);
    let testPassed = true;
    let failReason = "";

    if (tc.expectLength !== undefined && result.length !== tc.expectLength) {
      testPassed = false;
      failReason = `expected length ${tc.expectLength}, got ${result.length}`;
    }
    if (tc.expectFirstOrder !== undefined && result[0]?.order !== tc.expectFirstOrder) {
      testPassed = false;
      failReason = `expected first order ${tc.expectFirstOrder}, got ${result[0]?.order}`;
    }
    if (tc.expectFirstTitle !== undefined && result[0]?.title !== tc.expectFirstTitle) {
      testPassed = false;
      failReason = `expected first title ${tc.expectFirstTitle}, got ${result[0]?.title}`;
    }
    if (tc.expectText !== undefined && result[0]?.text !== tc.expectText) {
      testPassed = false;
      failReason = `expected text "${tc.expectText}", got "${result[0]?.text}"`;
    }

    if (testPassed) {
      log(`  ✅ ${tc.name}`, "green");
      passed++;
    } else {
      log(`  ❌ ${tc.name}: ${failReason}`, "red");
      failed++;
    }
  }

  log(`\n  Beat Normalization: ${passed}/${passed + failed} tests passed`, passed === passed + failed ? "green" : "red");
  return failed === 0;
}

function testResponseShape() {
  log("\n📋 Testing Expected Response Shape...", "cyan");
  
  // Expected shape from generate.js
  const expectedShape = {
    title: "string",
    tagline: "string",
    beats: [{ order: "number", title: "string", text: "string" }],
    toneImagePrompt: "string",
    story_type: "string",
  };

  log("  Expected /api/generate response shape:", "reset");
  log(`  ${JSON.stringify(expectedShape, null, 2).split('\n').join('\n  ')}`, "reset");
  log("  ✅ Response shape documented", "green");
  return true;
}

// ============================================
// INTEGRATION TESTS (requires running server)
// ============================================

async function testValidation() {
  log("\n📋 Testing Input Validation (requires server)...", "cyan");

  try {
    // Test missing prompt
    const response = await fetch(`${TEST_API_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.status === 400 && data.code === "MISSING_PROMPT") {
      log("  ✅ Rejects missing prompt with 400 and MISSING_PROMPT code", "green");
      return true;
    } else {
      log(`  ❌ Expected 400 with MISSING_PROMPT, got ${response.status}: ${JSON.stringify(data)}`, "red");
      return false;
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      log("  ⚠️  Server not running - skipping validation test", "yellow");
      return null; // Skip
    }
    log(`  ❌ Error: ${error.message}`, "red");
    return false;
  }
}

async function testLiveGeneration() {
  log("\n📋 Testing Live Generation (requires server + OPENAI_API_KEY)...", "cyan");
  log("  ⏳ This may take 10-30 seconds...", "yellow");

  try {
    const startTime = Date.now();
    const response = await fetch(`${TEST_API_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "A young inventor discovers her robot companion has feelings",
        storyType: "short_film",
      }),
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();

    log(`  Response received in ${(elapsed / 1000).toFixed(1)}s`, "reset");

    if (response.status !== 200) {
      log(`  ❌ Expected 200, got ${response.status}: ${data.error || data.code}`, "red");
      return false;
    }

    let allPassed = true;

    // Check title
    if (typeof data.title === "string" && data.title.length > 0) {
      log(`  ✅ title: "${data.title}"`, "green");
    } else {
      log(`  ❌ title missing or empty`, "red");
      allPassed = false;
    }

    // Check tagline
    if (typeof data.tagline === "string") {
      log(`  ✅ tagline: "${data.tagline.substring(0, 50)}${data.tagline.length > 50 ? '...' : ''}"`, "green");
    } else {
      log(`  ❌ tagline missing`, "red");
      allPassed = false;
    }

    // Check beats
    if (Array.isArray(data.beats) && data.beats.length >= 6) {
      log(`  ✅ beats: ${data.beats.length} beats generated`, "green");
      
      // Verify beat structure
      const firstBeat = data.beats[0];
      if (firstBeat.order && firstBeat.title && firstBeat.text) {
        log(`    First beat: [${firstBeat.order}] "${firstBeat.title}"`, "reset");
      } else {
        log(`  ❌ beats missing required fields (order, title, text)`, "red");
        allPassed = false;
      }
    } else {
      log(`  ❌ beats: expected >= 6, got ${data.beats?.length || 0}`, "red");
      allPassed = false;
    }

    // Check toneImagePrompt
    if (typeof data.toneImagePrompt === "string") {
      log(`  ✅ toneImagePrompt: "${data.toneImagePrompt.substring(0, 50)}..."`, "green");
    } else {
      log(`  ❌ toneImagePrompt missing`, "red");
      allPassed = false;
    }

    // Check story_type
    if (typeof data.story_type === "string") {
      log(`  ✅ story_type: "${data.story_type}"`, "green");
    } else {
      log(`  ❌ story_type missing`, "red");
      allPassed = false;
    }

    return allPassed;
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      log("  ⚠️  Server not running - skipping live test", "yellow");
      return null;
    }
    log(`  ❌ Error: ${error.message}`, "red");
    return false;
  }
}

// ============================================
// MAIN
// ============================================

async function runTests() {
  const isLiveMode = process.argv.includes("--live");
  
  log("═══════════════════════════════════════════════════════", "cyan");
  log("   /api/generate ROUTE TESTS", "cyan");
  log("═══════════════════════════════════════════════════════", "cyan");

  const results = {
    jsonParsing: false,
    beatNormalization: false,
    responseShape: false,
  };

  // Unit tests (always run)
  results.jsonParsing = testJsonParsing();
  results.beatNormalization = testBeatNormalization();
  results.responseShape = testResponseShape();

  // Integration tests (only with --live flag)
  if (isLiveMode) {
    log(`\n📡 Integration tests enabled (--live)`, "cyan");
    log(`   API URL: ${TEST_API_URL}`, "reset");
    
    results.validation = await testValidation();
    
    if (process.env.OPENAI_API_KEY) {
      results.liveGeneration = await testLiveGeneration();
    } else {
      log("\n⚠️  OPENAI_API_KEY not set - skipping live generation test", "yellow");
      results.liveGeneration = null;
    }
  }

  // Summary
  log("\n═══════════════════════════════════════════════════════", "cyan");
  log("   TEST SUMMARY", "cyan");
  log("═══════════════════════════════════════════════════════", "cyan");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  Object.entries(results).forEach(([name, result]) => {
    if (result === true) {
      log(`✅ ${name}: PASSED`, "green");
      passed++;
    } else if (result === false) {
      log(`❌ ${name}: FAILED`, "red");
      failed++;
    } else if (result === null) {
      log(`⚠️  ${name}: SKIPPED`, "yellow");
      skipped++;
    }
  });

  log(`\nTotal: ${passed} passed, ${failed} failed, ${skipped} skipped`, 
      failed === 0 ? "green" : "red");

  if (failed === 0) {
    log("\n🎉 All tests passed!", "green");
    process.exit(0);
  } else {
    log("\n⚠️  Some tests failed", "red");
    process.exit(1);
  }
}

runTests().catch((error) => {
  log(`\n💥 Test runner crashed: ${error.message}`, "red");
  process.exit(1);
});
