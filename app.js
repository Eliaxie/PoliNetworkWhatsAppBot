"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const wa = require("@adiwajshing/baileys");
const fs = require("fs");
const readline = require("readline");
const conn = new wa.WAConnection(); // instantiate
var myGroups = [];
var myGroupsLinks = [];
var thrustedUsers = [];
var bannedUsers = [];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        conn.autoReconnect = wa.ReconnectMode.onConnectionLost; // only automatically reconnect when the connection breaks
        // conn.logger.level = "debug" // set to "debug" to see what kind of stuff you can implement
        // attempt to reconnect at most 10 times in a row
        conn.connectOptions.maxRetries = 10;
        // loads the auth file credentials if present
        /*  Note: one can take this auth_info.json file and login again from any computer without having to scan the QR code,
            and get full access to one"s WhatsApp. Despite the convenience, be careful with this file */
        fs.existsSync("./auth_info.json") && conn.loadAuthInfo("./auth_info.json");
        yield conn.connect();
        // credentials are updated on every connect
        const authInfo = conn.base64EncodedAuthInfo(); // get all the auth info we need to restore this session
        try {
            fs.writeFileSync("./auth_info.json", JSON.stringify(authInfo, null, "\t"));
        }
        catch (_a) {
            console.log("Unable to save login information, the QR will be asked again next time");
        } // save this info to a file
        var ready = 0;
        conn.on("contacts-received", () => {
            ready++;
            initialize(ready);
        });
        conn.on("chats-received", () => {
            ready++;
            initialize(ready);
        });
        conn.on("chat-new", chat => {
            getGroups(chat);
        });
        conn.on("group-update", groupMetadata => {
            getGroups(conn.chats.get(groupMetadata.jid));
        });
        /**
         * The universal event for anything that happens
         * New messages, updated messages, read & delivered messages, participants typing etc.
         */
        conn.on("chat-update", (chat) => __awaiter(this, void 0, void 0, function* () {
            // only do something when a new message is received
            if (!chat.hasNewMessage) {
                return;
            }
            const m = chat.messages.all()[0]; // pull the new message from the update
            const messageContent = m.message;
            // if it is not a regular text or media message
            if (!messageContent) {
                return;
            }
            var sender = m.key.remoteJid;
            const messageType = Object.keys(messageContent)[0]; // message will always contain one key signifying what kind of message
            if (messageType == wa.MessageType.text && thrustedUsers.includes(sender)) {
                const text = m.message.conversation;
                yield conn.chatRead(sender); // mark chat read
                const options = { quoted: m };
                var type;
                type = wa.MessageType.text;
                if (text.includes("!banAll")) {
                    var number = text.split(" ")[1];
                    if ((yield addUser(number, "banned")) && (yield banUsers())) {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "User banned successfully!";
                            yield conn.sendMessage(sender, content, type, options);
                        }), getRandomInt(5000));
                    }
                    else {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "What you entered is not a WhatsApp user. To add +39 123 456 789 as a banned user, text me !banAll 39123456789. It is also possible that I added the user in my list of people to ban but I didn't actually manage to ban them";
                            yield conn.sendMessage(sender, content, type, options);
                        }), getRandomInt(5000));
                    }
                }
                else if (text.includes("!addThrustedUser")) {
                    var number = text.split(" ")[1];
                    if (yield addUser(number, "thrusted")) {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "Thrusted user added successfully!";
                            yield conn.sendMessage(sender, content, type, options);
                        }), getRandomInt(5000));
                    }
                    else {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "What you entered is not a WhatsApp user. To add +39 123 456 789 as a thrusted user, text me !addThrustedUser 39123456789";
                            yield conn.sendMessage(sender, content, type, options);
                        }), getRandomInt(5000));
                    }
                }
                else if (text == "!resetLinks") {
                    var list = yield resetLinks();
                    if (!list.startsWith("I couldn't save")) {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "Links revoked succeffully (probably, if not I just put the old one in the list)! Here are all the groups with their invitation link:";
                            yield conn.sendMessage(sender, content, type, options);
                            yield conn.sendMessage(sender, { url: "./groups.txt" }, wa.MessageType.document, {});
                        }), getRandomInt(5000));
                    }
                    else {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            yield conn.sendMessage(sender, list, type, options);
                        }), getRandomInt(5000));
                    }
                }
                else if (text == "!printGroups") {
                    var list = yield printGroups();
                    if (!list.startsWith("I couldn't save")) {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            var content = "I successfully made a file with all the groups and their invitation links, here it is:";
                            yield conn.sendMessage(sender, { url: "./groups.pdf" }, // send directly from local file
                            wa.MessageType.document, { mimetype: wa.Mimetype.pdf, caption: content });
                            //await conn.sendMessage(sender, { url: "./groups.txt" }, wa.MessageType.document, { caption: content })
                        }), getRandomInt(5000));
                    }
                    else {
                        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            yield conn.sendMessage(sender, list, type, options);
                        }), getRandomInt(5000));
                    }
                }
            }
        }));
        conn.on("close", ({ reason, isReconnecting }) => (console.log("Oh no got disconnected: " + reason + ", reconnecting: " + isReconnecting)));
    });
}
function initialize(ready) {
    if (ready == 2) {
        getThrustedUsers();
        getBannedUsers();
        getGroups(conn.chats.all());
    }
}
function getThrustedUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        if (fs.existsSync("./thrusted_users.json")) {
            try {
                thrustedUsers = JSON.parse(fs.readFileSync("./thrusted_users.json").toString());
            }
            catch (_a) {
                console.log("Unable to parse previously saved thrusted users, deleting the file and starting over");
                try {
                    fs.rmSync("./thrusted_users.json");
                    getThrustedUsers();
                }
                catch (_b) {
                    console.log("Unable to delete the old file, please fix the problem yourself");
                    throw new Error();
                }
            }
        }
        else {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            yield rl.question("There are no thrusted users that can give commands to this bot, please provide one via their phone number (you will be able to add more using !newThrustedUser <number> inside the bot) [example: +39 123 456 789 becomes 39123456789]\n", (answer) => __awaiter(this, void 0, void 0, function* () {
                var exists = yield conn.isOnWhatsApp(answer);
                if (exists) {
                    console.log("Thrusted user added successfully, running the bot");
                    thrustedUsers.push(exists.jid);
                    try {
                        fs.writeFileSync("./thrusted_users.json", JSON.stringify(thrustedUsers, null, "\t"));
                    }
                    catch (_c) {
                        console.log("Unable to save the thrusted user to a file, this will not be persistent");
                    }
                    rl.close();
                }
                else {
                    console.log("What you entered is not a WhatsApp user, please retry");
                    throw new Error();
                }
            }));
        }
    });
}
function getBannedUsers() {
    if (fs.existsSync("./banned_users.json")) {
        try {
            bannedUsers = JSON.parse(fs.readFileSync("./banned_users.json").toString());
        }
        catch (_a) {
            console.log("Unable to parse previously saved banned users, please back them up and delete the file");
            throw new Error();
        }
    }
}
function getGroups(chats) {
    return __awaiter(this, void 0, void 0, function* () {
        var addedNew = false;
        for (var i = 0; i < chats.length; i++) {
            addedNew = yield getGroupsWorker(chats[i]);
        }
        if (i == 0) {
            addedNew = yield getGroupsWorker(chats);
        }
        if (addedNew) {
            banUsers();
        }
    });
}
function getGroupsWorker(chat) {
    return __awaiter(this, void 0, void 0, function* () {
        var id = chat.jid;
        if (!myGroups.includes(chat) && wa.isGroupID(id)) {
            try {
                myGroupsLinks.push(yield conn.groupInviteCode(id)); // only add to myGroups if the bot is admin
                myGroups.push(chat);
                return true;
            }
            catch (_a) {
                return false;
            }
        }
        else {
            return false;
        }
    });
}
function addUser(number, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const exists = yield conn.isOnWhatsApp(number);
        if (exists) {
            var id = exists.jid;
            if (type == "thrusted") {
                thrustedUsers.push(id);
            }
            else {
                bannedUsers.push(id);
            }
            try {
                if (type == "thrusted") {
                    fs.writeFileSync("./thrusted_users.json", JSON.stringify(thrustedUsers, null, "\t"));
                }
                else {
                    fs.writeFileSync("./banned_users.json", JSON.stringify(bannedUsers, null, "\t"));
                }
            }
            catch (_a) {
                console.log("Unable to save the new user to a file, this will not be persistent");
            }
            return true;
        }
        else {
            return false;
        }
    });
}
function banUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        return true;
    });
}
function resetLinks() {
    return __awaiter(this, void 0, void 0, function* () {
        var myGroupsLinksTmp = [];
        for (var i = 0; i < myGroups.length; i++) {
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    myGroupsLinksTmp.push(yield conn.revokeInvite(myGroups[i].jid));
                }
                catch (_a) {
                    myGroupsLinksTmp.push(myGroupsLinks[i]);
                }
            }), getRandomInt(1000));
        }
        myGroupsLinks = myGroupsLinksTmp;
        return printGroups();
    });
}
function printGroups() {
    var list = "";
    for (var i = 0; i < myGroups.length; i++) {
        list += myGroups[i].name + "\nhttps://chat.whatsapp.com/" + myGroupsLinks[i] + "\n\n";
    }
    try {
        fs.writeFileSync("./groups.txt", list);
        return list;
    }
    catch (_a) {
        return "I couldn't save what I did to a file, i'll try to append it here\n" + list;
    }
}
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}
main().catch((err) => console.log(`Encountered error: ${err}`));
//# sourceMappingURL=app.js.map