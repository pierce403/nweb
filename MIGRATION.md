# Nweb on Cloudflare

Native main builds run npm ci, npm run build and npx wrangler deploy --env "".
The Worker uses precompiled original templates and same-origin assets. It keeps
the root/search query, page, hostlist/JSON formats, host, login, leaderboard,
getwork, submit and authtest paths. The original master commit
2af40220d49238d58cb7027892dd693aa8f4404a and Heroku slug are recovery sources.
Deployment credentials remain in Cloudflare; previews are disabled.

D1 preserves all five users fields, including exact submit tokens, points and
timestamps. Staging uses a separate database/JWT key and mock index responses.
Private data rehearsals use an unbound database. Never put exports or credentials
in Git, and never test with real scan jobs or financial transactions.

Production keeps the existing external Elasticsearch URI/identity in the ELASTIC
runtime secret. Its earlier connection failure does not prove that indexes are
empty. The Worker does not replace that source with an empty index. Index failures
return an explicit unavailable response and preserve pending submissions without
adding points. The endpoint must use HTTPS; credentials are removed from its URL
and sent only to that fixed endpoint, with redirects rejected.

An additional submissions ledger gives retries a deterministic ID. History and
current-host indexing complete before an atomic D1 batch accepts the ledger entry
and increments points once. Interrupted index writes can be retried without duplicate
history/points. No new scan scheduler or source scan is created by this port.

Wallet login keeps the ten-minute domain message and access/CSRF cookie names,
15-minute JWT lifetime and existing issuer if configured. JWT_SECRET_KEY must be
stable. If Heroku had only per-process random fallback keys, configure a new stable
Cloudflare key and note that existing browsers need to sign in again. Messages can
still be replayed within their existing ten-minute bucket; no single-use claim is
made. Connected-wallet state does not authenticate an account.

Preserve the original CSP and HSTS headers. READ_ONLY blocks mutation endpoints
and implicit GET-created token rows. Freeze the old web writer, reconcile final
Postgres exports and verify custom-host HTTPS/browser reads before enabling writes.
Keep source data/deployments for recovery. After writes, rollback first freezes
Cloudflare and transfers accepted users/point changes back to PostgreSQL; it must
also reconcile pending indexed submissions rather than changing DNS alone.
