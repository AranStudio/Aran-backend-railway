// test/storyIntelligence.test.js
/**
 * Test script for Story Intelligence Engine
 * 
 * Run with: node test/storyIntelligence.test.js
 * 
 * Requirements:
 * - OPENAI_API_KEY environment variable must be set
 * - Server should be running on localhost:8080 (or set TEST_API_URL)
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

async function makeRequest(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${TEST_API_URL}${endpoint}`, options);
  const data = await response.json();
  return { status: response.status, data };
}

async function testHealthEndpoint() {
  log("\n📋 Testing Health Endpoint...", "cyan");

  try {
    const { status, data } = await makeRequest("/api/story/intelligence/health");

    if (status === 200 && data.status === "ok") {
      log("✅ Health endpoint working", "green");
      log(`   Service: ${data.service}`, "reset");
      log(`   Version: ${data.version}`, "reset");
      return true;
    } else {
      log(`❌ Health endpoint failed: ${JSON.stringify(data)}`, "red");
      return false;
    }
  } catch (error) {
    log(`❌ Health endpoint error: ${error.message}`, "red");
    return false;
  }
}

async function testValidationErrors() {
  log("\n📋 Testing Input Validation...", "cyan");

  try {
    // Test missing prompt
    const { status, data } = await makeRequest(
      "/api/story/intelligence/generate",
      "POST",
      {}
    );

    if (status === 400 && data.error === "Invalid input") {
      log("✅ Validation correctly rejects missing prompt", "green");
      return true;
    } else {
      log(`❌ Validation should reject missing prompt`, "red");
      return false;
    }
  } catch (error) {
    log(`❌ Validation test error: ${error.message}`, "red");
    return false;
  }
}

async function testFullGeneration() {
  log("\n📋 Testing Full Story Intelligence Generation...", "cyan");
  log("   (This may take 30-60 seconds)", "yellow");

  const testPayload = {
    prompt: "A coffee brand wants to show the morning ritual of a jazz musician who finds inspiration in the first sip of coffee",
    storyType: "commercial",
    brand: "Melodic Brew Coffee",
    audience: "Urban professionals, 25-45, who appreciate craft and artistry",
    durationSec: 30,
    constraints: {
      productCategory: "beverage",
      brandVoice: "warm, authentic, artistic",
      mustInclude: ["product shot", "moment of inspiration"],
      mustAvoid: ["cliché sunrise", "obvious product placement"],
    },
    risk: "interesting",
    style: "cinematic, warm tones",
    ending: "open",
  };

  try {
    const startTime = Date.now();
    const { status, data } = await makeRequest(
      "/api/story/intelligence/generate",
      "POST",
      testPayload
    );
    const duration = Date.now() - startTime;

    log(`   Response received in ${(duration / 1000).toFixed(1)}s`, "reset");

    // Check for success
    if (status !== 200 || !data.success) {
      log(`❌ Generation failed: ${data.error || "Unknown error"}`, "red");
      return false;
    }

    let allPassed = true;

    // Validate storyProfile
    if (data.storyProfile && typeof data.storyProfile === "object") {
      log("✅ storyProfile populated", "green");
      log(`   Structure: ${data.storyProfile.structure}`, "reset");
      log(`   Arc: ${data.storyProfile.arc}`, "reset");
      log(`   Tone: ${data.storyProfile.tone}`, "reset");
      log(`   Creative Hooks: ${data.storyProfile.creativeHooks?.length || 0}`, "reset");
    } else {
      log("❌ storyProfile missing or invalid", "red");
      allPassed = false;
    }

    // Validate beats
    if (Array.isArray(data.beats) && data.beats.length > 0) {
      log(`✅ beats array non-empty (${data.beats.length} beats)`, "green");
      log(`   First beat: "${data.beats[0]?.name}"`, "reset");
      
      // Check beat structure
      const firstBeat = data.beats[0];
      const hasRequiredFields = firstBeat.id && firstBeat.name && firstBeat.beatText;
      if (hasRequiredFields) {
        log("✅ beats have required fields (id, name, beatText)", "green");
      } else {
        log("❌ beats missing required fields", "red");
        allPassed = false;
      }
    } else {
      log("❌ beats array empty or missing", "red");
      allPassed = false;
    }

    // Validate critique
    if (data.critique && typeof data.critique === "object") {
      log("✅ critique object present", "green");
      log(`   Generic Score: ${data.critique.genericScore}`, "reset");
      log(`   Similarity to Common Ads: ${data.critique.similarityToCommonAds}`, "reset");
      log(`   Brand Fit Score: ${data.critique.brandFitScore}`, "reset");
    } else {
      log("❌ critique missing or invalid", "red");
      allPassed = false;
    }

    // Validate altConcepts (should be structured objects with name + tagline)
    if (Array.isArray(data.altConcepts) && data.altConcepts.length === 3) {
      log("✅ altConcepts length = 3", "green");
      const firstAlt = data.altConcepts[0];
      if (firstAlt.id && firstAlt.name && firstAlt.tagline && firstAlt.oneLiner) {
        log("✅ altConcepts have structured format (id, name, tagline, oneLiner)", "green");
        data.altConcepts.forEach((concept, i) => {
          log(`   Alt ${i + 1}: "${concept.name}" - ${concept.tagline}`, "reset");
        });
      } else {
        log("⚠️  altConcepts may be using old string format", "yellow");
        data.altConcepts.forEach((concept, i) => {
          const text = typeof concept === 'string' ? concept : concept.name || concept.oneLiner;
          log(`   Alt ${i + 1}: "${text?.substring(0, 60)}..."`, "reset");
        });
      }
    } else {
      log(`❌ altConcepts should have 3 items, got ${data.altConcepts?.length || 0}`, "red");
      allPassed = false;
    }

    // Validate title (should never be "Untitled")
    if (data.title && data.title !== "Untitled" && data.title !== "Untitled Story") {
      log(`✅ title generated: "${data.title}"`, "green");
    } else {
      log(`⚠️  title is generic or missing: "${data.title}"`, "yellow");
    }

    // Validate metadata
    if (data.metadata) {
      log("✅ metadata present", "green");
      log(`   Regeneration attempts: ${data.metadata.regenerationAttempts}`, "reset");
      log(`   Total duration: ${data.metadata.totalDurationMs}ms`, "reset");
    }

    return allPassed;
  } catch (error) {
    log(`❌ Generation test error: ${error.message}`, "red");
    return false;
  }
}

async function testMinimalPayload() {
  log("\n📋 Testing Minimal Payload (prompt only)...", "cyan");
  log("   (This may take 20-40 seconds)", "yellow");

  const minimalPayload = {
    prompt: "A dog discovers a mysterious package on the doorstep",
  };

  try {
    const { status, data } = await makeRequest(
      "/api/story/intelligence/generate",
      "POST",
      minimalPayload
    );

    if (status === 200 && data.success) {
      log("✅ Minimal payload works with defaults", "green");
      log(`   Default storyType applied: ${data.storyProfile?.format}`, "reset");
      log(`   Default brand_role: ${data.storyProfile?.brand_role}`, "reset");
      return true;
    } else {
      log(`❌ Minimal payload failed: ${data.error}`, "red");
      return false;
    }
  } catch (error) {
    log(`❌ Minimal payload test error: ${error.message}`, "red");
    return false;
  }
}

async function runAllTests() {
  log("═══════════════════════════════════════════════════════", "cyan");
  log("   STORY INTELLIGENCE ENGINE - API TESTS", "cyan");
  log("═══════════════════════════════════════════════════════", "cyan");
  log(`\nTest API URL: ${TEST_API_URL}`, "reset");

  const results = {
    health: false,
    validation: false,
    fullGeneration: false,
    minimalPayload: false,
  };

  // Run tests
  results.health = await testHealthEndpoint();
  results.validation = await testValidationErrors();
  
  // Only run full tests if health check passes
  if (results.health) {
    results.fullGeneration = await testFullGeneration();
    results.minimalPayload = await testMinimalPayload();
  } else {
    log("\n⚠️  Skipping generation tests - server not responding", "yellow");
  }

  // Summary
  log("\n═══════════════════════════════════════════════════════", "cyan");
  log("   TEST SUMMARY", "cyan");
  log("═══════════════════════════════════════════════════════", "cyan");

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([name, passed]) => {
    const icon = passed ? "✅" : "❌";
    const color = passed ? "green" : "red";
    log(`${icon} ${name}: ${passed ? "PASSED" : "FAILED"}`, color);
  });

  log(`\nTotal: ${passed}/${total} tests passed`, passed === total ? "green" : "yellow");

  if (passed === total) {
    log("\n🎉 All tests passed!", "green");
    process.exit(0);
  } else {
    log("\n⚠️  Some tests failed", "red");
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  log(`\n💥 Test runner crashed: ${error.message}`, "red");
  process.exit(1);
});
