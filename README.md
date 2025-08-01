# CityMart Services | Discord Bot

[![CodeQL Advanced](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml)
![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)
![Docker](https://img.shields.io/badge/Container-Docker-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![GitHub Stars](https://img.shields.io/github/stars/davevancauwenberghe/Citymart-Services)

A lightweight Discord gateway bot for the CityMart Group server. It listens for "@CityMart Services <keyword>" and replies with rich embeds for commands like "community", "experience", "support", and "lorebook".

## 🚀 Getting Started

**Fork** this repository on GitHub, then follow the installation steps below.

## 🔧 Prerequisites

- [Node.js](https://nodejs.org/) v16.9+  
- [Docker](https://www.docker.com/) (for container builds)  
- A Discord Bot token with **Message Content Intent** enabled  

## ☁️ Deployment

This project includes a `Dockerfile` and is ready for Fly.io. Simply point your CI/CD at the repo, set the `DISCORD_TOKEN` secret, and deploy!

## 🤝 Contributing

Please make sure your code follows the existing style, includes documentation for any new commands, and passes any tests or CI checks before merging. See the [CONTRIBUTING](CONTRIBUTING.md) file for details, thanks for helping improve CityMart Services!

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
