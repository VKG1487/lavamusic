import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    ApplicationCommandType,
    Client,
    Collection,
    EmbedBuilder,
    Events,
    type Interaction,
    PermissionsBitField,
    REST,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
    Routes,
} from "discord.js";
import config from "../config.js";
import ServerData from "../database/server.js";
import loadPlugins from "../plugin/index.js";
import { Utils } from "../utils/Utils.js";
import Logger from "./Logger.js";
import { type Command, Queue, ShoukakuClient } from "./index.js";
import { initI18n, T, i18n, localization } from "./I18n.js";
import { Locale } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class Lavamusic extends Client {
    public commands: Collection<string, any> = new Collection();
    public aliases: Collection<string, any> = new Collection();
    public db = new ServerData();
    public cooldown: Collection<string, any> = new Collection();
    public config = config;
    public logger: Logger = new Logger();
    public readonly color = config.color;
    private body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
    public shoukaku: ShoukakuClient;
    public utils = Utils;
    public queue = new Queue(this);

    public embed(): EmbedBuilder {
        return new EmbedBuilder();
    }

    public async start(token: string): Promise<void> {
        initI18n();
        const nodes = this.config.autoNode ? await this.getNodes() : this.config.lavalink;
        this.shoukaku = new ShoukakuClient(this, nodes);
        await this.loadCommands();
        this.logger.info("Successfully loaded commands!");
        await this.loadEvents();
        this.logger.info("Successfully loaded events!");
        loadPlugins(this);
        await this.login(token);

        this.on(Events.InteractionCreate, async (interaction: Interaction<"cached">) => {
            if (interaction.isButton()) {
                const setup = await this.db.getSetup(interaction.guildId);
                if (setup && interaction.channelId === setup.textId && interaction.message.id === setup.messageId) {
                    this.emit("setupButtons", interaction);
                }
            }
        });
    }

    private async loadCommands(): Promise<void> {
        const commandsPath = path.join(__dirname, "../commands");
        const commandDirs = fs.readdirSync(commandsPath);

        for (const dir of commandDirs) {
            const commandFiles = fs.readdirSync(path.join(commandsPath, dir)).filter((file) => file.endsWith(".js"));

            for (const file of commandFiles) {
                const cmdModule = await import(`../commands/${dir}/${file}`);
                const command: Command = new cmdModule.default(this);
                command.category = dir;

                this.commands.set(command.name, command);
                command.aliases.forEach((alias: string) => {
                    this.aliases.set(alias, command.name);
                });

                if (command.slashCommand) {
                    const data: RESTPostAPIChatInputApplicationCommandsJSONBody = {
                        name: command.name,
                        description: T(Locale.EnglishUS, command.description.content),
                        type: ApplicationCommandType.ChatInput,
                        options: command.options || [],
                        default_member_permissions:
                            Array.isArray(command.permissions.user) && command.permissions.user.length > 0 ? PermissionsBitField.resolve(command.permissions.user as any).toString() : null,
                        name_localizations: null,
                        description_localizations: null
                    };
                    // command description and name localizations
                    const localizations = []
                    i18n.getLocales().map((locale) => {
                        localizations.push(localization(locale, command.name, command.description.content));
                    });
                    for (const localization of localizations) {
                        const [language, name] = localization.name;
                        const [language2, description] = localization.description;
                        data.name_localizations = { ...data.name_localizations, [language]: name };
                        data.description_localizations = { ...data.description_localizations, [language2]: description };
                    }

                    // command options localizations
                    if (command.options.length > 0) {
                        command.options.map((option) => {
                            // command options name and description localizations
                            const optionsLocalizations = []
                            i18n.getLocales().map((locale) => {
                                optionsLocalizations.push(localization(locale, option.name, option.description));
                            });
                            for (const localization of optionsLocalizations) {
                                const [language, name] = localization.name;
                                const [language2, description] = localization.description;
                                option.name_localizations = { ...option.name_localizations, [language]: name };
                                option.description_localizations = { ...option.description_localizations, [language2]: description };
                            }
                            // command options description localization
                            option.description = T(Locale.EnglishUS, option.description);
                        });
                    }
                    this.body.push(data);
                }
            }
        }

        this.once("ready", async () => {
            const route = this.config.production
                ? Routes.applicationCommands(this.user?.id ?? "")
                : Routes.applicationGuildCommands(this.user?.id ?? "", this.config.guildId ?? "");

            try {
                const rest = new REST({ version: "10" }).setToken(this.config.token ?? "");
                await rest.put(route, { body: this.body });
                this.logger.info("Successfully loaded slash commands!");
            } catch (error) {
                this.logger.error(error);
            }
        });
    }

    private async getNodes(): Promise<any> {
        const params = new URLSearchParams({
            ssl: "false",
            version: "v4",
            format: "shoukaku",
        });
        const res = await fetch(`https://lavainfo-api.deno.dev/nodes?${params.toString()}`, {
            headers: {
                "Content-Type": "application/json",
            },
        });
        return await res.json();
    }

    private async loadEvents(): Promise<void> {
        const eventsPath = path.join(__dirname, "../events");
        const eventDirs = fs.readdirSync(eventsPath);

        for (const dir of eventDirs) {
            const eventFiles = fs.readdirSync(path.join(eventsPath, dir)).filter((file) => file.endsWith(".js"));

            for (const file of eventFiles) {
                const eventModule = await import(`../events/${dir}/${file}`);
                const event = new eventModule.default(this, file);

                if (dir === "player") {
                    this.shoukaku.on(event.name, (...args) => event.run(...args));
                } else {
                    this.on(event.name, (...args) => event.run(...args));
                }
            }
        }
    }
}

/**
 * Project: lavamusic
 * Author: Appu
 * Main Contributor: LucasB25
 * Company: Coders
 * Copyright (c) 2024. All rights reserved.
 * This code is the property of Coder and may not be reproduced or
 * modified without permission. For more information, contact us at
 * https://discord.gg/ns8CTk9J3e
 */
