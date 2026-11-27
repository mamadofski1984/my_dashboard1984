# Codal execution policy

AI agents must not execute live Codal collection, scraping, or workbook downloads. For network acquisition, ask the user to open `run_codal_spyder.py` in Spyder and press F5. Offline parsing, tests with mocked network functions, schema validation, and builds may run locally.

The runner stores task states and successful search pages in `codal_evidence/checkpoints.sqlite`. SQLite keys are issuer ID, task type, and period key. The completed local evidence snapshots and workbook files are reused. On a rate limit or an unresolved task, stop the current issuer without moving on to another issuer. A second F5 resumes using the same database. Set `TARGET_TICKER` only for an intentional one-issuer run.

An unreadable cached workbook or a disclosure with no verified amendment link can remain partial across repeated runs. Review the recorded reason and resolve its source or parser before resuming. The offline exporter reads this cache independently.
