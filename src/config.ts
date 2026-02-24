import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "config.json");

export interface Config {
  model: string;
  workspace: string;
  timezone: string;
  discord?: {
    botToken: string;
    channels: Record<string, string>;
  };
}

function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  } catch {
    throw new Error(`config.json not found. Copy config.example.json to config.json and fill in your values.`);
  }
}

export const config = loadConfig();
export const ROOT_DIR = ROOT;
