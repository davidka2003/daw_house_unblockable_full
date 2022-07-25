"use strict";
const { createAlchemyWeb3 } = require("@alch/alchemy-web3")
const { initializeAlchemy, getNftsForOwner, Network } = require("@alch/alchemy-sdk")
const express = require("express")
const { v4 } = require("uuid")
const app = express()
const path = require("path")
var cors = require('cors')
const ethers = require("ethers")
const assert = require('node:assert').strict;
const { address, abi } = require("./contract.json")
/**@type {{[type:string]:{[token:string]:{content:string;content_type:"link"|"code"}}}} */
const Content = require("./content.json")
const PORT = process.env.port || process.env.PORT || 4001
const web3 = createAlchemyWeb3(
    "https://eth-mainnet.g.alchemy.com/v2/bOkx5bOqxqIdnDhGmHks3EPxwKrdJ1oj"
)
const alchemy = initializeAlchemy(
    { apiKey: "bOkx5bOqxqIdnDhGmHks3EPxwKrdJ1oj", network: Network.ETH_MAINNET }
)
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
 * @return {Promise<{type:"DAW"|"HOUSE",id:string}[]>}
 */
const fetchTokens = async (wallet) => {
    const nfts = await getNftsForOwner(alchemy, wallet, { contractAddresses: ["0xf1268733c6fb05ef6be9cf23d24436dcd6e0b35e", "0xb50acc4807a8c3126f864eb70075c6aa0a57d710"] })
    return nfts.ownedNfts.map((nft) =>
    ({
        type: nft.contract.address == "0xf1268733c6fb05ef6be9cf23d24436dcd6e0b35e" ? "DAW" : "HOUSE",
        id: nft.tokenId
    })
    )
}

/**
 * @param {{type:"DAW"|"HOUSE";id:string}[]} tokens 
 * @return {{type:"DAW"|"HOUSE";content_type:"link"|"code";content:string}[]} content
 */
const getContent = (tokens = []) => {
    /**@type {{type:"DAW"|"HOUSE";content_type:"link"|"code";content:string}[]} */
    const content = []
    for (const token of tokens) {
        // token.type == "HOUSE" &&
        const _content = Content[token.type][token.id]
        _content && content.push({ ..._content, type: token.type })
    }
    [...new Set(tokens.map(token => token.type))].forEach(type => {
        Object.keys(Content[type]).includes("*") &&
            content.push({ ...Content[type]["*"], type })
    })
    return content
}
// fetchTokens("0x3929ac0DfDA6a7dB5c72800A3071190827FDD7d4").then(getContent)
app.listen(PORT, () => console.log("Server started on port:", PORT))