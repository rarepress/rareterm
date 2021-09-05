/*****************************************
*
* - token apis
*
*   /token/build
*   /token/sign
*   /token/save
*   /token/create
*   /token/send
*   /token/files
*
* - trade apis
*
*   /trade/build
*   /trade/sign
*   /trade/save
*   /trade/create
*   /trade/send
*
* - fs apis
*
*   /fs/add
*   /fs/import
*   /fs/folder
*
*****************************************/
(() => {
  var root = this
  var Alert
  if (typeof window !== "undefined") {
    Alert = alert
  } else {
    Alert = console.error
  }
  class Thing {
    constructor(o) {
      this.host = o.host
      this.account = o.account
      this.ethereum = o.ethereum
      this.fetch = o.fetch
      this.FormData = o.FormData
    }
    async sign (message) {
      try {
        let res = await this.ethereum.request(
          {
            method: 'eth_signTypedData_v4',
            params: [ this.account, JSON.stringify(message) ],
            from: this.account
          }
        )
        return res;
      } catch (e) {
        Alert(e.message)
      }
    }
    async request(method, path, blob, type) {
      if (method === "GET") {
        let url = (path.startsWith("http") ? path : this.host + path)
        let r = await this.fetch(url).then((res) => {
          return res.json()
        })
        return r;
      } else {
        if (type === "blob") {
          let fd = new this.FormData()
          fd.append('file', blob)
          let r = await this.fetch(this.host + path, {
            method: "POST",
            body: fd
          }).then((res) => {
            return res.json()
          })
          return r
        } else {
          let r = await this.fetch(this.host + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(blob)
          }).then((res) => {
            if (res.ok) {
              return res.json()
            } else {
              return res.text().then((text) => {
                throw new Error(text)
              })
            }
          })
          return r
        }
      }
    }
  }
  class Token extends Thing {
    async init() {
      const timestamp = Date.now()  // 13 digits
      const rand = (Math.random() * Math.pow(10, 14)).toString().slice(0,11); // 11 digits
      const base = "" + timestamp + rand // 24 digits
      let bi = BigInt(this.account + base)
      return bi.toString(10)
    }
    async build (body) {
      if (!body.tokenId) {
        body = await this.initialize(body)
      }
      if (!body.creators) {
        body.creators = [{ account: this.account, value: 10000 }]
      }
      console.log("BODY", body)
      let response = await this.request("POST", "/token/build", body)
      return response
    }
    async save (body) {
      let response = await this.request("POST", "/token/save", body)
      return response
    }
    async send (body, url) {
      let response = await this.request("POST", "/token/send", [body, url])
      return response
    }
    async query (query) {
      let response = await this.request("POST", "/token/query", query)
      return response
    }
    async queryOne (query) {
      let response = await this.request("POST", "/token/queryOne", query)
      return response
    }
    async files (token) {
      let response = await this.request("POST", "/token/files", token)
      return response
    }
    async initialize(body) {
      let tokenId = await this.init()
      body.tokenId = tokenId
      if (!body.metadata.name || body.metadata.name.length === 0) body.metadata.name = ""
      if (!body.metadata.description || body.metadata.description.length === 0) body.metadata.description = ""
      if (!body.metadata.image || body.metadata.image.length === 0) body.metadata.image = ""
      return body;
    }
    async signable (body) {
      let response = await this.request("POST", "/token/signable", body)
      return response
    }
    async sign (body) {
      let signable = await this.signable(body)
      let sig = await super.sign(signable)
      if (!signable.message.signatures || signable.message.signatures.length !== signable.message.creators.length) {
        signable.message.signatures = []
        for(let i=0; i<signable.message.creators.length; i++) {
          signable.message.signatures[i] = null
        }
      }
      for(let i=0; i<signable.message.creators.length; i++) {
        let creator = signable.message.creators[i].account;
        if (creator.toLowerCase() === this.account.toLowerCase()) {
          if (signable.message.signatures) {
            if (signable.message.signatures.length == signable.message.creators.length) {
              signable.message.signatures[i] = sig
            }
          } else {
            signable.message.signatures[i] = sig
          }
        }
      }
      return this.serialize(signable)
    }
    serialize (signable) {
      const signed = {
        "@type": signable.message["@type"],
        tokenId: signable.message.tokenId,
        uri: signable.message.tokenURI,
        tokenURI: signable.message.tokenURI,
        contract: signable.message.contract,
        creators: signable.message.creators,
        royalties: signable.message.royalties,
        signatures: signable.message.signatures
      }
      if (signable.message.supply) signed.supply = signable.message.supply
      return signed
    }
    async create (body) {
      let builtToken = await this.build(body)
      let signedToken = await this.sign(builtToken)
      await this.save(signedToken)
      return signedToken
    }
  }
  /************************************
  * Rarepress File System (Nebulus)
  ************************************/
  class FS extends Thing {
    async upload(blob) {
      let response = await this.request("POST", "/fs/add", blob, "blob")
      return response.cid
    }
    async import(url) {
      let response = await this.request("POST", "/fs/import", { url })
      if (response.error) {
        throw new Error(response.error)
      } else {
        return response.cid
      }
    }
    async push(cid) {
      let response = await this.request("POST", "/fs/push", { cid })
      if (response.error) {
        throw new Error(response.error)
      } else {
        return response.cid
      }
    }
    async folder(mapping) {
      /************************
      * mapping := {
      *   <path1>: <cid1>,
      *   <path2>: <cid2>,
      *   ...
      * }
      ************************/
      let response = await this.request("POST", "/fs/folder", mapping)
      if (response.error) {
        throw new Error(response.error)
      } else {
        return response.cid
      }
    }
    async add (buf) {
      let type = buf.constructor.name;
      let cid
      if (type === 'ArrayBuffer') {
        cid = await this.upload(new Blob([buf]))
      } else if (type === "File") {
        cid = await this.upload(buf)
      } else if (type === "Blob") {
        cid = await this.upload(buf)
      } else if (type === "Buffer") {
        cid = await this.upload(buf)
      } else if (typeof buf === 'object' && typeof buf.pipe === 'function' && buf.readable !== false && typeof buf._read === "function" && typeof buf._readableState === "object") {
        // readablestream
        cid = await this.upload(buf)
      } else if (typeof buf === 'string') {
        if (buf.startsWith("http")) {
          cid = await this.import(buf)
        } else {
          cid = await this.upload(new Blob([buf], { type: "text/plain" }))
        }
      }
      return cid;
    }
  }
  class Trade extends Thing {
    async create(body) {
      let built = await this.build(body)
      let signed = await this.sign(built)
      await this.save(signed)
      return signed
    }
    async build (body) {
      if (!body.who) {
        body.who = { from: this.account }
      } else if (!body.who.from) {
        body.who.from = this.account
      }
      let built = await this.request("POST", "/trade/build", body)
      return built
    }
    async signable (body) {
      let response = await this.request("POST", "/trade/signable", body)
      return response
    }
    async sign (body) {
      let signable = await this.signable(body)
      let sig = await super.sign(signable)
      body.signature = sig
      return body
    }
    save (body) {
      return this.request("POST", "/trade/save", body)
    }
    send (body, url) {
      return this.request("POST", "/trade/send", [body, url])
    }
    async query (query) {
      let response = await this.request("POST", "/trade/query", query)
      return response
    }
    async queryOne (query) {
      let response = await this.request("POST", "/trade/queryOne", query)
      return response
    }
  }
  class Rareterm {
    async init (o) {
      if (o.ethereum) {
        this.ethereum = o.ethereum
      } else if (typeof ethereum !== "undefined") {
        this.ethereum = ethereum
      } else {
        Alert("An Ethereum wallet is required. Please install MetaMask from https://metamask.io/")
        return;
      }
      if (o.http && o.http.fetch) {
        this.fetch = o.http.fetch
      } else {
        this.fetch = fetch.bind(window)
      }
      if (o.http && o.http.FormData) {
        this.FormData = o.http.FormData
      } else {
        this.FormData = FormData
      }
      let accounts = await this.ethereum.request({ method: 'eth_requestAccounts' });
      let account = accounts[0];
      this.account = account
      if (!o) o = {host: ""}
      if (!o.host) o.host = ""
      this.host = o.host
      this.token = new Token({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
      this.fs = new FS({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
      this.trade = new Trade({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
      return account;
    }
    async sync(wallet) {
      this.ethereum = wallet.ethereum
      let accounts = await this.ethereum.request({ method: 'eth_requestAccounts' });
      let account = accounts[0];
      this.account = account
      this.token.ethereum = this.ethereum
      this.fs.ethereum = this.ethereum
      this.trade.ethereum = this.ethereum
      this.token.account = this.account
      this.fs.account = this.account
      this.trade.account = this.account
    }
  }
  if(typeof exports !== 'undefined') {
    if(typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Rareterm
    }
  } else {
    root.Rareterm = Rareterm
  }
}).call(this)
