import { Events } from "discord.js"
import { Event } from "../types.mjs"

export default Event
{
    Events.ClientReady
    true
    function execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
    }
}