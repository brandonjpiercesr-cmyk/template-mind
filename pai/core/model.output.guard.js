'use strict';

// CLAIR_reach R3B: one boundary for provider output rules. Keep recovery strict:
// only a documented qwen3 XML tool call, a tool_calls finish reason, and a tool
// declared on this exact request may become an executable structured call.
function containsCjk(value) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(value || ''));
}

function englishSystem(value) {
  return 'Respond only in English. ' + String(value || '');
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
  englishSystem: englishSystem,
  ornithSampling: ornithSampling,
  recoverQwen3XmlToolCalls: recoverQwen3XmlToolCalls
};
