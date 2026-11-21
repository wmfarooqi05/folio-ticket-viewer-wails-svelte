# Board mirror fixture (tickets 33 to 36)

A stand-in for the factory's mirror folder (`<repo>/.git/factory/board/docs/`), built from the R3
example in ai-software-factory's `docs/handoffs/folio-board-integration.md`. When the factory ships its
generated sample (`test/fixtures/board-mirror/` in that repo), these files should be replaced by a copy of it.

`modules/pay/` holds one ticket per status:
- **04:** `needs-verification`, with the full v1 board block;
- **08:** `needs-verification`, with an evidence folder that is not reachable;
- **09:** a status Folio doesn't know, `needs-review`.

The evidence files the blocks name don't exist here: ticket 36 adds them when it needs them.
