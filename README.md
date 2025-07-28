# CityMart Discord Bot

![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)  
![Docker](https://img.shields.io/badge/Container-Docker-blue.svg)  
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

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

1. **Fork** this repo  
2. **Create a feature branch** (`git checkout -b feature/my-feature`)  
3. **Commit your changes** (`git commit -m "Add my feature"`)  
4. **Push to your branch** (`git push origin feature/my-feature`)  
5. **Open a Pull Request** here on GitHub  

Please ensure your code follows the existing style and includes documentation for any new commands.

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
