import * as wa from "@adiwajshing/baileys"
import * as fs from "fs"
import * as readline from "readline"

const conn = new wa.WAConnection() // instantiate
var myGroups = []
var myGroupsLinks = []
var thrustedUsers = []
var bannedUsers = []

async function main() {
    conn.autoReconnect = wa.ReconnectMode.onConnectionLost // only automatically reconnect when the connection breaks
    // conn.logger.level = "debug" // set to "debug" to see what kind of stuff you can implement
    // attempt to reconnect at most 10 times in a row
    conn.connectOptions.maxRetries = 10

    // loads the auth file credentials if present
    /*  Note: one can take this auth_info.json file and login again from any computer without having to scan the QR code, 
        and get full access to one"s WhatsApp. Despite the convenience, be careful with this file */
    fs.existsSync("./auth_info.json") && conn.loadAuthInfo("./auth_info.json")

    await conn.connect()
    // credentials are updated on every connect
    const authInfo = conn.base64EncodedAuthInfo() // get all the auth info we need to restore this session
    try {
        fs.writeFileSync("./auth_info.json", JSON.stringify(authInfo, null, "\t"))
    } catch {
        console.log("Unable to save login information, the QR will be asked again next time")
    } // save this info to a file

    var ready = 0
    conn.on("contacts-received", () => {
        ready++
        initialize(ready)
    })
    conn.on("chats-received", () => {
        ready++
        initialize(ready)
    })

    conn.on("chat-new", chat => {
        getGroups(chat)
    })
    conn.on("group-update", groupMetadata => {
        getGroups(conn.chats.get(groupMetadata.jid))
    })

    /**
     * The universal event for anything that happens
     * New messages, updated messages, read & delivered messages, participants typing etc.
     */
    conn.on("chat-update", async (chat) => {
        // only do something when a new message is received
        if (!chat.hasNewMessage) {
            return
        }

        const m = chat.messages.all()[0] // pull the new message from the update
        const messageContent = m.message

        // if it is not a regular text or media message
        if (!messageContent) {
            return
        }

        var sender = m.key.remoteJid
        const messageType = Object.keys(messageContent)[0] // message will always contain one key signifying what kind of message
        if (messageType == wa.MessageType.text && thrustedUsers.includes(sender)) {
            const text = m.message.conversation
            await conn.chatRead(sender) // mark chat read
            const options: wa.MessageOptions = { quoted: m }
            var type: wa.MessageType
            type = wa.MessageType.text
            if (text.includes("!banAll")) {
                var number = text.split(" ")[1]
                if ((await addUser(number, "banned")) && (await banUsers())) {
                    setTimeout(async () => {
                        var content = "User banned successfully!"
                        await conn.sendMessage(sender, content, type, options)
                    }, getRandomInt(5000))
                } else {
                    setTimeout(async () => {
                        var content = "What you entered is not a WhatsApp user. To add +39 123 456 789 as a banned user, text me !banAll 39123456789. It is also possible that I added the user in my list of people to ban but I didn't actually manage to ban them"
                        await conn.sendMessage(sender, content, type, options)
                    }, getRandomInt(5000))
                }
            } else if (text.includes("!addThrustedUser")) {
                var number = text.split(" ")[1]
                if (await addUser(number, "thrusted")) {
                    setTimeout(async () => {
                        var content = "Thrusted user added successfully!"
                        await conn.sendMessage(sender, content, type, options)
                    }, getRandomInt(5000))
                } else {
                    setTimeout(async () => {
                        var content = "What you entered is not a WhatsApp user. To add +39 123 456 789 as a thrusted user, text me !addThrustedUser 39123456789"
                        await conn.sendMessage(sender, content, type, options)
                    }, getRandomInt(5000))
                }
            } else if (text == "!resetLinks") {
                var list = await resetLinks()
                if (!list.startsWith("I couldn't save")) {
                    setTimeout(async () => {
                        var content = "Links revoked succeffully (probably, if not I just put the old one in the list)! Here are all the groups with their invitation link:"
                        await conn.sendMessage(sender, content, type, options)
                        await conn.sendMessage(sender, { url: "./groups.txt" }, wa.MessageType.document, { })
                    }, getRandomInt(5000))
                } else {
                    setTimeout(async () => {
                        await conn.sendMessage(sender, list, type, options)
                    }, getRandomInt(5000))
                }
            } else if (text == "!printGroups") {
                var list = await printGroups()
                if (!list.startsWith("I couldn't save")) {
                    setTimeout(async () => {
                        var content = "I successfully made a file with all the groups and their invitation links, here it is:"
                        await conn.sendMessage(
                            sender,
                            { url: "./groups.pdf" }, // send directly from local file
                            wa.MessageType.document,
                            { mimetype: wa.Mimetype.pdf, caption: content }
                        )
                        //await conn.sendMessage(sender, { url: "./groups.txt" }, wa.MessageType.document, { caption: content })
                    }, getRandomInt(5000))
                } else {
                    setTimeout(async () => {
                        await conn.sendMessage(sender, list, type, options)
                    }, getRandomInt(5000))
                }
            }
        }
    })

    conn.on("close", ({ reason, isReconnecting }) => (
        console.log("Oh no got disconnected: " + reason + ", reconnecting: " + isReconnecting)
    ))
}

