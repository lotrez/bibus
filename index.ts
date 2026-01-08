#!/usr/bin/env bun
import { createCli } from "./lib/utils/cli.ts";

// Create and run the CLI
const cli = createCli();

// Parse arguments and execute command
cli.parse();
