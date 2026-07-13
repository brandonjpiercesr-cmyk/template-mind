// ⬡B:core.penny.hustle:MODULE:model_by_depth:20260616⬡
// Penny hustle v2 — delegates to core/model.router.js.
// Kept for backward compatibility. Use model.router.js directly for full control.
var { modelForDepth: routerModelForDepth, resolve, chat } = require('./model.router');

function modelForDepth(depth) { return routerModelForDepth(depth); }

module.exports = { modelForDepth:modelForDepth, resolve:resolve, chat:chat };
