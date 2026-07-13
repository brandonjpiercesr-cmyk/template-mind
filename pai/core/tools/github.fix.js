// ⬡B:core.tools.github.fix:MODULE:self_heal_file_fix:20260630⬡
// She commits a file fix to GitHub. Used by A'NEW to fix her own broken code.
// ANYHAM: path and content are always runtime params, never hardcoded.
'use strict';
async function fixFileInGithub(repo, path, newContent, reason) {
  var GH = process.env.GITHUB_TOKEN;
  if (!GH || !repo || !path || !newContent) return { ok: false, reason: 'missing_params' };
  var [owner, repoName] = repo.split('/');
  // Fetch fresh HEAD SHA
  var head = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'token ' + GH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{repository(owner:"' + owner + '",name:"' + repoName + '"){ref:defaultBranchRef{target{oid}}}}' })
  }).then(function(r){ return r.json(); }).catch(function(){ return null; });
  if (!head) return { ok: false, reason: 'cant_get_head' };
  var oid = head.data && head.data.repository && head.data.repository.ref && head.data.repository.ref.target && head.data.repository.ref.target.oid;
  if (!oid) return { ok: false, reason: 'no_oid' };
  // Commit the fix
  var mutation = 'mutation($i:CreateCommitOnBranchInput!){createCommitOnBranch(input:$i){commit{oid}}}';
  var variables = { i: {
    branch: { repositoryNameWithOwner: repo, branchName: 'main' },
    message: { headline: 'A\u2019NEW self-heal: ' + (reason || 'auto fix') + ' — ' + path },
    fileChanges: { additions: [{ path: path, contents: Buffer.from(newContent).toString('base64') }] },
    expectedHeadOid: oid
  }};
  var res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'token ' + GH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation, variables })
  }).then(function(r){ return r.json(); }).catch(function(){ return null; });
  if (res && res.data && res.data.createCommitOnBranch) {
    return { ok: true, sha: res.data.createCommitOnBranch.commit.oid, path, repo };
  }
  return { ok: false, reason: 'commit_failed', detail: JSON.stringify((res||{}).errors||[]).slice(0,200) };
}
module.exports = { fixFileInGithub };
