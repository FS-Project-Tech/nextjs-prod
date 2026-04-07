const Typesense = require("typesense");
const axios = require("axios");

const client = new Typesense.Client({
  nodes: [{
    host: "owvh09nzpxs34ilqp-1.a2.typesense.net",
    port: "443",
    protocol: "https"
  }],
  apiKey: "YBxhrmgEXolXvN11Xm3fkDBxLRJH8XyV"
});

async function sync() {
  const { data } = await axios.get("https://live.joyamedicalsupplies.com.au/wp-json/custom/v1/typesense-products");

  await client.collections("products").documents().import(data);

  console.log("Synced!");
}

sync();