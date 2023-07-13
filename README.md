# Discord-Bot

A custom-built Discord bot to run internally on our server and perform various tasks, such as:

-   Verify team members
-   Detect shop open/close
-   Save and back-up audit logs
-   Create countdowns for competitions

&nbsp;

### **Initial Setup:**

1. Install required dependencies:

    ```
    npm install
    ```

2. Create `.env` file and add necessary environment variables:

    ```
    DISCORD_BOT_TOKEN=""
    DISCORD_APPLICATION_ID=""
    DISCORD_GUILD_ID=""
    ```

### **Build / Run Instructions:**

1. Compile TypeScript code to JavaScript:

    ```
    npm run build
    ```

2. Register any new `"/"` commands (if applicable):

    ```
    node dist/deploy-commands.mjs
    ```

3. Run Discord bot:

    ```
    node dist/index.mjs
    ```
