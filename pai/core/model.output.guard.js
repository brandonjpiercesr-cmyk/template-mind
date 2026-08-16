'use strict';

// CLAIR_reach R3B: one boundary for provider output rules. Keep recovery strict:
// only a documented qwen3 XML tool call, a tool_calls finish reason, and a tool
// declared on this exact request may become an executable structured call.
var CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

function containsCjk(value) {
  return CJK_RE.test(String(value || ''));
}

// \u2b21B:core.model_output_guard:FIX:a_boolean_cannot_tell_a_repair_from_an_echo:20260815\u2b21
// containsCjk answers yes/no, which is the right question for "does this need repair" and the
// WRONG question for "did the repair work". A correct English rewrite that keeps one proper noun
// and a model that echoed the entire Chinese source both answer yes. The caller in
// core/tool.loop.js needs to compare BEFORE against AFTER, so it needs a count, and the count
// lives here beside the range rather than as a second copy of the same character class.
function countCjk(value) {
  var found = String(value || '').match(new RegExp(CJK_RE.source, 'gu'));
  return found ? found.length : 0;
}

function englishSystem(value) {
  return 'Respond in English by default. If the user explicitly requests a translation or output in another named language, honor that target language exactly. Never switch languages unless requested. ' + String(value || '');
}

function explicitNonEnglishRequest(value) {
  var text = String(value || '').toLowerCase();
  var language = /\b(spanish|french|german|italian|portuguese|chinese|mandarin|cantonese|japanese|korean|arabic|hindi|urdu|russian|polish|dutch|greek|hebrew|turkish|swahili|vietnamese|thai)\b/;
  return language.test(text) &&
    (/\b(translate|translation|respond|answer|write|say)\b/.test(text) ||
      /\b(in|into|to)\s+(spanish|french|german|italian|portuguese|chinese|mandarin|cantonese|japanese|korean|arabic|hindi|urdu|russian|polish|dutch|greek|hebrew|turkish|swahili|vietnamese|thai)\b/.test(text));
}

function ornithSampling(maxTokens, ollamaShape) {
  var out = { temperature: 0.6, top_p: 0.95, top_k: 20 };
  out[ollamaShape ? 'num_predict' : 'max_tokens'] = maxTokens;
  return out;
}

function declaredToolNames(tools) {
  var names = Object.create(null);
  (tools || []).forEach(function (tool) {
    var name = tool && tool.function && tool.function.name;
    if (name) names[name] = true;
  });
  return names;
}

function xmlText(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function recoverQwen3XmlToolCalls(content, finishReason, tools) {
  if (finishReason !== 'tool_calls' || typeof content !== 'string' ||
      content.indexOf('<tool_call>') === -1) return null;
  var allowed = declaredToolNames(tools);
  var calls = [];
  var blockRe = /<tool_call>\s*<function=([^>\s]+)>\s*([\s\S]*?)\s*<\/function>\s*<\/tool_call>/gi;
  var block;
  while ((block = blockRe.exec(content))) {
    var name = xmlText(block[1]).trim();
    if (!allowed[name]) return null;
    var args = {};
    var parameterRe = /<parameter=([^>\s]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
    var parameter;
    while ((parameter = parameterRe.exec(block[2]))) {
      var key = xmlText(parameter[1]).trim();
      if (!key || Object.prototype.hasOwnProperty.call(args, key)) return null;
      var raw = xmlText(parameter[2]).trim();
      try { args[key] = JSON.parse(raw); } catch (e) { args[key] = raw; }
    }
    calls.push({ id: 'qwen3_xml_' + calls.length, type: 'function',
      function: { name: name, arguments: JSON.stringify(args) } });
  }
  return calls.length ? calls : null;
}

module.exports = {
  containsCjk: containsCjk,
  countCjk: countCjk,
  englishSystem: englishSystem,
  explicitNonEnglishRequest: explicitNonEnglishRequest,
  ornithSampling: ornithSampling,
  recoverQwen3XmlToolCalls: recoverQwen3XmlToolCalls
};
