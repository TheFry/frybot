// Helper functions to access mongodb
const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_CONN_STRING = process.env['MONGO_CONN_STRING'] || null;


const options = {
  ca: fs.readFileSync('./ca.pem').toString('utf-8'),
  tls: true,
  auth: {
    username: 'root',
    password: 'JMdd%73&4UCSP8$KWmnh!!&U7AdwVdT9'
  },
  connectTimeoutMS: 5000
}






exports.connect = async function(connString, dbName, options) {
  connString = connString || MONGO_CONN_STRING;
  options = options || {};
  if(!connString) throw Error('mongodb: connString not provided');
  const client = new MongoClient(connString, options);
  await client.connect();
  const db = client.db(dbName);
  db.createCollection('lol');
  return client;
}

this.connect(MONGO_CONN_STRING, null, options)
  .then(() => { console.log('done') })
  .catch((err) => { console.log(err) })