"use strict";

const sinonConfig = require("@sinonjs/eslint-config");

module.exports = [
    {
        ignores: [
            "eslint.config.js",
            "coverage/**",
            ".worktrees/**",
            "**/.worktrees/**",
            "site/**",
            "nise.js",
        ],
    },
    ...sinonConfig,
    {
        files: ["lib/**/*.js", "lib/**/*.test.js"],
        rules: {
            "no-unused-vars": [
                "error",
                { vars: "all", args: "after-used", caughtErrors: "none" },
            ],
        },
    },
    {
        files: ["lib/**/*.test.js"],
        rules: {
            "mocha/consistent-spacing-between-blocks": "off",
        },
    },
    {
        languageOptions: {
            globals: {
                BigInt: false,
                Int8Array: false,
                Int16Array: false,
                Int32Array: false,
                Promise: false,
                Uint8Array: false,
                Uint8ClampedArray: false,
                Uint16Array: false,
                Uint32Array: false,
            },
        },
    },
];
