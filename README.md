# CityMart Services | Discord Bot

[![CodeQL Advanced](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml)
![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)
![Docker](https://img.shields.io/badge/Container-Docker-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![GitHub Stars](https://img.shields.io/github/stars/davevancauwenberghe/CityMart-Services)

A lightweight Discord gateway bot for the CityMart Group server. It listens for "@CityMart Services <keyword>" and replies with rich embeds for commands like "community", "experience", "support", "lorebook", "keywords", "lamp", "ping", and "ask".

## 🚀 Getting Started

**Fork** this repository on GitHub, then follow the installation steps below.

```bash
git clone https://github.com/davevancauwenberghe/CityMart-Services.git
cd CityMart-Services
npm install
```

Create a `.env` file with your `DISCORD_TOKEN` and other optional variables like `GUILD_ID` and `WORKER_URL` before starting the bot.

## 🔧 Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) (for container builds)  
- A Discord Bot token with **Message Content Intent** enabled  

## ☁️ Deployment

This project includes a `Dockerfile` and is ready for Fly.io. Simply point your CI/CD at the repo, set the `DISCORD_TOKEN` secret, and deploy!

## 🤝 Contributing

Please make sure your code follows the existing style, includes documentation for any new commands, and passes any tests or CI checks before merging. See the [CONTRIBUTING](CONTRIBUTING.md) file for details, thanks for helping improve CityMart Services!

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

![](https://storage.davevancauwenberghe.be/citymart/visuals/citymart_footer.png)
