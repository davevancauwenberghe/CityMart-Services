# Security policy

| Version          | Supported |
| ---------------- | --------- |
| 1.4.x            | Yes       |
| Earlier versions | No        |

Report security issues privately to the repository owner through GitHub's private vulnerability reporting feature when available, or through an established private contact. Do not put credentials or exploitable details in a public issue.

Keep Discord/easyPOS tokens in runtime environment secrets and use a separate test bot. If a token is exposed, rotate it with the issuing service. Logs intentionally omit request bodies, AI questions, tokens and raw exception messages; remove identifying information before sharing diagnostics.

The bot needs no Administrator permission, privileged gateway intents or public application port. Run one production instance and back up persistent storage off-server. Keep the Docker base image and npm dependencies updated; dependency update PRs must pass tests before deployment.
