import { readConfig } from './config.js';
import { commands, registerCommands } from './commands.js';
const config = readConfig();
if (!config.clientId) throw new Error('CLIENT_ID is required for manual command registration.');
await registerCommands(config, config.clientId);
console.log(`Registered ${commands.length} CityMart guild commands.`);
