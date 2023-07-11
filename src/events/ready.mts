import { Events } from "discord.js";

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
    },
};
