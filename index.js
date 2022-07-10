"use strict";
const express = require("express")
const { v4 } = require("uuid")
const app = express()
const path = require("path")
var cors = require('cors')
const ethers = require("ethers")
const assert = require('node:assert').strict;
const { address, abi } = require("./contract.json")
const Content = require("./content.json")
app.use(express.json())
app.use(cors())
app.use(express.static(path.join(__dirname, "./build")))
class SessionMap extends Map {
    /**
     * @param {number} timeout ms
     */
    timeout = 1000 * 60 * 10
    constructor(timeout) {
        super()
        this.timeout = timeout ?? this.timeout
    }
    getNonce() {
        const nonce = v4()
        const timeout = setTimeout(
            () => this.delete(nonce),
            this.timeout
        )
        const start = Date.now()
        this.set(nonce, { estimation: () => start + this.timeout - Date.now() > 0, timeout })
        return nonce
    }
    validate(nonce, wallet, signature) {
        try {
            if (this.has(nonce)) {
                const { estimation } = this.get(nonce)
                assert(estimation(), "Nonce already estimated")
                assert(wallet == ethers.utils.verifyMessage(nonce, signature), "Invalid signature")
                this.closeSession()
                return true
            }
            throw "Invalid nonce"
        } catch (error) {
            console.log(error)
            return false
        }
    }
    closeSession(nonce) {
        if (this.has(nonce)) {
            const { timeout } = this.get(nonce)
            clearTimeout(timeout)
            this.delete(nonce)

        }
    }
}
const nonces = new SessionMap()
const provider = new ethers.providers.JsonRpcProvider(
    "https://mainnet.infura.io/v3/4c0e23f7472b44e584ed2f82215fb895",
    1
)
const contract = new ethers.Contract(
    address, abi, provider
)
app.get(
    "/nonce",
    (req, res) => {
        return res.send(
            { nonce: nonces.getNonce() }
        ).status(200)
    }
)
app.post(
    "/getcontent",
    async (req, res) => {
        try {
            const { nonce, wallet, signature } = req.body
            assert(nonces.validate(nonce, wallet, signature), "Invalid wallet")
            const tokens = await fetchTokens(wallet)
            return res.send({ content: getContent(tokens) }).status(200)
        } catch (error) {
            console.log(error)
            return res.send({ error: true, message: "Something went wrong", content: [] }).status(500)
        }
    }
)
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "./build/index.html"))
})
/**
 * @return {Promise<string[]>}
 */
const fetchTokens = async (wallet) => {
    const tokenId = (await contract.tokenId()).toNumber()
    let requestPool = []
    for (let token = 1; token < tokenId; token++) {
        if (token == 1 || token == 19) {
            continue
        }
        requestPool.push(
            contract.ownerOf(token).then(
                owner => owner == wallet ? token : undefined
            )
        )
    }
    return (await Promise.all(requestPool)).filter(e => e)
}
/**
 * @param {number[]} tokens 
 * @return {string []} content
 */
const getContent = (tokens = []) => {
    const content = []
    for (const token of tokens) {
        content.push(Content[token])
    }
    return content
}
app.listen(process.env.port || 4001, () => console.log("Server started"))