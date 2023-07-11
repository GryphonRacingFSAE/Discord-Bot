/* eslint-env node */

module.exports = {
    root: true,
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier", "plugin:prettier/recommended"],
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    rules: {
        "prettier/prettier": [
            "error",
            {
                // Override all options of `prettier` here
                // @see https://prettier.io/docs/en/options.html
                tabWidth: 4,
                printWidth: 200,
                arrowParens: "avoid",
            },
        ],
        // Ignore all unused variables that start with an underscore
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
            "warn", // or "error"
            {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            },
        ],
    },
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
    },
};
