/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "@remix-run/eslint-config/jest-testing-library",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
  overrides: [{
    files: ["tests/**/*.test.js"],
    // These tests use node:test, not Jest.
    rules: Object.fromEntries(Object.keys(require("eslint-plugin-jest").rules).map((name) => [`jest/${name}`, "off"])),
  }],
};
