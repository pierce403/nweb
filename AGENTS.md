# Nweb migration

Preserve the four existing user records, submit tokens, points and timestamps.
Native main builds publish Workers assets and D1. The external Elasticsearch
identity remains unchanged; its current connection failure is not proof of empty
indexes. Do not replace it with an empty index or infer a completed index backup.

Staging uses synthetic users/results, its own JWT secret and mocked index calls.
No live scan, financial transaction or existing-user message is needed. Remove
credential, signature and submit-token logging before supplying production secrets.
Keep wallet signature/domain/ten-minute message format and access cookie interface.

Freeze the source writer and reconcile final Postgres copies before Cloudflare
writes. Preserve the original master branch/deployed slug and private backups;
disable Heroku automatic deploys before publishing main. Native Git credentials
stay in Cloudflare, previews never share production data or secrets.