function initialize(ready) {
    if (ready == 2) {
        getThrustedUsers()
        getBannedUsers()
        getGroups(conn.chats.all())
    }
}

async function getThrustedUsers() {
    if (fs.existsSync("./thrusted_users.json")) {
        try {
            thrustedUsers = JSON.parse(fs.readFileSync("./thrusted_users.json").toString())
        } catch {
            console.log("Unable to parse previously saved thrusted users, deleting the file and starting over")
            try {
                fs.rmSync("./thrusted_users.json")
                getThrustedUsers()
            } catch {
                console.log("Unable to delete the old file, please fix the problem yourself")
                throw new Error()
            }
        }  
    } else {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        await rl.question("There are no thrusted users that can give commands to this bot, please provide one via their phone number (you will be able to add more using !newThrustedUser <number> inside the bot) [example: +39 123 456 789 becomes 39123456789]\n", async (answer) => {
            var exists = await conn.isOnWhatsApp(answer)

            if (exists) {
                console.log("Thrusted user added successfully, running the bot")
                thrustedUsers.push(exists.jid)

                try {
                    fs.writeFileSync("./thrusted_users.json", JSON.stringify(thrustedUsers, null, "\t"))
                } catch {
                    console.log("Unable to save the thrusted user to a file, this will not be persistent")
                }

                rl.close();
            } else {
                console.log("What you entered is not a WhatsApp user, please retry")
                throw new Error()
            }
        })
    }
}

function getBannedUsers() {
    if (fs.existsSync("./banned_users.json")) {
        try {
            bannedUsers = JSON.parse(fs.readFileSync("./banned_users.json").toString())
        } catch {
            console.log("Unable to parse previously saved banned users, please back them up and delete the file")
            throw new Error()
        }
    }
}

async function getGroups(chats) {
    var addedNew = false

    for (var i = 0; i < chats.length; i++) {
        addedNew = await getGroupsWorker(chats[i])
    }

    if (i == 0) {
        addedNew = await getGroupsWorker(chats)
    }

    if (addedNew) {
        banUsers()
    }
}

async function getGroupsWorker(chat) {
    var id = chat.jid

    if (!myGroups.includes(chat) && wa.isGroupID(id)) {
        try {
            myGroupsLinks.push(await conn.groupInviteCode(id)) // only add to myGroups if the bot is admin
            myGroups.push(chat)
            return true
        } catch {
            return false
        }
    } else {
        return false
    }
}

async function addUser(number, type) {
    const exists = await conn.isOnWhatsApp(number)

    if (exists) {
        var id = exists.jid

        if (type == "thrusted") {
            thrustedUsers.push(id)
        } else {
            bannedUsers.push(id)
        }
        
        try {
            if (type == "thrusted") {
                fs.writeFileSync("./thrusted_users.json", JSON.stringify(thrustedUsers, null, "\t"))
            } else {
                fs.writeFileSync("./banned_users.json", JSON.stringify(bannedUsers, null, "\t"))
            }
        } catch {
            console.log("Unable to save the new user to a file, this will not be persistent")
        }

        return true
    } else {
        return false
    }
}

async function banUsers() {
    return true
}

async function resetLinks() {
    var myGroupsLinksTmp = []

    for (var i = 0; i < myGroups.length; i++) {
        setTimeout(async () => {
            try {
                myGroupsLinksTmp.push(await conn.revokeInvite(myGroups[i].jid))
            } catch {
                myGroupsLinksTmp.push(myGroupsLinks[i])
            }
        }, getRandomInt(1000))
    }

    myGroupsLinks = myGroupsLinksTmp

    return printGroups()
}

function printGroups() {
    var list = ""

    for (var i = 0; i < myGroups.length; i++) {
        list += myGroups[i].name + "\nhttps://chat.whatsapp.com/" + myGroupsLinks[i] + "\n\n"
    }

    try {
        fs.writeFileSync("./groups.txt", list)
        return list
    } catch {
        return "I couldn't save what I did to a file, i'll try to append it here\n" + list
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

main().catch((err) => console.log(`Encountered error: ${err}`))
