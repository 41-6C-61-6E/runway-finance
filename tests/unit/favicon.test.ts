import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { config as proxyConfig } from "@/proxy";

describe("Favicon environment configuration", () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const prodFaviconPath = path.join(publicDir, "favicon.svg");
  const devFaviconPath = path.join(publicDir, "favicon-dev.svg");

  it("production favicon.svg exists and is styled with green dollar sign", () => {
    expect(fs.existsSync(prodFaviconPath)).toBe(true);
    const content = fs.readFileSync(prodFaviconPath, "utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain('fill="#10b981"');
    expect(content).toContain(">$<");
  });

  it("development favicon-dev.svg exists and is styled with purple dollar sign", () => {
    expect(fs.existsSync(devFaviconPath)).toBe(true);
    const content = fs.readFileSync(devFaviconPath, "utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain('fill="#a855f7"');
    expect(content).toContain(">$<");
  });

  it("proxy config excludes favicon.svg and favicon-dev.svg from middleware routing", () => {
    const matcher = proxyConfig.matcher[0];
    expect(matcher).toContain("favicon.svg");
    expect(matcher).toContain("favicon-dev.svg");
    expect(matcher).toContain("favicon.ico");
  });

  it("app/layout.tsx selects favicon-dev.svg when not in production and favicon.svg in production", async () => {
    // Read source code to verify conditional logic
    const layoutPath = path.resolve(__dirname, "../../app/layout.tsx");
    const layoutSource = fs.readFileSync(layoutPath, "utf-8");
    expect(layoutSource).toMatch(/icon:\s*isDev\s*\?\s*["']\/favicon-dev\.svg["']\s*:\s*["']\/favicon\.svg["']/);
  });
});
